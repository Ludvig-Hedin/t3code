import Foundation

enum MobileAPIClientError: Error, LocalizedError {
  case invalidURL
  case invalidResponse
  case httpStatus(Int, String)
  case missingDeviceToken

  var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "The desktop server URL is invalid."
    case .invalidResponse:
      return "The server returned an unreadable response."
    case .httpStatus(let status, let message):
      return "Server error \(status): \(message)"
    case .missingDeviceToken:
      return "Pair the app with a desktop server first."
    }
  }
}

final class MobileAPIClient {
  private let session: URLSession
  private let encoder = JSONEncoder.t3Mobile()
  private let decoder = JSONDecoder.t3Mobile()

  init(session: URLSession = .shared) {
    self.session = session
  }

  func pair(
    baseURL: URL,
    deviceName: String,
    desktopAuthToken: String?,
  ) async throws -> MobileSnapshotEnvelope {
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

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileAPIClientError.invalidResponse
    }
    guard (200...299).contains(httpResponse.statusCode) else {
      let message = String(data: data, encoding: .utf8) ?? "Unknown error"
      throw MobileAPIClientError.httpStatus(httpResponse.statusCode, message)
    }
    return try decoder.decode(Response.self, from: data)
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

    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw MobileAPIClientError.invalidResponse
    }
    guard (200...299).contains(httpResponse.statusCode) else {
      let message = String(data: data, encoding: .utf8) ?? "Unknown error"
      throw MobileAPIClientError.httpStatus(httpResponse.statusCode, message)
    }
    return try decoder.decode(Response.self, from: data)
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
