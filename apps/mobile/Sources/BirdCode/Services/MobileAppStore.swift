import Foundation
import Observation
import UIKit

@MainActor
@Observable
final class MobileAppStore {
  private enum StorageKey {
    static let serverURL = "birdcode.mobile.serverURL"
    static let deviceToken = "birdcode.mobile.deviceToken"
    static let deviceName = "birdcode.mobile.deviceName"
    static let pairCode = "birdcode.mobile.pairCode"
    static let lastSnapshot = "birdcode.mobile.lastSnapshot"
    /// Persisted so WKWebView can inject window.__BC_WS_TOKEN__ after app restarts.
    static let desktopAuthToken = "birdcode.mobile.desktopAuthToken"
    /// Stable 4-char base36 suffix appended to a generic UIDevice.current.name
    /// (e.g. "iPhone") so the server's deviceName-based dedupe doesn't collide
    /// when two default-named iPhones pair against the same desktop.
    static let deviceNameSuffix = "com.birdcode.deviceNameSuffix"
  }

  private let apiClient: MobileAPIClient

  var serverURLInput: String
  var desktopAuthTokenInput: String = ""
  var deviceNameInput: String
  var pairedDevice: MobileDevice?
  var snapshot: MobileReadModel?
  var threadSummaries: [MobileThreadSummary] = []
  var selectedThreadID: String?
  var devices: [MobileDevice] = []
  var isPairing = false
  var isRefreshing = false
  var errorMessage: String?
  /// The last API error surfaced to the UI. When this is
  /// `.localNetworkPermissionDenied` the pairing UI shows an "Open Settings"
  /// button so the user can grant Local Network access in one tap.
  var lastAPIError: MobileAPIClientError?
  var statusMessage: String?
  var lastPairCode: String?

  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  /// Tracks whether we've already kicked off a Local Network permission probe
  /// this launch. iOS only shows the system prompt the first time an app does
  /// a Bonjour browse, so we want to fire it as soon as the user opens the
  /// pairing screen — but only once per launch.
  @ObservationIgnored private var didPrimeLocalNetworkPermission = false
  // NOT @ObservationIgnored — deviceToken must be observable so hasPairedSession
  // and pairedServerURL (computed from it) trigger SwiftUI re-renders on change.
  private(set) var deviceToken: String?

  init(apiClient: MobileAPIClient = MobileAPIClient()) {
    self.apiClient = apiClient
    self.serverURLInput = UserDefaults.standard.string(forKey: StorageKey.serverURL) ?? ""
    self.deviceNameInput = UserDefaults.standard.string(forKey: StorageKey.deviceName)
      ?? Self.defaultDeviceName()
    self.deviceToken = KeychainStore.readString(account: StorageKey.deviceToken)
    // Restore desktopAuthToken so WKWebView can inject __BC_WS_TOKEN__ after an app restart.
    self.desktopAuthTokenInput = KeychainStore.readString(account: StorageKey.desktopAuthToken) ?? ""
    if let token = self.deviceToken, !token.isEmpty {
      self.lastPairCode = KeychainStore.readString(account: StorageKey.pairCode)
    }
  }

  var hasPairedSession: Bool {
    deviceToken != nil
  }

  /// The resolved server URL for the WKWebView once the device is paired.
  var pairedServerURL: URL? {
    guard hasPairedSession else { return nil }
    return normalizeServerURL(serverURLInput)
  }

  /// The desktop auth token to inject into WKWebView as window.__BC_WS_TOKEN__.
  var pairedDesktopAuthToken: String? {
    desktopAuthTokenInput.isEmpty ? nil : desktopAuthTokenInput
  }

  /// The mobile device token to inject into WKWebView as window.__BC_MOBILE_DEVICE_TOKEN__.
  /// Used by the web app to call /api/mobile/heartbeat so the desktop sees "Live now".
  var pairedMobileDeviceToken: String? {
    deviceToken
  }

  var isConnected: Bool {
    hasPairedSession
  }

