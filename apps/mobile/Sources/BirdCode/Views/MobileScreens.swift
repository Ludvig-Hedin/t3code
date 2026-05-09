import CoreImage
import CoreImage.CIFilterBuiltins
import Observation
import SwiftUI
import UIKit
#if canImport(VisionKit)
import VisionKit
#endif

enum MobileTheme {
  static let accent = Color(red: 0.18, green: 0.42, blue: 0.97)
  static let background = Color(uiColor: .systemBackground)
  static let backgroundAlt = Color(uiColor: .secondarySystemBackground)
  static let card = Color(uiColor: .secondarySystemBackground)
  static let border = Color(uiColor: .separator).opacity(0.12)
  static let foreground = Color.primary
  static let muted = Color.secondary
  static let success = Color.green
  static let warning = Color.orange
  static let danger = Color.red
}

@MainActor
struct MobileRootView: View {
  var store: MobileAppStore

  var body: some View {
    ZStack {
      MobileTheme.background.ignoresSafeArea()
      if let serverURL = store.pairedServerURL {
        // Post-pairing: load the full Bird Code web app in a WKWebView.
        // The web app handles the WebSocket connection, session state, and all UI.
        MobileWebView(
          serverURL: serverURL,
          desktopAuthToken: store.pairedDesktopAuthToken,
          mobileDeviceToken: store.pairedMobileDeviceToken,
          onDisconnect: {
            store.clearSession()
          },
        )
        .ignoresSafeArea()
      } else {
        MobilePairingView(store: store)
      }
    }
    .fontDesign(.default)
    .task {
      await store.restoreSessionIfPossible()
    }
  }
}

@MainActor
struct MobilePairingView: View {
  @Bindable var store: MobileAppStore
  @State private var pairingCodeInput = ""
  @State private var isShowingScanner = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        MobileBrandHeader(
          title: "Bird Code",
          subtitle: "Pair to your desktop and keep the same workflow on iPhone.",
        )

        if let errorMessage = store.errorMessage {
          MobileBanner(
            title: bannerTitle,
            message: errorMessage,
            tint: MobileTheme.danger,
            primaryAction: primaryBannerAction,
            onDismiss: { store.clearError() },
          )
        }

        if let statusMessage = store.statusMessage {
          MobileBanner(
            title: "Status",
            message: statusMessage,
            tint: MobileTheme.success,
          )
        }

        MobileCard {
          VStack(alignment: .leading, spacing: 14) {
            MobileSectionHeading(
              title: "Pair with desktop",
              subtitle: "Scan the desktop QR or paste the pairing code from the desktop app.",
            )

            MobileField(label: "Pairing code") {
              TextField("Paste Bird Code pairing code", text: $pairingCodeInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body)
                .padding(.vertical, 12)
            }

            HStack(spacing: 10) {
              Button {
                isShowingScanner = true
              } label: {
                Label("Scan QR", systemImage: "qrcode.viewfinder")
              }
              .buttonStyle(MobileSecondaryButtonStyle())

              Button {
                Task {
                  if pairingCodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    await store.connectAndPair()
                  } else {
                    await store.importPairingCode(pairingCodeInput)
                  }
                }
              } label: {
                HStack(spacing: 10) {
                  if store.isPairing {
                    ProgressView()
                      .tint(.white)
                  } else {
                    Image(systemName: "link.circle.fill")
                      .font(.system(size: 16, weight: .semibold))
                  }
                  Text(store.isPairing ? "Pairing…" : "Pair device")
                    .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
              }
              .buttonStyle(MobilePrimaryButtonStyle())
              .disabled(store.isPairing)
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 20)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .scrollIndicators(.visible)
    // .interactively causes a main-thread freeze on iOS 17+ when a TextField
    // inside this ScrollView gains focus with @Observable driving the parent view.
    .scrollDismissesKeyboard(.immediately)
    // fullScreenCover avoids the drag-animation vs DataScannerViewController
    // camera-layer race that freezes the UI with a .sheet presentation.
    .fullScreenCover(isPresented: $isShowingScanner) {
      MobileQRCodeScannerSheet { scannedText in
        pairingCodeInput = scannedText
        isShowingScanner = false
        Task {
          await store.importPairingCode(scannedText)
        }
      }
    }
    .fontDesign(.default)
    .onAppear {
      // Trigger the iOS Local Network permission prompt now, before the user's
      // first pair attempt — otherwise the prompt only fires after a failed
      // Bonjour browse and pairing appears to silently fail.
      store.primeLocalNetworkPermission()
    }
  }

  private var bannerTitle: String {
    switch store.lastAPIError {
    case .localNetworkPermissionDenied:
      return "Local Network access needed"
    case .localNetworkUnavailable:
      return "Local network issue"
    case .desktopUnreachable:
      return "Can't reach the desktop"
    case .networkOffline:
      return "You're offline"
    default:
      return "Connection issue"
    }
  }

  private var primaryBannerAction: MobileBannerAction? {
    switch store.lastAPIError {
    case .localNetworkPermissionDenied, .localNetworkUnavailable:
      return MobileBannerAction(title: "Open Settings") {
        openAppSettings()
      }
    default:
      return nil
    }
  }

  private func openAppSettings() {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }
}

@MainActor
struct MobileSettingsSheet: View {
  @Bindable var store: MobileAppStore
  @Environment(\.dismiss) private var dismiss
  @State private var selectedTab: MobileSettingsTab = .pair
  @State private var pairingCodeInput = ""
  @State private var isShowingScanner = false

