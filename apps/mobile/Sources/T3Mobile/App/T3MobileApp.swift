import SwiftUI

@main
struct T3MobileApp: App {
  @State private var store = MobileAppStore()

  var body: some Scene {
    WindowGroup {
      MobileRootView(store: store)
    }
  }
}