  func normalizeServerURL(_ rawValue: String) -> URL? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    let rawURL = trimmed.contains("://") ? trimmed : "http://\(trimmed)"
    guard let url = URL(string: rawURL) else { return nil }
    return url
  }

  func pairingSharePayload() -> BirdCodePairingPayload? {
    guard let baseURL = normalizeServerURL(serverURLInput) else {
      return nil
    }
    return BirdCodePairingPayload(
      serverURL: baseURL.absoluteString,
      deviceToken: deviceToken,
      deviceName: deviceNameInput,
    )
  }

  func pairingShareCode() -> String? {
    guard let payload = pairingSharePayload() else {
      return nil
    }
    let encoded = BirdCodePairingCodec.encode(payload)
    return encoded.isEmpty ? nil : encoded
  }

  func restoreSessionIfPossible() async {
    // The WKWebView owns the WebSocket connection and handles reconnection automatically.
    // Nothing to do here — pairedServerURL drives the routing to MobileWebView on launch.
  }

  /// Proactively triggers iOS's Local Network permission prompt by starting a
  /// short-lived Bonjour browse. iOS won't surface the prompt until the app
  /// actually attempts a local-network discovery, so calling this when the
  /// pairing UI appears means the user can grant access *before* their first
  /// pair attempt — instead of seeing it fail silently. Gated to once per
  /// launch; the result is intentionally discarded.
  func primeLocalNetworkPermission() {
    guard !didPrimeLocalNetworkPermission else { return }
    didPrimeLocalNetworkPermission = true
    Task {
      _ = await LocalNetworkProbe.probe(timeout: 1)
    }
  }

  func saveConnectionPreferences() {
    UserDefaults.standard.set(serverURLInput, forKey: StorageKey.serverURL)
    UserDefaults.standard.set(deviceNameInput, forKey: StorageKey.deviceName)
  }

  func connectAndPair() async {
    guard let baseURL = normalizeServerURL(serverURLInput) else {
      setError(.invalidURL)
      return
    }

    isPairing = true
    errorMessage = nil
    lastAPIError = nil
    defer { isPairing = false }

    do {
      let response = try await apiClient.pair(
        baseURL: baseURL,
        deviceName: deviceNameInput,
        desktopAuthToken: desktopAuthTokenInput.isEmpty ? nil : desktopAuthTokenInput,
      )
      // Write to the keychain BEFORE setting the in-memory token so a write
      // failure aborts pairing instead of leaving an orphaned in-memory
      // session that vanishes on next launch.
      let tokenWritten = KeychainStore.writeString(
        response.deviceToken,
        account: StorageKey.deviceToken,
      )
      guard tokenWritten else {
        errorMessage =
          "Couldn't save the pairing token to the keychain. Make sure the device is unlocked and try again."
        lastAPIError = nil
        return
      }
      self.deviceToken = response.deviceToken
      KeychainStore.writeString(response.device.pairCode, account: StorageKey.pairCode)
      lastPairCode = response.device.pairCode
      pairedDevice = response.device
      // Persist desktopAuthToken so WKWebView can inject it as __BC_WS_TOKEN__ after restart.
      if !desktopAuthTokenInput.isEmpty {
        KeychainStore.writeString(desktopAuthTokenInput, account: StorageKey.desktopAuthToken)
      }
      errorMessage = nil
      lastAPIError = nil
      saveConnectionPreferences()
      // Refresh server-side device list and snapshot so the Devices tab is
      // populated immediately after pairing instead of showing
      // "No connected devices yet" until the user manually pulls to refresh.
      await refreshDevices()
      await refreshSnapshot()
      // Navigation to MobileWebView is driven by hasPairedSession becoming true.
    } catch {
      if shouldRecheckLocalNetworkPermission(after: error) {
        let recheck = await LocalNetworkProbe.probe(timeout: 1)
        if recheck == .denied {
          setError(.localNetworkPermissionDenied)
          return
        }
      }
      setError(error)
    }
  }

  private func setError(_ error: Error) {
    if let apiError = error as? MobileAPIClientError {
      lastAPIError = apiError
      errorMessage = apiError.localizedDescription
    } else {
      lastAPIError = nil
      errorMessage = error.localizedDescription
    }
  }

  private func setError(_ apiError: MobileAPIClientError) {
    lastAPIError = apiError
    errorMessage = apiError.localizedDescription
  }

  func importPairingCode(_ rawValue: String) async {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      errorMessage = "Paste a Bird Code QR or a desktop server URL."
      return
    }

    guard let payload = BirdCodePairingCodec.decode(trimmed) else {
      errorMessage = "That code is not a valid Bird Code pairing link."
      return
    }

    if let baseURL = normalizeServerURL(payload.serverURL) {
      serverURLInput = baseURL.absoluteString
    } else {
      setError(.invalidURL)
      return
    }

    if let deviceName = payload.deviceName, !deviceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      deviceNameInput = deviceName
    }

    if let desktopAuthToken = payload.desktopAuthToken,
       !desktopAuthToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    {
      desktopAuthTokenInput = desktopAuthToken
    }

    saveConnectionPreferences()

    if let deviceToken = payload.deviceToken, !deviceToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      self.deviceToken = deviceToken
      KeychainStore.writeString(deviceToken, account: StorageKey.deviceToken)
      if let deviceName = payload.deviceName, !deviceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        KeychainStore.writeString(deviceName, account: StorageKey.deviceName)
      }
      // Persist desktopAuthToken so WKWebView injection survives restarts.
      if !desktopAuthTokenInput.isEmpty {
        KeychainStore.writeString(desktopAuthTokenInput, account: StorageKey.desktopAuthToken)
      }
      errorMessage = nil
      lastAPIError = nil
      // Same as connectAndPair — load server-side device list + snapshot so
      // the Devices tab isn't blank when the user navigates there.
      await refreshDevices()
      await refreshSnapshot()
      // Navigation to MobileWebView is driven by hasPairedSession becoming true.
      return
    }

    await connectAndPair()
  }

  func refreshSnapshot() async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      return
    }

    isRefreshing = true
    defer { isRefreshing = false }

    do {
      let response = try await apiClient.fetchSnapshot(baseURL: baseURL, deviceToken: deviceToken)
      applySnapshotEnvelope(response)
      errorMessage = nil
      saveConnectionPreferences()
    } catch {
      if shouldSuppressConnectedNetworkIssue(error) {
        statusMessage = "Connected. Waiting for desktop."
        errorMessage = nil
        return
      }
      if handleSessionRevocation(error) {
        return
      }
      errorMessage = error.localizedDescription
    }
  }

  func refreshDevices() async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      return
    }

    do {
      let response = try await apiClient.listDevices(baseURL: baseURL, deviceToken: deviceToken)
      devices = response.devices
      pairedDevice = response.device
      errorMessage = nil
    } catch {
      if shouldSuppressConnectedNetworkIssue(error) {
        statusMessage = "Connected. Waiting for desktop."
        errorMessage = nil
        return
      }
      if handleSessionRevocation(error) {
        return
      }
      errorMessage = error.localizedDescription
    }
  }

  func revokeDevice(_ device: MobileDevice) async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      errorMessage = MobileAPIClientError.missingDeviceToken.localizedDescription
      return
    }

    do {
      let response = try await apiClient.revokeDevice(
        baseURL: baseURL,
        deviceToken: deviceToken,
        deviceId: device.id,
      )
      devices = response.devices
      pairedDevice = response.device
      if device.id == response.device.id {
        self.deviceToken = nil
        KeychainStore.deleteString(account: StorageKey.deviceToken)
        KeychainStore.deleteString(account: StorageKey.pairCode)
        snapshot = nil
        threadSummaries = []
        selectedThreadID = nil
        stopPolling()
      }
      errorMessage = nil
    } catch {
      if handleSessionRevocation(error) {
        return
      }
      errorMessage = error.localizedDescription
    }
  }

  func clearSession() {
    errorMessage = nil
    lastAPIError = nil
    statusMessage = nil
    deviceToken = nil
    snapshot = nil
    threadSummaries = []
    pairedDevice = nil
    selectedThreadID = nil
    devices = []
    lastPairCode = nil
    desktopAuthTokenInput = ""
    stopPolling()
    KeychainStore.deleteString(account: StorageKey.deviceToken)
    KeychainStore.deleteString(account: StorageKey.pairCode)
    KeychainStore.deleteString(account: StorageKey.desktopAuthToken)
    UserDefaults.standard.removeObject(forKey: StorageKey.lastSnapshot)
  }

  func clearError() {
    errorMessage = nil
    lastAPIError = nil
  }

  private func applySnapshotEnvelope(_ envelope: MobileSnapshotEnvelope) {
    snapshot = envelope.snapshot
    threadSummaries = envelope.threadSummaries
    pairedDevice = envelope.device
    lastPairCode = envelope.device.pairCode
    if selectedThreadID == nil {
      selectedThreadID = envelope.threadSummaries.first?.id
    } else if let currentSelectedThreadID = selectedThreadID,
      !envelope.threadSummaries.contains(where: { $0.id == currentSelectedThreadID })
    {
      selectedThreadID = envelope.threadSummaries.first?.id
    }
  }

  private func shouldSuppressConnectedNetworkIssue(_ error: Error) -> Bool {
    guard hasPairedSession else {
      return false
    }

    if let clientError = error as? MobileAPIClientError, clientError.isTransientNetworkIssue {
      return true
    }

    return false
  }

  private func shouldRecheckLocalNetworkPermission(after error: Error) -> Bool {
    switch error as? MobileAPIClientError {
    case .desktopUnreachable, .localNetworkUnavailable:
      return true
    default:
      return false
    }
  }

  private func handleSessionRevocation(_ error: Error) -> Bool {
    guard shouldTreatAsRevokedSession(error) else {
      return false
    }
    clearSession()
    errorMessage = "This device was disconnected from the desktop. Pair again to continue."
    return true
  }

  private func shouldTreatAsRevokedSession(_ error: Error) -> Bool {
    guard case let MobileAPIClientError.httpStatus(status, _) = error else {
      return false
    }
    return status == 401
  }

  private func stopPolling() {
    refreshTask?.cancel()
    refreshTask = nil
  }

  /// Returns a device name suitable for the initial `deviceNameInput`. When
  /// `UIDevice.current.name` is generic on iOS 16+ (exactly "iPhone", "iPad",
  /// or empty), append a stable 4-char base36 suffix so the server's
  /// deviceName-based dedupe doesn't collide between two default-named
  /// devices. The suffix is persisted in UserDefaults and reused across
  /// launches. User edits to the field are preserved by the caller — this
  /// only runs when no saved deviceName exists yet.
  private static func defaultDeviceName() -> String {
    let raw = UIDevice.current.name.trimmingCharacters(in: .whitespacesAndNewlines)
    let isGeneric = raw.isEmpty || raw == "iPhone" || raw == "iPad"
    guard isGeneric else { return raw.isEmpty ? "iPhone" : raw }
    let suffix = persistedDeviceNameSuffix()
    let base = raw.isEmpty ? "iPhone" : raw
    return "\(base) (\(suffix))"
  }

  private static func persistedDeviceNameSuffix() -> String {
    if let existing = UserDefaults.standard.string(forKey: StorageKey.deviceNameSuffix),
       !existing.isEmpty
    {
      return existing
    }
    let alphabet = Array("0123456789abcdefghijklmnopqrstuvwxyz")
    let suffix = String((0..<4).compactMap { _ in alphabet.randomElement() })
    UserDefaults.standard.set(suffix, forKey: StorageKey.deviceNameSuffix)
    return suffix
  }

}
