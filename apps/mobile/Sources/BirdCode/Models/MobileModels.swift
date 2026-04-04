import Foundation

enum BirdCodeDateCoding {
  private static let fractionalFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private static let basicFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter
  }()

  static func decodeDate(from decoder: Decoder) throws -> Date {
    let container = try decoder.singleValueContainer()
    let value = try container.decode(String.self)
    if let parsed = fractionalFormatter.date(from: value) ?? basicFormatter.date(from: value) {
      return parsed
    }
    throw DecodingError.dataCorruptedError(
      in: container,
      debugDescription: "Invalid ISO-8601 date: \(value)",
    )
  }

  static func encodeDate(_ date: Date, to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    let value = fractionalFormatter.string(from: date)
    try container.encode(value)
  }
}

extension JSONDecoder {
  static func birdCode() -> JSONDecoder {
    let decoder = JSONDecoder()
    decoder.dateDecodingStrategy = .custom(BirdCodeDateCoding.decodeDate(from:))
    return decoder
  }
}

extension JSONEncoder {
  static func birdCode() -> JSONEncoder {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    encoder.dateEncodingStrategy = .custom(BirdCodeDateCoding.encodeDate(_:to:))
    return encoder
  }
}

struct MobileDevice: Codable, Identifiable, Hashable {
  let id: String
  let deviceName: String
  let pairCode: String
  let pairCodeExpiresAt: Date
  let pairedAt: Date
  let lastSeenAt: Date
  let revokedAt: Date?

  enum CodingKeys: String, CodingKey {
    case id = "deviceId"
    case deviceName
    case pairCode
    case pairCodeExpiresAt
    case pairedAt
    case lastSeenAt
    case revokedAt
  }
}

struct MobileThreadSummary: Codable, Identifiable, Hashable {
  let id: String
  let projectId: String
  let projectTitle: String
  let title: String
  let statusLabel: String
  let subtitle: String
  let latestMessageAt: Date?
  let latestMessagePreview: String?
  let pendingApprovals: Int
  let updatedAt: Date
  let branch: String?
  let worktreePath: String?
}

struct MobileThreadActivityPayload: Codable, Hashable {
  let requestId: String?
  let requestKind: String?
  let requestType: String?
  let detail: String?
}

struct MobileThreadActivity: Codable, Identifiable, Hashable {
  let id: String
  let tone: String
  let kind: String
  let summary: String
  let payload: MobileThreadActivityPayload?
  let turnId: String?
  let sequence: Int?
  let createdAt: Date
}

struct MobileMessage: Codable, Identifiable, Hashable {
  let id: String
  let role: String
  let text: String
  let turnId: String?
  let streaming: Bool
  let createdAt: Date
  let updatedAt: Date
}

struct MobilePendingApproval: Identifiable, Hashable {
  let id: String
  let requestId: String
  let requestKind: String
  let summary: String
  let detail: String?
}

struct MobileLatestTurn: Codable, Hashable {
  let turnId: String
  let state: String
  let requestedAt: Date
  let startedAt: Date?
  let completedAt: Date?
  let assistantMessageId: String?
}

struct MobileSession: Codable, Hashable {
  let threadId: String
  let status: String
  let providerName: String?
  let runtimeMode: String
  let activeTurnId: String?
  let lastError: String?
  let updatedAt: Date
}

struct MobileCheckpointSummary: Codable, Identifiable, Hashable {
  var id: String { turnId }

  let turnId: String
  let checkpointTurnCount: Int
  let status: String
  let completedAt: Date
}

struct MobileProjectScript: Codable, Hashable {
  let id: String
  let name: String
  let command: String
  let icon: String
  let runOnWorktreeCreate: Bool
}

struct MobileProposedPlan: Codable, Hashable {
  let id: String
  let turnId: String?
  let planMarkdown: String
  let implementedAt: Date?
  let implementationThreadId: String?
  let createdAt: Date
  let updatedAt: Date
}

struct MobileThread: Codable, Identifiable, Hashable {
  let id: String
  let projectId: String
  let title: String
  let modelSelection: MobileModelSelection
  let runtimeMode: String
  let interactionMode: String
  let branch: String?
  let worktreePath: String?
  let latestTurn: MobileLatestTurn?
  let createdAt: Date
  let updatedAt: Date
  let archivedAt: Date?
  let deletedAt: Date?
  let messages: [MobileMessage]
  let proposedPlans: [MobileProposedPlan]
  let activities: [MobileThreadActivity]
  let checkpoints: [MobileCheckpointSummary]
  let session: MobileSession?
}

struct MobileProject: Codable, Identifiable, Hashable {
  let id: String
  let title: String
  let workspaceRoot: String
  let defaultModelSelection: MobileModelSelection?
  let scripts: [MobileProjectScript]
  let createdAt: Date
  let updatedAt: Date
  let deletedAt: Date?
}

struct MobileModelSelection: Codable, Hashable {
  let provider: String
  let model: String
}

struct MobileReadModel: Codable, Hashable {
  let snapshotSequence: Int
  let projects: [MobileProject]
  let threads: [MobileThread]
  let updatedAt: Date
}

struct MobileThreadDiff: Codable, Identifiable, Hashable {
  var id: String { threadId }

  let threadId: String
  let fromTurnCount: Int
  let toTurnCount: Int
  let diff: String
}

struct MobileDispatchResult: Codable, Hashable {
  let sequence: Int
}

struct MobileSnapshotEnvelope: Codable, Hashable {
  let snapshot: MobileReadModel
  let threadSummaries: [MobileThreadSummary]
  let device: MobileDevice
  let serverTime: Date
  let deviceToken: String?
  let paired: Bool?
}

