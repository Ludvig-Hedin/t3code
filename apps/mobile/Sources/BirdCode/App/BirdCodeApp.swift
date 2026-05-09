import SwiftUI

@main
struct BirdCodeApp: App {
  @State private var store: MobileAppStore

  init() {
    // Migrate keychain accounts to the new
    // `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` accessibility class
    // before any reads happen. iOS doesn't allow `SecItemUpdate` to change
    // accessibility, so an item written by an older build coexists silently
    // until it's deleted; without this migration, restored phones could
    // surface an iCloud-synced device token.
    KeychainStore.migrateAccountsIfNeeded(
      [
        "birdcode.mobile.deviceToken",
        "birdcode.mobile.pairCode",
        "birdcode.mobile.desktopAuthToken",
      ],
      migrationFlagKey: "birdcode.mobile.keychainMigratedV1",
    )
    _store = State(wrappedValue: MobileAppStore())
  }

  var body: some Scene {
    WindowGroup {
      MobileRootView(store: store)
        .onOpenURL { url in
          // Only handle pairing deep links registered under the birdcode:// scheme
          // (CFBundleURLTypes in Info.plist). Anything else is silently ignored
          // so the app doesn't react to unrelated universal-link callbacks.
          guard url.scheme?.lowercased() == "birdcode" else { return }
          guard BirdCodePairingCodec.decode(from: url) != nil else { return }
          // Re-route through the same string-based importer used by the QR scanner
          // and pasted-code path so all pairing entry points share validation.
          Task {
            await store.importPairingCode(url.absoluteString)
          }
        }
    }
  }
}
