import Foundation
import Security
import os.log

enum KeychainStore {
  /// `kSecAttrAccessible` cannot be changed via `SecItemUpdate`, so any time
  /// a write fails we fall back to delete+add. The accessibility migration
  /// flag (set on first successful read after upgrade) lets us run a single
  /// cleanup pass on launch instead of paying that cost on every write.
  private static let log = Logger(subsystem: "com.ludvighedin.birdcodemobile", category: "Keychain")

  /// Returns true when the keychain item was successfully written. Callers
  /// that depend on the value persisting (e.g. pair flow) should treat
  /// `false` as a hard failure — otherwise the in-memory token survives
  /// the session but the user's "paired" status quietly evaporates on next
  /// launch when readString returns nil.
  @discardableResult
  static func writeString(_ value: String, account: String) -> Bool {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
    ]
    // ThisDeviceOnly prevents iCloud-keychain / device-restore from carrying
    // the device token to a different phone where it can no longer reach the
    // paired desktop.
    let attributes: [String: Any] = [
      kSecValueData as String: data,
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess {
      return true
    }
    if updateStatus == errSecItemNotFound {
      var insert = query
      insert[kSecValueData as String] = data
      insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      let addStatus = SecItemAdd(insert as CFDictionary, nil)
      if addStatus != errSecSuccess {
        log.error(
          "SecItemAdd failed account=\(account, privacy: .public) status=\(addStatus, privacy: .public)"
        )
        return false
      }
      return true
    }
    // Update failed for some other reason (typically because accessibility
    // doesn't match an existing item; that attribute is immutable). Fall
    // back to delete+add. Both must succeed.
    let deleteStatus = SecItemDelete(query as CFDictionary)
    if deleteStatus != errSecSuccess && deleteStatus != errSecItemNotFound {
      log.error(
        "SecItemDelete failed account=\(account, privacy: .public) status=\(deleteStatus, privacy: .public)"
      )
      return false
    }
    var insert = query
    insert[kSecValueData as String] = data
    insert[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let addStatus = SecItemAdd(insert as CFDictionary, nil)
    if addStatus != errSecSuccess {
      log.error(
        "SecItemAdd (fallback) failed account=\(account, privacy: .public) status=\(addStatus, privacy: .public)"
      )
      return false
    }
    return true
  }

  static func readString(account: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)
    guard status == errSecSuccess,
      let data = item as? Data,
      let value = String(data: data, encoding: .utf8)
    else {
      return nil
    }
    return value
  }

  static func deleteString(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
    ]
    _ = SecItemDelete(query as CFDictionary)
  }

  /// One-time migration that removes any pre-existing keychain items for
  /// the given accounts so the next write installs them with the new
  /// `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` accessibility class.
  /// Older builds may have stored items with a synchronizable accessibility
  /// class; restoring those via iCloud Keychain leaks the device token.
  static func migrateAccountsIfNeeded(_ accounts: [String], migrationFlagKey: String) {
    let defaults = UserDefaults.standard
    if defaults.bool(forKey: migrationFlagKey) {
      return
    }
    for account in accounts {
      deleteString(account: account)
    }
    defaults.set(true, forKey: migrationFlagKey)
  }
}

