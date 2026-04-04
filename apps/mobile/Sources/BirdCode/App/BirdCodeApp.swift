import SwiftUI

@main
struct BirdCodeApp: App {
  @State private var store = MobileAppStore()

  var body: some Scene {
    WindowGroup {
      MobileRootView(store: store)
    }
  }
}