  private enum MobileSettingsTab: String, CaseIterable, Identifiable {
    case pair
    case devices
    case advanced

    var id: String { rawValue }

    var title: String {
      switch self {
      case .pair: return "Pair"
      case .devices: return "Devices"
      case .advanced: return "Advanced"
      }
    }
  }

  var body: some View {
    NavigationStack {
      VStack(alignment: .leading, spacing: 16) {
        MobileBrandHeader(
          title: "Settings",
          subtitle: "Pair other devices, review connected devices, and manage advanced connection details.",
        )

        Picker("Settings", selection: $selectedTab) {
          ForEach(MobileSettingsTab.allCases) { tab in
            Text(tab.title).tag(tab)
          }
        }
        .pickerStyle(.segmented)

        Group {
          switch selectedTab {
          case .pair:
            settingsPairTab
          case .devices:
            settingsDevicesTab
          case .advanced:
            settingsAdvancedTab
          }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 20)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
      .background(MobileTheme.background)
      .navigationTitle("Settings")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
    }
    .fontDesign(.default)
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
    // fullScreenCover avoids the drag-animation vs DataScannerViewController
    // camera-layer race that freezes the UI with a .sheet presentation.
    .fullScreenCover(isPresented: $isShowingScanner) {
      MobileQRCodeScannerSheet { scannedText in
        pairingCodeInput = scannedText
        isShowingScanner = false
        Task {
          await store.importPairingCode(scannedText)
        }
      }
    }
  }

  private var settingsPairTab: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        MobileCard {
          VStack(alignment: .leading, spacing: 14) {
            MobileSectionHeading(
              title: "Pair with desktop",
              subtitle: "Scan the desktop QR or paste the pairing code. No token hunting required.",
            )

            MobileField(label: "Pairing code or desktop URL") {
              TextField("Paste Bird Code pairing code", text: $pairingCodeInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .font(.body)
                .padding(.vertical, 12)
            }

            HStack(spacing: 10) {
              Button {
                isShowingScanner = true
              } label: {
                Label("Scan QR", systemImage: "qrcode.viewfinder")
              }
              .buttonStyle(MobileSecondaryButtonStyle())

              Button {
                Task {
                  if pairingCodeInput.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    await store.connectAndPair()
                  } else {
                    await store.importPairingCode(pairingCodeInput)
                  }
                }
              } label: {
                HStack(spacing: 10) {
                  if store.isPairing {
                    ProgressView()
                      .tint(.white)
                  } else {
                    Image(systemName: "link.circle.fill")
                      .font(.system(size: 16, weight: .semibold))
                  }
                  Text(store.isPairing ? "Pairing…" : "Pair device")
                    .fontWeight(.semibold)
                }
                .frame(maxWidth: .infinity)
              }
              .buttonStyle(MobilePrimaryButtonStyle())
              .disabled(store.isPairing)
            }

            Text("The desktop QR already carries the hidden auth token. No extra token entry is needed.")
              .font(.callout)
              .foregroundStyle(MobileTheme.muted)

            if store.deviceToken != nil {
              Button("Disconnect and clear connection") {
                store.clearSession()
              }
              .buttonStyle(MobileSmallButtonStyle(tint: MobileTheme.danger))
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .scrollIndicators(.visible)
    // Keep this in sync with the first-run pairing screen. `.interactively`
    // can freeze focus on iOS 17+ when a TextField lives inside this ScrollView.
    .scrollDismissesKeyboard(.immediately)
  }

  private var settingsDevicesTab: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        MobileCard {
          VStack(alignment: .leading, spacing: 12) {
            MobileSectionHeading(
              title: "Current connection",
              subtitle: store.pairedDevice.map { "Bird Code is paired to \($0.deviceName)." }
                ?? "No active pairing yet.",
            )

            MobileConnectionSummaryCard(store: store)
          }
        }

        MobileCard {
          VStack(alignment: .leading, spacing: 12) {
            MobileSectionHeading(
              title: "Other devices",
              subtitle: "Disconnect phones you no longer want tied to this desktop.",
            )

            if store.devices.isEmpty {
              Text("No connected devices yet.")
                .foregroundStyle(MobileTheme.muted)
            } else {
              LazyVStack(spacing: 10) {
                ForEach(store.devices) { device in
                  HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                      Text(device.deviceName)
                        .font(.headline)
                      Text("Code \(device.pairCode)")
                        .font(.caption)
                        .foregroundStyle(MobileTheme.muted)
                      Text("Seen \(device.lastSeenAt, style: .relative)")
                        .font(.caption2)
                        .foregroundStyle(MobileTheme.muted)
                    }
                    Spacer(minLength: 12)
                    if device.id == store.pairedDevice?.id {
                      MobileStatusPill(text: "Current", tint: MobileTheme.success)
                    } else {
                      Button("Disconnect") {
                        Task { await store.revokeDevice(device) }
                      }
                      .buttonStyle(MobileSmallButtonStyle(tint: MobileTheme.danger))
                    }
                  }
                  if device.id != store.devices.last?.id {
                    Divider()
                  }
                }
              }
            }
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .scrollIndicators(.visible)
    .scrollDismissesKeyboard(.interactively)
  }

  private var settingsAdvancedTab: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        MobileCard {
          VStack(alignment: .leading, spacing: 12) {
            MobileSectionHeading(
              title: "Connection",
              subtitle: "Only edit this if you need to repoint Bird Code at a protected desktop.",
            )

            MobileField(label: "Server URL") {
              TextField("http://192.168.0.10:3773", text: $store.serverURLInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .padding(.vertical, 12)
            }

            MobileField(label: "Device name") {
              TextField("iPhone", text: $store.deviceNameInput)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.vertical, 12)
            }

            DisclosureGroup("Desktop auth token") {
              MobileField(label: "Auth token") {
                SecureField("Only if your desktop asks for one", text: $store.desktopAuthTokenInput)
                  .textInputAutocapitalization(.never)
                  .autocorrectionDisabled()
                  .padding(.vertical, 12)
              }
              .padding(.top, 8)
            }

            HStack(spacing: 10) {
              Button("Save") {
                store.saveConnectionPreferences()
              }
              .buttonStyle(MobilePrimaryButtonStyle())

              Button("Refresh") {
                Task {
                  await store.refreshSnapshot()
                  await store.refreshDevices()
                }
              }
              .buttonStyle(MobileSecondaryButtonStyle())
            }
          }
        }

        MobileCard {
          VStack(alignment: .leading, spacing: 12) {
            MobileSectionHeading(
              title: "Session actions",
              subtitle: "Clear local session data if you need to reconnect cleanly.",
            )

            Button("Forget device") {
              store.clearSession()
            }
            .buttonStyle(MobileSecondaryButtonStyle())
          }
        }
      }
      .frame(maxWidth: .infinity, alignment: .topLeading)
    }
    .scrollIndicators(.visible)
    // Match pairing / devices tabs: `.interactively` can freeze TextField focus on iOS 17+.
    .scrollDismissesKeyboard(.immediately)
  }
}

