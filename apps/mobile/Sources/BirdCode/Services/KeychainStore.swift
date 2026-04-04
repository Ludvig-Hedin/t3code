import Foundation
import Security

enum KeychainStore {
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

  static func writeString(_ value: String, account: String) {
    let data = Data(value.utf8)
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
    ]
    let attributes: [String: Any] = [
      kSecValueData as String: data,
    ]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecItemNotFound {
      var insert = query
      insert[kSecValueData as String] = data
      _ = SecItemAdd(insert as CFDictionary, nil)
      return
    }
    if updateStatus != errSecSuccess {
      _ = SecItemDelete(query as CFDictionary)
      var insert = query
      insert[kSecValueData as String] = data
      _ = SecItemAdd(insert as CFDictionary, nil)
    }
  }

  static func deleteString(account: String) {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrAccount as String: account,
    ]
    _ = SecItemDelete(query as CFDictionary)
  }
}