struct MobileDispatchEnvelope: Codable, Hashable {
  let result: MobileDispatchResult
  let snapshot: MobileReadModel
  let threadSummaries: [MobileThreadSummary]
  let device: MobileDevice
}

struct MobileDiffEnvelope: Codable, Identifiable, Hashable {
  var id: String { diff.threadId }

  let diff: MobileThreadDiff
  let device: MobileDevice
}

struct MobileDevicesEnvelope: Codable, Hashable {
  let devices: [MobileDevice]
  let device: MobileDevice
}

struct MobilePairRequestBody: Codable, Hashable {
  let deviceName: String
  let desktopAuthToken: String?
}

struct BirdCodePairingPayload: Codable, Hashable {
  static let kindValue = "birdcode-pairing"
  static let versionValue = 1

  let kind: String
  let version: Int
  let serverURL: String
  let deviceToken: String?
  let deviceName: String?

  init(serverURL: String, deviceToken: String? = nil, deviceName: String? = nil) {
    kind = Self.kindValue
    version = Self.versionValue
    self.serverURL = serverURL
    self.deviceToken = deviceToken
    self.deviceName = deviceName
  }
}

enum BirdCodePairingCodec {
  static func encode(_ payload: BirdCodePairingPayload) -> String {
    guard
      let data = try? JSONEncoder.birdCode().encode(payload),
      let json = String(data: data, encoding: .utf8)
    else {
      return ""
    }

    var components = URLComponents()
    components.scheme = "birdcode"
    components.host = "pair"
    components.queryItems = [URLQueryItem(name: "payload", value: json)]
    return components.string ?? json
  }

  static func decode(_ rawValue: String) -> BirdCodePairingPayload? {
    let trimmed = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }

    if let url = URL(string: trimmed), url.scheme?.lowercased() == "birdcode" {
      return decode(from: url)
    }

    if trimmed.first == "{", trimmed.last == "}" {
      return decodeJSON(trimmed)
    }

    if let url = URL(string: trimmed), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
      return BirdCodePairingPayload(serverURL: trimmed)
    }

    return BirdCodePairingPayload(serverURL: trimmed)
  }

  static func decode(from url: URL) -> BirdCodePairingPayload? {
    let components = URLComponents(url: url, resolvingAgainstBaseURL: false)
    if let payload = components?.queryItems?.first(where: { $0.name == "payload" })?.value {
      return decodeJSON(payload)
    }

    let serverURL = components?.queryItems?.first(where: { $0.name == "serverURL" })?.value
    let deviceToken = components?.queryItems?.first(where: { $0.name == "deviceToken" })?.value
    let deviceName = components?.queryItems?.first(where: { $0.name == "deviceName" })?.value
    guard let serverURL else { return nil }
    return BirdCodePairingPayload(
      serverURL: serverURL,
      deviceToken: deviceToken,
      deviceName: deviceName,
    )
  }

  private static func decodeJSON(_ rawValue: String) -> BirdCodePairingPayload? {
    guard let data = rawValue.data(using: .utf8) else { return nil }
    let payload = try? JSONDecoder.birdCode().decode(BirdCodePairingPayload.self, from: data)
    guard payload?.kind == BirdCodePairingPayload.kindValue, payload?.version == BirdCodePairingPayload.versionValue else {
      return nil
    }
    return payload
  }
}

struct MobileRevokeRequestBody: Codable, Hashable {
  let deviceId: String
}

struct MobileStartTurnMessage: Codable, Hashable {
  let messageId: String
  let role: String
  let text: String
  let attachments: [MobileChatAttachment]
}

struct MobileChatAttachment: Codable, Hashable {
  let type: String
  let name: String
  let mimeType: String
  let sizeBytes: Int
  let dataUrl: String
}

struct MobileThreadTurnStartBootstrapCreateThread: Codable, Hashable {
  let projectId: String
  let title: String
  let modelSelection: MobileModelSelection
  let runtimeMode: String
  let interactionMode: String
  let branch: String?
  let worktreePath: String?
  let createdAt: Date
}

struct MobileThreadTurnStartBootstrapPrepareWorktree: Codable, Hashable {
  let projectCwd: String
  let baseBranch: String
  let branch: String?
}

struct MobileThreadTurnStartBootstrap: Codable, Hashable {
  let createThread: MobileThreadTurnStartBootstrapCreateThread?
  let prepareWorktree: MobileThreadTurnStartBootstrapPrepareWorktree?
  let runSetupScript: Bool?
}

struct MobileSourceProposedPlanReference: Codable, Hashable {
  let threadId: String
  let planId: String
}

struct MobileThreadTurnStartCommand: Codable, Hashable {
  let type = "thread.turn.start"
  let commandId: String
  let threadId: String
  let message: MobileStartTurnMessage
  let modelSelection: MobileModelSelection?
  let titleSeed: String?
  let runtimeMode: String
  let interactionMode: String
  let bootstrap: MobileThreadTurnStartBootstrap?
  let sourceProposedPlan: MobileSourceProposedPlanReference?
  let createdAt: Date

  enum CodingKeys: String, CodingKey {
    case type
    case commandId
    case threadId
    case message
    case modelSelection
    case titleSeed
    case runtimeMode
    case interactionMode
    case bootstrap
    case sourceProposedPlan
    case createdAt
  }
}

struct MobileApprovalRespondCommand: Codable, Hashable {
  let type = "thread.approval.respond"
  let commandId: String
  let threadId: String
  let requestId: String
  let decision: String
  let createdAt: Date

  enum CodingKeys: String, CodingKey {
    case type
    case commandId
    case threadId
    case requestId
    case decision
    case createdAt
  }
}