private struct MobileBrandHeader: View {
  let title: String
  let subtitle: String

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      MobileLogoMark()
      VStack(alignment: .leading, spacing: 8) {
        Text(title)
          .font(.system(.title, weight: .semibold))
          .foregroundStyle(MobileTheme.foreground)
        Text(subtitle)
          .font(.subheadline)
          .foregroundStyle(MobileTheme.muted)
      }
    }
  }
}

private struct MobileLogoMark: View {
  var body: some View {
    if let image = MobileLogoLoader.image() {
      Image(uiImage: image)
        .resizable()
        .scaledToFit()
        .frame(width: 56, height: 56)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityHidden(true)
    } else {
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .fill(MobileTheme.accent)
        .frame(width: 56, height: 56)
        .overlay(
          Image(systemName: "bird.fill")
            .font(.system(size: 20, weight: .semibold))
            .foregroundStyle(.white),
        )
        .accessibilityHidden(true)
    }
  }
}

private enum MobileLogoLoader {
  static func image() -> UIImage? {
    guard let url = Bundle.main.url(forResource: "logo-dark", withExtension: "png") else { return nil }
    return UIImage(contentsOfFile: url.path)
  }
}

private struct MobileSectionHeading: View {
  let title: String
  let subtitle: String

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title)
        .font(.subheadline.weight(.semibold))
      Text(subtitle)
        .font(.caption)
        .foregroundStyle(MobileTheme.muted)
    }
  }
}

