import Foundation
import Network

enum MobileAPIClientError: Error, LocalizedError, Equatable {
  case invalidURL
  case invalidResponse
  case invalidResponseBody(String)
  case httpStatus(Int, String)
  case missingDeviceToken
  case localNetworkPermissionDenied
  case desktopUnreachable(host: String, detail: String)
  case networkOffline(String)
  case atsBlocked(String)

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "Paste a desktop QR or a full server address like http://192.168.0.10:3773."
    case .invalidResponse:
      return "The server returned an unreadable response."
    case .invalidResponseBody(let body):
      return "The server returned an unexpected response: \(body)"
    case .httpStatus(let status, let message):
      return "Server error \(status): \(message)"
    case .missingDeviceToken:
      return "Pair Bird Code from the settings screen first."
    case .localNetworkPermissionDenied:
      return "Bird Code needs Local Network access to reach your desktop on Wi-Fi. Tap Open Settings, turn on Local Network, then pair again."
    case .desktopUnreachable(let host, let detail):
      return "Can't reach the desktop at \(host). Make sure Bird Code is running on the Mac and that both devices are on the same Wi-Fi. (\(detail))"
    case .networkOffline(let detail):
      return "You appear to be offline. Check Wi-Fi and try again. (\(detail))"
    case .atsBlocked(let detail):
      return "iOS blocked the connection for transport security reasons. This is a build configuration bug — rebuild Bird Code with updated Info.plist. (\(detail))"
    }
  }

  /// True if the error represents a transient network problem that should not
  /// be treated as a revoked session or surfaced as an error banner on paired
  /// screens. The WKWebView will retry on its own.
  var isTransientNetworkIssue: Bool {
    switch self {
    case .localNetworkPermissionDenied, .desktopUnreachable, .networkOffline:
      return true
    default:
      return false
    }
  }
}

final class MobileAPIClient {
  private let session: URLSession
  private let encoder = JSONEncoder.birdCode()
  private let decoder = JSONDecoder.birdCode()

  init(session: URLSession = .shared) {
    self.session = session
  }

  func pair(
    baseURL: URL,
    deviceName: String,
    desktopAuthToken: String?,
  ) async throws -> MobilePairResponse {
    let body = MobilePairRequestBody(deviceName: deviceName, desktopAuthToken: desktopAuthToken)
    return try await post(baseURL: baseURL, path: "/api/mobile/pair", deviceToken: nil, body: body)
  }

  func fetchSnapshot(baseURL: URL, deviceToken: String) async throws -> MobileSnapshotEnvelope {
    try await get(baseURL: baseURL, path: "/api/mobile/snapshot", deviceToken: deviceToken)
  }

  func dispatch<Body: Encodable>(
    baseURL: URL,
    deviceToken: String,
    command: Body,
  ) async throws -> MobileDispatchEnvelope {
    try await post(baseURL: baseURL, path: "/api/mobile/dispatch", deviceToken: deviceToken, body: command)
  }

  func fetchDiff(
    baseURL: URL,
    deviceToken: String,
    threadId: String,
    toTurnCount: Int,
    fromTurnCount: Int? = nil,
  ) async throws -> MobileDiffEnvelope {
    var components = URLComponents(url: baseURL.appending(path: "/api/mobile/diff"), resolvingAgainstBaseURL: false)
    components?.queryItems = [
      URLQueryItem(name: "threadId", value: threadId),
      URLQueryItem(name: "toTurnCount", value: String(toTurnCount)),
    ] + (fromTurnCount.map { [URLQueryItem(name: "fromTurnCount", value: String($0))] } ?? [])
    guard let url = components?.url else {
      throw MobileAPIClientError.invalidURL
    }
    return try await perform(url: url, method: "GET", deviceToken: deviceToken)
  }

  func listDevices(baseURL: URL, deviceToken: String) async throws -> MobileDevicesEnvelope {
    try await get(baseURL: baseURL, path: "/api/mobile/devices", deviceToken: deviceToken)
  }

