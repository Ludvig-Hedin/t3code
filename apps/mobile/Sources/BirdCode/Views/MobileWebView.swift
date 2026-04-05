import SwiftUI
import UIKit
import WebKit

/// MobileWebView — loads the Bird Code web app inside a WKWebView.
///
/// After pairing the Swift app has a serverURL and a desktopAuthToken.
/// We inject `window.__BC_WS_TOKEN__` before page load so the web app's
/// `resolveServerUrl()` can append `?token=xxx` to the WebSocket connection URL.
///
/// The webview fills the entire screen. iOS safe-area insets are handled
/// by the web app's CSS (body[data-mobile-webview] + env(safe-area-inset-*)).
@MainActor
struct MobileWebView: View {
  let serverURL: URL
  let desktopAuthToken: String?
  /// The mobile device token (from `/api/mobile/pair`). Injected as
  /// `window.__BC_MOBILE_DEVICE_TOKEN__` so the web app can call
  /// `/api/mobile/heartbeat` to keep `lastSeenAt` alive on the desktop.
  let mobileDeviceToken: String?
  var onDisconnect: () -> Void

  @State private var loadState: LoadState = .loading
  @State private var webViewRef: WKWebView?

  private enum LoadState {
    case loading
    case loaded
    case failed(String)
  }

  var body: some View {
    ZStack {
      WebViewRepresentable(
        serverURL: serverURL,
        desktopAuthToken: desktopAuthToken,
        mobileDeviceToken: mobileDeviceToken,
        onLoadFinished: {
          loadState = .loaded
        },
        onLoadFailed: { message in
          loadState = .failed(message)
        },
        webViewRef: $webViewRef
      )

      switch loadState {
      case .loading:
        // Shown while the web app HTML is loading over the local network.
        Color(uiColor: .systemBackground)
          .ignoresSafeArea()
          .overlay(
            VStack(spacing: 16) {
              ProgressView()
                .scaleEffect(1.4)
                .tint(MobileTheme.accent)
              Text("Connecting to desktop…")
                .font(.subheadline)
                .foregroundStyle(MobileTheme.muted)
            }
          )

      case .loaded:
        EmptyView()

      case .failed(let message):
        // Shown when the webview cannot reach the desktop server. Provides
        // retry and disconnect actions so the user is never stuck.
        Color(uiColor: .systemBackground)
          .ignoresSafeArea()
          .overlay(
            VStack(spacing: 24) {
              Image(systemName: "wifi.slash")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(MobileTheme.muted)
              VStack(spacing: 8) {
                Text("Can't reach the desktop")
                  .font(.headline)
                Text(message)
                  .font(.callout)
                  .foregroundStyle(MobileTheme.muted)
                  .multilineTextAlignment(.center)
              }
              HStack(spacing: 12) {
                Button("Retry") {
                  loadState = .loading
                  // reload() is a no-op after didFailProvisionalNavigation because
                  // the webview has no committed document to reload. Use load(_:)
                  // with the original request to start fresh navigation instead.
                  let request = URLRequest(
                    url: serverURL,
                    cachePolicy: .reloadIgnoringLocalCacheData,
                    timeoutInterval: 15
                  )
                  webViewRef?.load(request)
                }
                .buttonStyle(MobilePrimaryButtonStyle())

                Button("Disconnect") {
                  onDisconnect()
                }
                .buttonStyle(MobileSecondaryButtonStyle())
              }
            }
            .padding(32)
          )
      }
    }
  }
}

// MARK: - UIViewRepresentable bridge

@MainActor
private struct WebViewRepresentable: UIViewRepresentable {
  let serverURL: URL
  let desktopAuthToken: String?
  let mobileDeviceToken: String?
  let onLoadFinished: () -> Void
  let onLoadFailed: (String) -> Void
  @Binding var webViewRef: WKWebView?

  func makeCoordinator() -> Coordinator {
    Coordinator(onLoadFinished: onLoadFinished, onLoadFailed: onLoadFailed)
  }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()

    // Build a single injection script with all tokens that the web app needs.
    // __BC_WS_TOKEN__           — desktop auth token for WebSocket authentication
    // __BC_MOBILE_DEVICE_TOKEN__ — mobile device token for /api/mobile/heartbeat
    var injections: [String] = []
    func escape(_ s: String) -> String {
      s.replacingOccurrences(of: "\\", with: "\\\\")
       .replacingOccurrences(of: "\"", with: "\\\"")
    }
    if let tok = desktopAuthToken, !tok.isEmpty {
      injections.append("window.__BC_WS_TOKEN__ = \"\(escape(tok))\";")
    }
    if let tok = mobileDeviceToken, !tok.isEmpty {
      injections.append("window.__BC_MOBILE_DEVICE_TOKEN__ = \"\(escape(tok))\";")
    }
    if !injections.isEmpty {
      let script = WKUserScript(
        source: injections.joined(separator: "\n"),
        injectionTime: .atDocumentStart,
        forMainFrameOnly: false
      )
      config.userContentController.addUserScript(script)
    }

    let webView = WKWebView(frame: .zero, configuration: config)
    webView.navigationDelegate = context.coordinator
    // Let the web app's CSS control all safe-area insets via env() variables.
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.isOpaque = false
    webView.backgroundColor = .clear

    let request = URLRequest(
      url: serverURL,
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 15
    )
    webView.load(request)

    DispatchQueue.main.async {
      self.webViewRef = webView
    }

    return webView
  }

  func updateUIView(_ uiView: WKWebView, context: Context) {}

  static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
    uiView.stopLoading()
    uiView.navigationDelegate = nil
    coordinator.webView = nil
  }

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    weak var webView: WKWebView?
    private let onLoadFinished: () -> Void
    private let onLoadFailed: (String) -> Void

    init(
      onLoadFinished: @escaping () -> Void,
      onLoadFailed: @escaping (String) -> Void
    ) {
      self.onLoadFinished = onLoadFinished
      self.onLoadFailed = onLoadFailed
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
      self.webView = webView
      onLoadFinished()
    }

    func webView(
      _ webView: WKWebView,
      didFail navigation: WKNavigation!,
      withError error: Error
    ) {
      let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
      onLoadFailed(message)
    }

    func webView(
      _ webView: WKWebView,
      didFailProvisionalNavigation navigation: WKNavigation!,
      withError error: Error
    ) {
      let nsError = error as NSError
      // -999 is NSURLErrorCancelled — happens on redirect, not a real failure.
      guard nsError.code != NSURLErrorCancelled else { return }
      let message = (error as? URLError)?.localizedDescription ?? error.localizedDescription
      onLoadFailed(message)
    }

    // Allow all navigations — the desktop server may serve sub-routes.
    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationAction: WKNavigationAction,
      decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
      decisionHandler(.allow)
    }

    func webView(
      _ webView: WKWebView,
      decidePolicyFor navigationResponse: WKNavigationResponse,
      decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
      decisionHandler(.allow)
    }
  }
}