private struct MobileCard<Content: View>: View {
  let containerPadding: CGFloat
  let content: () -> Content

  init(containerPadding: CGFloat = 16, @ViewBuilder content: @escaping () -> Content) {
    self.containerPadding = containerPadding
    self.content = content
  }

  var body: some View {
    content()
      .padding(containerPadding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .fill(MobileTheme.card)
          .shadow(color: .black.opacity(0.04), radius: 10, x: 0, y: 4),
      )
      .overlay(
        RoundedRectangle(cornerRadius: 20, style: .continuous)
          .stroke(MobileTheme.border, lineWidth: 1),
      )
  }
}

private struct MobileField<Content: View>: View {
  let label: String
  let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label)
        .font(.caption)
        .foregroundStyle(MobileTheme.muted)
        .textCase(.uppercase)
        .tracking(0.8)
      content()
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 2)
        .background(MobileTheme.backgroundAlt)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 14, style: .continuous)
            .stroke(MobileTheme.border, lineWidth: 1),
        )
    }
  }
}

struct MobileBannerAction {
  let title: String
  let handler: () -> Void
}

private struct MobileBanner: View {
  let title: String
  let message: String
  let tint: Color
  var primaryAction: MobileBannerAction? = nil
  var onDismiss: (() -> Void)? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .top, spacing: 12) {
        Circle()
          .fill(tint)
          .frame(width: 8, height: 8)
          .padding(.top, 5)
        VStack(alignment: .leading, spacing: 4) {
          Text(title)
            .font(.subheadline.weight(.semibold))
          Text(message)
            .font(.callout)
            .foregroundStyle(MobileTheme.muted)
        }
        Spacer(minLength: 0)
        if let onDismiss {
          Button {
            onDismiss()
          } label: {
            Image(systemName: "xmark")
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(MobileTheme.muted)
              .padding(6)
              .contentShape(Rectangle())
          }
          .buttonStyle(.plain)
          .accessibilityLabel("Dismiss")
        }
      }

      if let action = primaryAction {
        HStack {
          Spacer(minLength: 0)
          Button(action.title, action: action.handler)
            .buttonStyle(MobilePrimaryButtonStyle())
        }
      }
    }
    .padding(12)
    .background(tint.opacity(0.1))
    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 16, style: .continuous)
        .stroke(tint.opacity(0.15), lineWidth: 1),
    )
  }
}

