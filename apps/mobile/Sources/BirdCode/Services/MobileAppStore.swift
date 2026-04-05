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
  }

  private let apiClient: MobileAPIClient

  var serverURLInput: String
  var desktopAuthTokenInput: String = ""
  var deviceNameInput: String
  var pairedDevice: MobileDevice?
  var snapshot: MobileReadModel?
  var threadSummaries: [MobileThreadSummary] = []
  var selectedThreadID: String?
  var draftMessage: String = ""
  var diffEnvelope: MobileDiffEnvelope?
  var devices: [MobileDevice] = []
  var isPairing = false
  var isRefreshing = false
  var isLoadingDiff = false
  var errorMessage: String?
  var statusMessage: String?
  var lastPairCode: String?

  @ObservationIgnored private var refreshTask: Task<Void, Never>?
  @ObservationIgnored private(set) var deviceToken: String?

  init(apiClient: MobileAPIClient = MobileAPIClient()) {
    self.apiClient = apiClient
    self.serverURLInput = UserDefaults.standard.string(forKey: StorageKey.serverURL) ?? ""
    self.deviceNameInput = UserDefaults.standard.string(forKey: StorageKey.deviceName)
      ?? UIDevice.current.name
    self.deviceToken = KeychainStore.readString(account: StorageKey.deviceToken)
    if let token = self.deviceToken, !token.isEmpty {
      self.lastPairCode = KeychainStore.readString(account: StorageKey.pairCode)
    }
  }

  var hasPairedSession: Bool {
    deviceToken != nil
  }

  var isConnected: Bool {
    hasPairedSession
  }

  var selectedThread: MobileThread? {
    guard let snapshot else { return nil }
    if let selectedThreadID {
      return snapshot.threads.first { $0.id == selectedThreadID }
    }
    return snapshot.threads.first
  }

  var selectedSummary: MobileThreadSummary? {
    guard let selectedThreadID else { return threadSummaries.first }
    return threadSummaries.first { $0.id == selectedThreadID }
  }

  var selectedPendingApprovals: [MobilePendingApproval] {
    guard let selectedThread else { return [] }
    return pendingApprovals(for: selectedThread)
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
    if !serverURLInput.isEmpty, deviceToken != nil {
      errorMessage = nil
      await refreshSnapshot()
      await refreshDevices()
      startPolling()
    }
  }

  func saveConnectionPreferences() {
    UserDefaults.standard.set(serverURLInput, forKey: StorageKey.serverURL)
    UserDefaults.standard.set(deviceNameInput, forKey: StorageKey.deviceName)
  }

  func connectAndPair() async {
    guard let baseURL = normalizeServerURL(serverURLInput) else {
      errorMessage = MobileAPIClientError.invalidURL.localizedDescription
      return
    }

    isPairing = true
    errorMessage = nil
    defer { isPairing = false }

    do {
      let response = try await apiClient.pair(
        baseURL: baseURL,
        deviceName: deviceNameInput,
        desktopAuthToken: desktopAuthTokenInput.isEmpty ? nil : desktopAuthTokenInput,
      )
      if let deviceToken = response.deviceToken {
        self.deviceToken = deviceToken
        KeychainStore.writeString(deviceToken, account: StorageKey.deviceToken)
        KeychainStore.writeString(response.device.pairCode, account: StorageKey.pairCode)
        lastPairCode = response.device.pairCode
      }
      applySnapshotEnvelope(response)
      errorMessage = nil
      saveConnectionPreferences()
      statusMessage = "Paired with \(response.device.deviceName)"
      await refreshDevices()
      startPolling()
    } catch {
      errorMessage = error.localizedDescription
    }
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
      errorMessage = MobileAPIClientError.invalidURL.localizedDescription
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
      await refreshSnapshot()
      await refreshDevices()
      startPolling()
      errorMessage = nil
      statusMessage = "Imported pairing code."
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
      errorMessage = error.localizedDescription
    }
  }

  func sendPrompt() async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      errorMessage = MobileAPIClientError.missingDeviceToken.localizedDescription
      return
    }
    guard let thread = selectedThread else {
      errorMessage = "Select a thread first."
      return
    }
    let trimmedMessage = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmedMessage.isEmpty else {
      errorMessage = "Write a prompt before sending."
      return
    }

    statusMessage = nil
    errorMessage = nil
    do {
      let command = MobileThreadTurnStartCommand(
        commandId: UUID().uuidString,
        threadId: thread.id,
        message: MobileStartTurnMessage(
          messageId: UUID().uuidString,
          role: "user",
          text: trimmedMessage,
          attachments: [],
        ),
        modelSelection: thread.modelSelection,
        titleSeed: thread.title,
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        bootstrap: nil,
        sourceProposedPlan: nil,
        createdAt: Date(),
      )
      let response = try await apiClient.dispatch(
        baseURL: baseURL,
        deviceToken: deviceToken,
        command: command,
      )
      applySnapshotEnvelope(
        MobileSnapshotEnvelope(
          snapshot: response.snapshot,
          threadSummaries: response.threadSummaries,
          device: response.device,
          serverTime: Date(),
          deviceToken: nil,
          paired: nil,
        ),
      )
      draftMessage = ""
      errorMessage = nil
      statusMessage = "Prompt sent to \(thread.title)"
      await refreshDevices()
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func respondToApproval(requestId: String, decision: String) async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      errorMessage = MobileAPIClientError.missingDeviceToken.localizedDescription
      return
    }
    guard let thread = selectedThread else {
      errorMessage = "Select a thread first."
      return
    }

    do {
      let command = MobileApprovalRespondCommand(
        commandId: UUID().uuidString,
        threadId: thread.id,
        requestId: requestId,
        decision: decision,
        createdAt: Date(),
      )
      let response = try await apiClient.dispatch(
        baseURL: baseURL,
        deviceToken: deviceToken,
        command: command,
      )
      applySnapshotEnvelope(
        MobileSnapshotEnvelope(
          snapshot: response.snapshot,
          threadSummaries: response.threadSummaries,
          device: response.device,
          serverTime: Date(),
          deviceToken: nil,
          paired: nil,
        ),
      )
      errorMessage = nil
      statusMessage = "Approval updated."
      await refreshDevices()
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  func loadDiff(for thread: MobileThread) async {
    guard let baseURL = normalizeServerURL(serverURLInput), let deviceToken else {
      errorMessage = MobileAPIClientError.missingDeviceToken.localizedDescription
      return
    }

    let turnCount = thread.checkpoints.last?.checkpointTurnCount ?? 0
    guard turnCount > 0 else {
      errorMessage = "No checkpoint diff is available yet."
      return
    }

    isLoadingDiff = true
    defer { isLoadingDiff = false }

    do {
      diffEnvelope = try await apiClient.fetchDiff(
        baseURL: baseURL,
        deviceToken: deviceToken,
        threadId: thread.id,
        toTurnCount: turnCount,
      )
    } catch {
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
      errorMessage = error.localizedDescription
    }
  }

  func selectThread(id: String) {
    selectedThreadID = id
  }

  func clearSession() {
    errorMessage = nil
    statusMessage = nil
    deviceToken = nil
    snapshot = nil
    threadSummaries = []
    pairedDevice = nil
    selectedThreadID = nil
    diffEnvelope = nil
    devices = []
    lastPairCode = nil
    desktopAuthTokenInput = ""
    stopPolling()
    KeychainStore.deleteString(account: StorageKey.deviceToken)
    KeychainStore.deleteString(account: StorageKey.pairCode)
  }

  func clearError() {
    errorMessage = nil
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

    if let clientError = error as? MobileAPIClientError,
      case .localNetworkUnavailable = clientError
    {
      return true
    }

    return false
  }

  private func startPolling() {
    stopPolling()
    guard deviceToken != nil else {
      return
    }
    refreshTask = Task { [weak self] in
      guard let self else { return }
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(4))
        await self.refreshSnapshot()
      }
    }
  }

  private func stopPolling() {
    refreshTask?.cancel()
    refreshTask = nil
  }

  private func pendingApprovals(for thread: MobileThread) -> [MobilePendingApproval] {
    var openByRequestId: [String: MobilePendingApproval] = [:]
    let orderedActivities = thread.activities.sorted {
      if let leftSequence = $0.sequence, let rightSequence = $1.sequence, leftSequence != rightSequence {
        return leftSequence < rightSequence
      }
      if $0.sequence != nil {
        return false
      }
      if $1.sequence != nil {
        return true
      }
      if $0.createdAt != $1.createdAt {
        return $0.createdAt < $1.createdAt
      }
      return $0.id < $1.id
    }

    for activity in orderedActivities {
      let payload = activity.payload
      let requestId = payload?.requestId
      let requestKind = (payload?.requestKind ?? requestKindFromRequestType(payload?.requestType))
      let detail = payload?.detail

      if activity.kind == "approval.requested", let requestId, let requestKind {
        openByRequestId[requestId] = MobilePendingApproval(
          id: requestId,
          requestId: requestId,
          requestKind: requestKind,
          summary: activity.summary,
          detail: detail,
        )
        continue
      }

      if activity.kind == "approval.resolved", let requestId {
        openByRequestId.removeValue(forKey: requestId)
        continue
      }

      if
        activity.kind == "provider.approval.respond.failed",
        let requestId,
        isStalePendingRequestFailureDetail(detail)
      {
        openByRequestId.removeValue(forKey: requestId)
      }
    }

    return openByRequestId.values.sorted { left, right in
      left.id < right.id
    }
  }

  private func requestKindFromRequestType(_ requestType: String?) -> String? {
    switch requestType {
    case "command_execution_approval", "exec_command_approval":
      return "command"
    case "file_read_approval":
      return "file-read"
    case "file_change_approval", "apply_patch_approval":
      return "file-change"
    default:
      return nil
    }
  }

  private func isStalePendingRequestFailureDetail(_ detail: String?) -> Bool {
    guard let detail = detail?.lowercased() else { return false }
    return detail.contains("stale pending approval request") ||
      detail.contains("stale pending user-input request") ||
      detail.contains("unknown pending approval request") ||
      detail.contains("unknown pending permission request") ||
      detail.contains("unknown pending user-input request")
  }
}