  func revokeDevice(
    baseURL: URL,
    deviceToken: String,
    deviceId: String,
  ) async throws -> MobileDevicesEnvelope {
    let body = MobileRevokeRequestBody(deviceId: deviceId)
    return try await post(baseURL: baseURL, path: "/api/mobile/devices/revoke", deviceToken: deviceToken, body: body)
  }

  private func get<Response: Decodable>(
    baseURL: URL,
    path: String,
    deviceToken: String,
  ) async throws -> Response {
    guard let url = URL(string: path, relativeTo: baseURL) else {
      throw MobileAPIClientError.invalidURL
    }
    return try await perform(url: url, method: "GET", deviceToken: deviceToken)
  }

  private func post<Body: Encodable, Response: Decodable>(
    baseURL: URL,
    path: String,
    deviceToken: String?,
    body: Body,
  ) async throws -> Response {
    guard let url = URL(string: path, relativeTo: baseURL) else {
      throw MobileAPIClientError.invalidURL
    }
    return try await perform(url: url, method: "POST", deviceToken: deviceToken, body: body)
  }

  private func perform<Response: Decodable>(
    url: URL,
    method: String,
    deviceToken: String?,
  ) async throws -> Response {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let deviceToken {
      request.setValue("Bearer \(deviceToken)", forHTTPHeaderField: "Authorization")
    }

    do {
      let (data, response) = try await session.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        throw MobileAPIClientError.invalidResponse
      }
      guard (200...299).contains(httpResponse.statusCode) else {
        let message = String(data: data, encoding: .utf8) ?? "Unknown error"
        throw MobileAPIClientError.httpStatus(httpResponse.statusCode, message)
      }
      do {
        return try decoder.decode(Response.self, from: data)
      } catch {
        let snippet = decodeBodySnippet(from: data)
        throw MobileAPIClientError.invalidResponseBody(snippet)
      }
    } catch let urlError as URLError {
      throw Self.classifyURLError(urlError, url: url)
    }
  }

  private func perform<Body: Encodable, Response: Decodable>(
    url: URL,
    method: String,
    deviceToken: String?,
    body: Body,
  ) async throws -> Response {
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    if let deviceToken {
      request.setValue("Bearer \(deviceToken)", forHTTPHeaderField: "Authorization")
    }

    request.httpBody = try encoder.encode(AnyEncodable(body))

    do {
      let (data, response) = try await session.data(for: request)
      guard let httpResponse = response as? HTTPURLResponse else {
        throw MobileAPIClientError.invalidResponse
      }
      guard (200...299).contains(httpResponse.statusCode) else {
        let message = String(data: data, encoding: .utf8) ?? "Unknown error"
        throw MobileAPIClientError.httpStatus(httpResponse.statusCode, message)
      }
      do {
        return try decoder.decode(Response.self, from: data)
      } catch {
        let snippet = decodeBodySnippet(from: data)
        throw MobileAPIClientError.invalidResponseBody(snippet)
      }
    } catch let urlError as URLError {
      throw Self.classifyURLError(urlError, url: url)
    }
  }

  private static func classifyURLError(_ urlError: URLError, url: URL) -> Error {
    let host = url.host ?? "the desktop"
    let detail = urlError.localizedDescription
    switch urlError.code {
    case .notConnectedToInternet:
      return MobileAPIClientError.networkOffline(detail)
    case .appTransportSecurityRequiresSecureConnection:
      return MobileAPIClientError.atsBlocked(detail)
    case .cannotConnectToHost,
         .timedOut,
         .networkConnectionLost,
         .cannotFindHost,
         .dnsLookupFailed,
         .resourceUnavailable:
      return MobileAPIClientError.desktopUnreachable(host: host, detail: detail)
    default:
      return urlError
    }
  }

  private func decodeBodySnippet(from data: Data) -> String {
    guard let text = String(data: data, encoding: .utf8) else {
      return "response body could not be decoded as UTF-8"
    }
    let collapsed = text
      .replacingOccurrences(of: "\n", with: " ")
      .replacingOccurrences(of: "\t", with: " ")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if collapsed.count <= 240 {
      return collapsed.isEmpty ? "empty response body" : collapsed
    }
    let prefix = collapsed.prefix(240)
    return "\(prefix)…"
  }
}