private struct MobileConnectionSummaryCard: View {
  @Bindable var store: MobileAppStore

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 4) {
            Text(store.pairedDevice?.deviceName ?? "Desktop session")
              .font(.subheadline.weight(.semibold))
            Text(store.serverURLInput.isEmpty ? "No desktop server configured" : store.serverURLInput)
              .font(.caption)
              .foregroundStyle(MobileTheme.muted)
          }
          Spacer(minLength: 12)
          MobileStatusPill(
            text: connectionStateText,
            tint: connectionStateTint,
          )
        }

        HStack(alignment: .center, spacing: 14) {
          QRCodeView(
            payload: store.pairingShareCode() ?? store.serverURLInput,
            label: "Current Bird Code connection",
          )
          .frame(width: 76, height: 76)

          VStack(alignment: .leading, spacing: 8) {
            MobileMetaRow(
              label: "Last seen",
              value: store.pairedDevice.map { relativeDateString($0.lastSeenAt) } ?? "Unknown",
            )
            MobileMetaRow(
              label: "Pair code",
              value: store.lastPairCode ?? "Unavailable",
            )
          }
        }

        if store.deviceToken != nil {
          Button("Disconnect") {
            store.clearSession()
          }
          .buttonStyle(MobileSmallButtonStyle(tint: MobileTheme.danger))
        }
      }
    }
  }

  private var connectionStateText: String {
    if store.pairedDevice == nil {
      if store.deviceToken == nil {
        return "Not paired"
      }
      return store.isRefreshing ? "Syncing" : "Reconnecting"
    }
    return store.isRefreshing ? "Syncing" : "Connected"
  }

  private var connectionStateTint: Color {
    if store.pairedDevice == nil {
      return store.deviceToken == nil ? MobileTheme.muted : MobileTheme.warning
    }
    return store.isRefreshing ? MobileTheme.warning : MobileTheme.success
  }
}

private struct MobileMetaRow: View {
  let label: String
  let value: String

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(label)
        .font(.caption)
        .foregroundStyle(MobileTheme.muted)
        .textCase(.uppercase)
        .tracking(0.6)
      Spacer(minLength: 12)
      Text(value)
        .font(.subheadline)
        .foregroundStyle(MobileTheme.foreground)
        .multilineTextAlignment(.trailing)
    }
  }
}

private struct MobileStatusPill: View {
  let text: String
  let tint: Color

  var body: some View {
    Text(text)
      .font(.caption.weight(.semibold))
      .foregroundStyle(tint)
      .padding(.horizontal, 10)
      .padding(.vertical, 6)
      .background(tint.opacity(0.12))
      .clipShape(Capsule(style: .continuous))
  }
}

private struct MobileEmptyStateCard: View {
  let title: String
  let subtitle: String
  let symbol: String

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        Image(systemName: symbol)
          .font(.system(size: 28, weight: .semibold))
          .foregroundStyle(MobileTheme.accent)
        Text(title)
          .font(.headline)
        Text(subtitle)
          .font(.callout)
          .foregroundStyle(MobileTheme.muted)
      }
    }
  }
}

struct MobilePrimaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.callout.weight(.semibold))
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .foregroundStyle(.white)
      .background(MobileTheme.accent.opacity(configuration.isPressed ? 0.85 : 1))
      .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.snappy(duration: 0.18), value: configuration.isPressed)
  }
}

struct MobileSecondaryButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.callout.weight(.semibold))
      .padding(.horizontal, 14)
      .padding(.vertical, 10)
      .foregroundStyle(MobileTheme.foreground)
      .background(MobileTheme.backgroundAlt.opacity(configuration.isPressed ? 0.92 : 1))
      .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
      .overlay(
        RoundedRectangle(cornerRadius: 14, style: .continuous)
          .stroke(MobileTheme.border, lineWidth: 1),
      )
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
      .animation(.snappy(duration: 0.18), value: configuration.isPressed)
  }
}

private struct MobileSmallButtonStyle: ButtonStyle {
  let tint: Color

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.caption.weight(.semibold))
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .foregroundStyle(tint)
      .background(tint.opacity(configuration.isPressed ? 0.16 : 0.12))
      .clipShape(Capsule(style: .continuous))
      .overlay(
        Capsule(style: .continuous)
          .stroke(tint.opacity(0.2), lineWidth: 1),
      )
  }
}

private struct QRCodeView: View {
  let payload: String
  let label: String
  @State private var renderedImage: Image?
  @State private var renderedPayload: String = ""

  var body: some View {
    VStack(spacing: 8) {
      if let renderedImage {
        renderedImage
          .resizable()
          .interpolation(.none)
          .scaledToFit()
          .padding(12)
          .background(Color.white)
          .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(MobileTheme.border, lineWidth: 1),
          )
      } else {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(Color.white)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .overlay(
            ProgressView()
              .tint(MobileTheme.accent),
          )
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(MobileTheme.border, lineWidth: 1),
          )
      }
      Text(label)
        .font(.caption2)
        .foregroundStyle(MobileTheme.muted)
        .multilineTextAlignment(.center)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(label)
    .task(id: payload) {
      guard renderedPayload != payload else {
        return
      }
      renderedPayload = payload
      renderedImage = Self.makeQRCodeImage(from: payload)
    }
  }

  private static func makeQRCodeImage(from payload: String) -> Image? {
    guard let data = payload.data(using: .utf8) else {
      return nil
    }

    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(data, forKey: "inputMessage")
    filter.correctionLevel = "M"

    guard let output = filter.outputImage else {
      return nil
    }

    let transformed = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    let context = CIContext(options: nil)
    guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else {
      return nil
    }
    return Image(decorative: cgImage, scale: 1, orientation: .up)
  }
}

#if canImport(VisionKit)
private struct MobileQRCodeScannerSheet: View {
  let onScan: (String) -> Void
  @Environment(\.dismiss) private var dismiss
  @State private var startupErrorMessage: String?

  var body: some View {
    NavigationStack {
      Group {
        if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
          ZStack {
            MobileQRCodeScannerView(
              onScan: onScan,
              onStartupError: { message in
                startupErrorMessage = message
              },
            )
            .ignoresSafeArea()

            if let startupErrorMessage {
              VStack {
                Spacer()
                Text(startupErrorMessage)
                  .font(.callout)
                  .foregroundStyle(.white)
                  .multilineTextAlignment(.center)
                  .padding(12)
                  .background(.black.opacity(0.7))
                  .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                  .padding(.horizontal, 24)
                  .padding(.bottom, 32)
              }
            }
          }
        } else {
          VStack(spacing: 16) {
            MobileEmptyStateCard(
              title: "Camera scanning isn’t available here",
              subtitle: "Use the pairing code field on the previous screen or open Bird Code on a device with camera access.",
              symbol: "qrcode.viewfinder",
            )

            Button("Close") {
              dismiss()
            }
            .buttonStyle(MobilePrimaryButtonStyle())
          }
          .padding(16)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .background(MobileTheme.background)
        }
      }
      .navigationTitle("Scan QR")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
    }
    .presentationDetents([.large])
    .presentationDragIndicator(.visible)
  }
}

private struct MobileQRCodeScannerView: UIViewControllerRepresentable {
  let onScan: (String) -> Void
  var onStartupError: ((String) -> Void)? = nil

  func makeCoordinator() -> Coordinator {
    Coordinator(onScan: onScan)
  }

  func makeUIViewController(context: Context) -> DataScannerViewController {
    let controller = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .balanced,
      recognizesMultipleItems: false,
      isHighFrameRateTrackingEnabled: false,
      isHighlightingEnabled: true,
    )
    controller.delegate = context.coordinator
    context.coordinator.controller = controller
    let onStartupError = onStartupError
    DispatchQueue.main.async {
      do {
        try controller.startScanning()
      } catch {
        onStartupError?(error.localizedDescription)
      }
    }
    return controller
  }

  func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {}

  static func dismantleUIViewController(
    _ uiViewController: DataScannerViewController,
    coordinator: Coordinator,
  ) {
    uiViewController.stopScanning()
    coordinator.controller = nil
  }

  @MainActor
  final class Coordinator: NSObject, DataScannerViewControllerDelegate {
    var controller: DataScannerViewController?
    private var isResolved = false
    private let onScan: (String) -> Void

    init(onScan: @escaping (String) -> Void) {
      self.onScan = onScan
    }

    func dataScanner(
      _ dataScanner: DataScannerViewController,
      didAdd addedItems: [RecognizedItem],
      allItems: [RecognizedItem],
    ) {
      guard !isResolved else { return }
      for item in addedItems {
        guard case let .barcode(barcode) = item, let payload = barcode.payloadStringValue, !payload.isEmpty else {
          continue
        }
        isResolved = true
        dataScanner.stopScanning()
        onScan(payload)
        break
      }
    }
  }
}
#endif

private func relativeDateString(_ date: Date) -> String {
  let formatter = RelativeDateTimeFormatter()
  formatter.unitsStyle = .short
  return formatter.localizedString(for: date, relativeTo: Date())
}