private struct AnyEncodable: Encodable {
  private let encodeClosure: (Encoder) throws -> Void

  init<T: Encodable>(_ wrapped: T) {
    self.encodeClosure = wrapped.encode
  }

  func encode(to encoder: Encoder) throws {
    try encodeClosure(encoder)
  }
}

/// Result of probing iOS 14+ Local Network permission via `NWBrowser`.
///
/// iOS does not reliably show the Local Network permission prompt for a plain
/// `URLSession` request to a LAN IP — starting an `NWBrowser` for a declared
/// Bonjour service does. We use this both to trigger the prompt proactively on
/// first launch and to distinguish a denied permission from a genuinely
/// unreachable desktop when the pair request fails.
enum LocalNetworkAuthorization {
  case authorized
  case denied
  case unknown
}

@MainActor
enum LocalNetworkProbe {
  /// Starts an `NWBrowser` to force iOS to evaluate Local Network permission.
  ///
  /// - On first call: iOS shows the permission prompt. `.ready` after Allow,
  ///   `.failed(.dns(-65570))` after Deny.
  /// - On subsequent calls: the browser resolves to the cached decision.
  ///
  /// The probe uses the `_birdcode._tcp` Bonjour type declared in the app's
  /// `NSBonjourServices` — the type doesn't have to match any real service for
  /// permission purposes.
  static func probe(timeout: TimeInterval = 3) async -> LocalNetworkAuthorization {
    await withCheckedContinuation { (continuation: CheckedContinuation<LocalNetworkAuthorization, Never>) in
      let params = NWParameters()
      params.includePeerToPeer = true
      let browser = NWBrowser(for: .bonjour(type: "_birdcode._tcp", domain: nil), using: params)
      let resolver = ProbeResolver(continuation: continuation, browser: browser)

      browser.stateUpdateHandler = { state in
        switch state {
        case .ready:
          resolver.resolve(.authorized)
        case .failed(let error):
          resolver.resolve(Self.authorization(from: error))
        case .waiting(let error):
          if case .authorized = Self.authorization(from: error) {
            // Keep waiting — transient dns setup.
          } else if case .denied = Self.authorization(from: error) {
            resolver.resolve(.denied)
          }
        case .cancelled:
          resolver.resolve(.unknown)
        case .setup:
          break
        @unknown default:
          break
        }
      }

      browser.start(queue: .main)

      DispatchQueue.main.asyncAfter(deadline: .now() + timeout) {
        // If the user hasn't dismissed the system prompt yet, treat it as
        // unknown so pairing can still proceed and let URLSession run.
        resolver.resolve(.unknown)
      }
    }
  }

  nonisolated private static func authorization(from error: NWError) -> LocalNetworkAuthorization {
    // kDNSServiceErr_PolicyDenied = -65570 — user denied Local Network access.
    if case .dns(let code) = error, Int32(code) == -65570 {
      return .denied
    }
    return .authorized
  }

  /// Tiny actor-like wrapper that guarantees the continuation is resumed
  /// exactly once across the several `NWBrowser` state updates + timeout.
  private final class ProbeResolver: @unchecked Sendable {
    private var resolved = false
    private let continuation: CheckedContinuation<LocalNetworkAuthorization, Never>
    private let browser: NWBrowser
    private let lock = NSLock()

    init(
      continuation: CheckedContinuation<LocalNetworkAuthorization, Never>,
      browser: NWBrowser,
    ) {
      self.continuation = continuation
      self.browser = browser
    }

    func resolve(_ result: LocalNetworkAuthorization) {
      lock.lock()
      defer { lock.unlock() }
      guard !resolved else { return }
      resolved = true
      browser.cancel()
      continuation.resume(returning: result)
    }
  }
}
