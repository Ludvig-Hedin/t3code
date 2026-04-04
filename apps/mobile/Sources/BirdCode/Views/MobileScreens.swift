import CoreImage
import CoreImage.CIFilterBuiltins
import Observation
import SwiftUI
import UIKit

enum MobileTheme {
  static let accent = Color(red: 0.18, green: 0.42, blue: 0.97)
  static let accentSoft = Color(red: 0.18, green: 0.42, blue: 0.97).opacity(0.12)
  static let background = Color(uiColor: .systemGroupedBackground)
  static let backgroundAlt = Color(uiColor: .secondarySystemGroupedBackground)
  static let card = Color(uiColor: .systemBackground)
  static let border = Color.black.opacity(0.08)
  static let foreground = Color.primary
  static let muted = Color.secondary
  static let success = Color.green
  static let warning = Color.orange
  static let danger = Color.red

  static let backgroundGradient = LinearGradient(
    colors: [
      background,
      accentSoft,
      background,
    ],
    startPoint: .topLeading,
    endPoint: .bottomTrailing,
  )
}

@MainActor
struct MobileRootView: View {
  var store: MobileAppStore

  var body: some View {
    ZStack {
      MobileTheme.backgroundGradient.ignoresSafeArea()
      if store.isConnected {
        MobileShellView(store: store)
      } else {
        MobilePairingView(store: store)
      }
    }
    .task {
      await store.restoreSessionIfPossible()
    }
  }
}

@MainActor
struct MobilePairingView: View {
  @Bindable var store: MobileAppStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 18) {
        MobileBrandHeader(
          title: "Bird Code",
          subtitle: "Pair your desktop session and keep the same workflow on iPhone.",
        )

        if let errorMessage = store.errorMessage {
          MobileBanner(
            title: "Connection issue",
            message: errorMessage,
            tint: MobileTheme.danger,
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
              title: "Pairing",
              subtitle: "Enter the server URL from the desktop app, then pair this device.",
            )

            MobileField(label: "Desktop server URL") {
              TextField("http://192.168.0.10:3773", text: $store.serverURLInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
                .textContentType(.URL)
                .padding(.vertical, 12)
            }

            MobileField(label: "Desktop auth token") {
              SecureField("Optional auth token", text: $store.desktopAuthTokenInput)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.vertical, 12)
            }

            MobileField(label: "Device name") {
              TextField("iPhone", text: $store.deviceNameInput)
                .textInputAutocapitalization(.words)
                .autocorrectionDisabled()
                .padding(.vertical, 12)
            }

            Button {
              Task {
                await store.connectAndPair()
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
                Text(store.isPairing ? "Pairing…" : "Pair with desktop")
                  .fontWeight(.semibold)
              }
              .frame(maxWidth: .infinity)
            }
            .buttonStyle(MobilePrimaryButtonStyle())
            .disabled(store.isPairing)
          }
        }

        MobileCard {
          VStack(alignment: .leading, spacing: 14) {
            MobileSectionHeading(
              title: "QR and short code",
              subtitle: "Scan or share this pairing payload when you want a faster reconnect path.",
            )

            HStack(alignment: .center, spacing: 16) {
              QRCodeView(
                payload: pairingPayload,
                label: "Bird Code pairing QR",
              )
              .frame(width: 144, height: 144)

              VStack(alignment: .leading, spacing: 8) {
                Text("Short code")
                  .font(.caption)
                  .foregroundStyle(MobileTheme.muted)
                  .textCase(.uppercase)
                  .tracking(0.8)
                Text(store.lastPairCode ?? "Awaiting pair")
                  .font(.system(.title2, design: .rounded, weight: .semibold))
                Text("The desktop keeps execution authority. This phone only sends commands and reads state.")
                  .font(.callout)
                  .foregroundStyle(MobileTheme.muted)
              }
            }
          }
        }

        MobileCard {
          VStack(alignment: .leading, spacing: 12) {
            MobileSectionHeading(
              title: "What this app does",
              subtitle: "It mirrors the desktop session, review flow, and approval path.",
            )
            ForEach([
              "Chat with the active thread and send prompts.",
              "Review diffs, approvals, and turn activity.",
              "Keep the desktop as the only execution host.",
              "Reconnect cleanly after app restart or network loss.",
            ], id: \.self) { item in
              MobileBulletRow(text: item)
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 20)
    }
  }

  private var pairingPayload: String {
    let server = store.serverURLInput.trimmingCharacters(in: .whitespacesAndNewlines)
    let device = store.deviceNameInput.trimmingCharacters(in: .whitespacesAndNewlines)
    let token = store.desktopAuthTokenInput.trimmingCharacters(in: .whitespacesAndNewlines)
    let parts = [server, device, token].filter { !$0.isEmpty }
    return parts.isEmpty ? "Bird Code" : parts.joined(separator: "\n")
  }
}

@MainActor
struct MobileShellView: View {
  @Bindable var store: MobileAppStore
  @State private var isShowingSettings = false

  var body: some View {
    NavigationSplitView {
      MobileSidebarView(store: store)
        .navigationSplitViewColumnWidth(min: 280, ideal: 320)
    } detail: {
      if let thread = store.selectedThread {
        MobileThreadDetailView(store: store, thread: thread)
      } else {
        MobileEmptyThreadDetailView()
      }
    }
    .navigationSplitViewStyle(.balanced)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button {
          Task { await store.refreshSnapshot() }
        } label: {
          Image(systemName: "arrow.clockwise")
        }
        .accessibilityLabel("Refresh session")

        Button {
          isShowingSettings = true
        } label: {
          Image(systemName: "gearshape")
        }
        .accessibilityLabel("Open settings")
      }
    }
    .sheet(isPresented: $isShowingSettings) {
      MobileSettingsSheet(store: store)
    }
    .sheet(item: $store.diffEnvelope) { envelope in
      MobileDiffSheet(envelope: envelope)
    }
  }
}

@MainActor
struct MobileSidebarView: View {
  @Bindable var store: MobileAppStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 16) {
        MobileBrandHeader(
          title: "Threads",
          subtitle: store.pairedDevice.map { "Connected to \($0.deviceName)" } ?? "Connected desktop session",
        )

        MobileConnectionSummaryCard(store: store)

        if let statusMessage = store.statusMessage {
          MobileBanner(title: "Status", message: statusMessage, tint: MobileTheme.success)
        }

        if let errorMessage = store.errorMessage {
          MobileBanner(title: "Error", message: errorMessage, tint: MobileTheme.danger)
        }

        if store.threadSummaries.isEmpty {
          MobileEmptyStateCard(
            title: "No active threads",
            subtitle: "Start a turn from the desktop or pair with a server that already has threads.",
            symbol: "bubble.left.and.bubble.right",
          )
        } else {
          LazyVStack(spacing: 10) {
            ForEach(store.threadSummaries) { summary in
              MobileThreadSummaryCard(
                summary: summary,
                isSelected: store.selectedThreadID == summary.id,
              ) {
                store.selectThread(id: summary.id)
              }
            }
          }
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 20)
    }
    .background(MobileTheme.background)
  }
}

@MainActor
struct MobileThreadDetailView: View {
  @Bindable var store: MobileAppStore
  let thread: MobileThread

  var body: some View {
    VStack(spacing: 0) {
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 16) {
            MobileThreadHeader(thread: thread, summary: store.selectedSummary)

            if !store.selectedPendingApprovals.isEmpty {
              MobilePendingApprovalsCard(store: store)
            }

            MobileMessagesCard(thread: thread)

            MobileActivitiesCard(thread: thread)

            MobileThreadMetaCard(thread: thread)

            if store.isLoadingDiff {
              MobileCard {
                HStack(spacing: 12) {
                  ProgressView()
                  Text("Loading diff…")
                    .foregroundStyle(MobileTheme.muted)
                }
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 20)
          .padding(.bottom, 8)
        }
        .onChange(of: thread.messages.count) { _, _ in
          guard let lastMessage = thread.messages.last else { return }
          withAnimation(.snappy(duration: 0.25)) {
            proxy.scrollTo(lastMessage.id, anchor: .bottom)
          }
        }
      }

      MobileComposerCard(
        draftMessage: $store.draftMessage,
        isSendingEnabled: !store.draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
        onSend: {
          Task {
            await store.sendPrompt()
          }
        },
        onDiff: {
          Task {
            await store.loadDiff(for: thread)
          }
        },
      )
    }
    .background(MobileTheme.background)
    .toolbar {
      ToolbarItemGroup(placement: .topBarLeading) {
        VStack(alignment: .leading, spacing: 4) {
          Text(thread.title)
            .font(.system(.title2, design: .rounded, weight: .semibold))
          Text(thread.branch ?? thread.projectId)
            .font(.caption)
            .foregroundStyle(MobileTheme.muted)
        }
      }
      ToolbarItemGroup(placement: .topBarTrailing) {
        Button("Diff") {
          Task {
            await store.loadDiff(for: thread)
          }
        }
        .disabled(thread.checkpoints.last == nil)
      }
    }
  }
}

@MainActor
struct MobileEmptyThreadDetailView: View {
  var body: some View {
    MobileEmptyStateCard(
      title: "Pick a thread",
      subtitle: "Select a conversation from the sidebar to see messages, approvals, and history.",
      symbol: "sidebar.left",
    )
    .padding(16)
  }
}

@MainActor
struct MobilePendingApprovalsCard: View {
  @Bindable var store: MobileAppStore

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        MobileSectionHeading(
          title: "Pending approvals",
          subtitle: "Approve or decline the actions waiting on your input.",
        )

        ForEach(store.selectedPendingApprovals) { item in
          VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
              VStack(alignment: .leading, spacing: 3) {
                Text(item.summary)
                  .font(.headline)
                Text(item.requestKind)
                  .font(.caption)
                  .foregroundStyle(MobileTheme.muted)
              }
              Spacer(minLength: 12)
              MobileStatusPill(text: "Pending", tint: MobileTheme.warning)
            }

            if let detail = item.detail, !detail.isEmpty {
              Text(detail)
                .font(.callout)
                .foregroundStyle(MobileTheme.muted)
            }

            HStack(spacing: 10) {
              Button("Approve") {
                Task {
                  await store.respondToApproval(requestId: item.requestId, decision: "accept")
                }
              }
              .buttonStyle(MobileSmallButtonStyle(tint: MobileTheme.accent))

              Button("Decline") {
                Task {
                  await store.respondToApproval(requestId: item.requestId, decision: "decline")
                }
              }
              .buttonStyle(MobileSmallButtonStyle(tint: MobileTheme.danger))
            }
          }
          .padding(.vertical, 6)

          if item.id != store.selectedPendingApprovals.last?.id {
            Divider()
          }
        }
      }
    }
  }
}

@MainActor
struct MobileMessagesCard: View {
  let thread: MobileThread

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        MobileSectionHeading(
          title: "Messages",
          subtitle: "A compact view of the conversation between you and the agent.",
        )

        LazyVStack(spacing: 12) {
          ForEach(thread.messages) { message in
            MobileMessageRow(message: message)
              .id(message.id)
          }
        }
      }
    }
  }
}

@MainActor
struct MobileActivitiesCard: View {
  let thread: MobileThread

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        MobileSectionHeading(
          title: "Activity",
          subtitle: "Tool calls, approvals, and runtime state changes.",
        )

        if thread.activities.isEmpty {
          Text("No activity yet.")
            .foregroundStyle(MobileTheme.muted)
        } else {
          LazyVStack(spacing: 10) {
            ForEach(thread.activities) { activity in
              MobileActivityRow(activity: activity)
              if activity.id != thread.activities.last?.id {
                Divider()
              }
            }
          }
        }
      }
    }
  }
}

@MainActor
struct MobileThreadMetaCard: View {
  let thread: MobileThread

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        MobileSectionHeading(
          title: "Thread context",
          subtitle: "Read-only project and checkpoint details.",
        )

        MobileMetaRow(label: "Project", value: thread.projectId)
        MobileMetaRow(label: "Branch", value: thread.branch ?? "Not set")
        MobileMetaRow(label: "Worktree", value: thread.worktreePath ?? "Main workspace")
        MobileMetaRow(label: "Runtime", value: thread.runtimeMode)
        MobileMetaRow(label: "Interaction", value: thread.interactionMode)
        MobileMetaRow(label: "Checkpoints", value: thread.checkpoints.isEmpty ? "None" : "\(thread.checkpoints.count)")
      }
    }
  }
}

@MainActor
struct MobileComposerCard: View {
  @Binding var draftMessage: String
  let isSendingEnabled: Bool
  let onSend: () -> Void
  let onDiff: () -> Void

  var body: some View {
    VStack(spacing: 0) {
      Divider()
      MobileCard(containerPadding: 12) {
        VStack(alignment: .leading, spacing: 12) {
          HStack {
            MobileSectionHeading(
              title: "Composer",
              subtitle: "Keep prompts short on mobile and let the desktop do the heavy lifting.",
            )
            Spacer(minLength: 12)
            Button("Diff") {
              onDiff()
            }
            .buttonStyle(MobileSecondaryButtonStyle())
          }

          TextEditor(text: $draftMessage)
            .frame(minHeight: 96, alignment: .topLeading)
            .padding(12)
            .background(MobileTheme.backgroundAlt)
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(
              RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(MobileTheme.border, lineWidth: 1),
            )
            .font(.body)

          HStack {
            Text("The desktop remains authoritative for execution.")
              .font(.caption)
              .foregroundStyle(MobileTheme.muted)
            Spacer(minLength: 12)
            Button("Send Prompt", action: onSend)
              .buttonStyle(MobilePrimaryButtonStyle())
              .disabled(!isSendingEnabled)
          }
        }
      }
      .background(MobileTheme.background)
    }
  }
}

@MainActor
struct MobileSettingsSheet: View {
  @Bindable var store: MobileAppStore
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          MobileBrandHeader(
            title: "Settings",
            subtitle: "Manage the paired device, connection details, and desktop sync state.",
          )

          MobileCard {
            VStack(alignment: .leading, spacing: 12) {
              MobileSectionHeading(
                title: "Connection",
                subtitle: "Keep these values aligned with the desktop server.",
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

              MobileField(label: "Desktop auth token") {
                SecureField("Optional auth token", text: $store.desktopAuthTokenInput)
                  .textInputAutocapitalization(.never)
                  .autocorrectionDisabled()
                  .padding(.vertical, 12)
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
                title: "Paired devices",
                subtitle: "Revoke stale devices if you need to lock the session down.",
              )

              if store.devices.isEmpty {
                Text("No paired devices yet.")
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
                        Button("Revoke") {
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
        .padding(.horizontal, 16)
        .padding(.vertical, 20)
      }
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
  }
}

@MainActor
struct MobileDiffSheet: View {
  let envelope: MobileDiffEnvelope
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          MobileBrandHeader(
            title: "Checkpoint diff",
            subtitle: "Review the turn range before you approve or continue working.",
          )

          MobileCard {
            VStack(alignment: .leading, spacing: 12) {
              MobileSectionHeading(
                title: "Diff summary",
                subtitle: "Thread \(envelope.diff.threadId)",
              )
              MobileMetaRow(
                label: "Range",
                value: "\(envelope.diff.fromTurnCount) → \(envelope.diff.toTurnCount)",
              )
              Text(envelope.diff.diff)
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(MobileTheme.foreground)
                .textSelection(.enabled)
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(MobileTheme.backgroundAlt)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
          }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 20)
      }
      .background(MobileTheme.background)
      .navigationTitle("Diff")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Done") {
            dismiss()
          }
        }
      }
    }
  }
}

private struct MobileThreadHeader: View {
  let thread: MobileThread
  let summary: MobileThreadSummary?

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 6) {
            Text(thread.title)
              .font(.system(.title2, design: .rounded, weight: .semibold))
            Text(summary?.subtitle ?? thread.projectId)
              .font(.callout)
              .foregroundStyle(MobileTheme.muted)
          }
          Spacer(minLength: 12)
          MobileStatusPill(
            text: summary?.statusLabel ?? thread.session?.status.capitalized ?? "Ready",
            tint: threadToneColor,
          )
        }

        HStack(spacing: 8) {
          if let branch = thread.branch {
            MobileStatusPill(text: branch, tint: MobileTheme.accent)
          }
          if let worktreePath = thread.worktreePath {
            MobileStatusPill(text: worktreePath, tint: MobileTheme.muted)
          }
        }
      }
    }
  }

  private var threadToneColor: Color {
    if let summary, summary.pendingApprovals > 0 {
      return MobileTheme.warning
    }
    if thread.latestTurn?.state == "running" || thread.session?.status == "running" {
      return MobileTheme.accent
    }
    if thread.session?.status == "error" {
      return MobileTheme.danger
    }
    return MobileTheme.muted
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
          .font(.system(.largeTitle, design: .rounded, weight: .bold))
          .foregroundStyle(MobileTheme.foreground)
        Text(subtitle)
          .font(.callout)
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
        .font(.headline)
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
        RoundedRectangle(cornerRadius: 26, style: .continuous)
          .fill(MobileTheme.card)
          .shadow(color: .black.opacity(0.05), radius: 16, x: 0, y: 6),
      )
      .overlay(
        RoundedRectangle(cornerRadius: 26, style: .continuous)
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
        .padding(.horizontal, 14)
        .background(MobileTheme.backgroundAlt)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 18, style: .continuous)
            .stroke(MobileTheme.border, lineWidth: 1),
        )
    }
  }
}

private struct MobileBanner: View {
  let title: String
  let message: String
  let tint: Color

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Circle()
        .fill(tint)
        .frame(width: 10, height: 10)
        .padding(.top, 5)
      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.headline)
        Text(message)
          .font(.callout)
          .foregroundStyle(MobileTheme.muted)
      }
      Spacer(minLength: 0)
    }
    .padding(14)
    .background(tint.opacity(0.1))
    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .stroke(tint.opacity(0.15), lineWidth: 1),
    )
  }
}

private struct MobileConnectionSummaryCard: View {
  @Bindable var store: MobileAppStore

  var body: some View {
    MobileCard {
      VStack(alignment: .leading, spacing: 12) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 4) {
            Text(store.pairedDevice?.deviceName ?? "Unpaired")
              .font(.headline)
            Text(store.serverURLInput.isEmpty ? "No desktop server configured" : store.serverURLInput)
              .font(.caption)
              .foregroundStyle(MobileTheme.muted)
          }
          Spacer(minLength: 12)
          MobileStatusPill(
            text: store.isRefreshing ? "Syncing" : "Connected",
            tint: store.isRefreshing ? MobileTheme.warning : MobileTheme.success,
          )
        }

        HStack(alignment: .center, spacing: 16) {
          QRCodeView(
            payload: store.lastPairCode ?? store.serverURLInput,
            label: "Current Bird Code connection",
          )
          .frame(width: 96, height: 96)

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
      }
    }
  }
}

private struct MobileThreadSummaryCard: View {
  let summary: MobileThreadSummary
  let isSelected: Bool
  let onTap: () -> Void

  var body: some View {
    Button(action: onTap) {
      VStack(alignment: .leading, spacing: 10) {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 4) {
            Text(summary.title)
              .font(.headline)
              .foregroundStyle(MobileTheme.foreground)
              .multilineTextAlignment(.leading)
            Text(summary.subtitle)
              .font(.caption)
              .foregroundStyle(MobileTheme.muted)
              .multilineTextAlignment(.leading)
          }
          Spacer(minLength: 12)
          MobileStatusPill(text: summary.statusLabel, tint: threadToneColor(summary))
        }

        if let preview = summary.latestMessagePreview {
          Text(preview)
            .font(.callout)
            .foregroundStyle(MobileTheme.foreground)
            .multilineTextAlignment(.leading)
            .lineLimit(2)
        }

        HStack {
          Text(summary.projectTitle)
            .font(.caption2)
            .foregroundStyle(MobileTheme.muted)
          Spacer(minLength: 12)
          if let latest = summary.latestMessageAt {
            Text(latest, style: .relative)
              .font(.caption2)
              .foregroundStyle(MobileTheme.muted)
          }
        }
      }
      .padding(14)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(isSelected ? MobileTheme.accent.opacity(0.1) : MobileTheme.card)
      .overlay(
        RoundedRectangle(cornerRadius: 22, style: .continuous)
          .stroke(isSelected ? MobileTheme.accent.opacity(0.25) : MobileTheme.border, lineWidth: 1),
      )
      .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
    .buttonStyle(.plain)
  }

  private func threadToneColor(_ summary: MobileThreadSummary) -> Color {
    if summary.pendingApprovals > 0 {
      return MobileTheme.warning
    }
    if summary.statusLabel == "Error" {
      return MobileTheme.danger
    }
    if summary.statusLabel == "Turn running" || summary.statusLabel == "Running" {
      return MobileTheme.accent
    }
    return MobileTheme.muted
  }
}

private struct MobileMessageRow: View {
  let message: MobileMessage

  var body: some View {
    HStack {
      if message.role == "assistant" {
        MobileMessageBubble(message: message, alignment: .leading)
        Spacer(minLength: 36)
      } else if message.role == "system" {
        Spacer(minLength: 36)
        MobileMessageBubble(message: message, alignment: .center)
        Spacer(minLength: 36)
      } else {
        Spacer(minLength: 36)
        MobileMessageBubble(message: message, alignment: .trailing)
      }
    }
    .frame(maxWidth: .infinity)
  }
}

private struct MobileMessageBubble: View {
  enum BubbleAlignment {
    case leading
    case center
    case trailing
  }

  let message: MobileMessage
  let alignment: BubbleAlignment

  var body: some View {
    VStack(alignment: bubbleAlignment, spacing: 6) {
      HStack(spacing: 8) {
        Text(message.role.capitalized)
          .font(.caption2.weight(.semibold))
          .foregroundStyle(badgeTint)
        Text(message.createdAt, style: .time)
          .font(.caption2)
          .foregroundStyle(MobileTheme.muted)
      }

      Text(message.text)
        .font(.body)
        .foregroundStyle(MobileTheme.foreground)
        .multilineTextAlignment(alignment == .trailing ? .trailing : .leading)
        .textSelection(.enabled)
    }
    .padding(14)
    .frame(maxWidth: 320, alignment: bubbleFrameAlignment)
    .background(backgroundTint)
    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    .overlay(
      RoundedRectangle(cornerRadius: 22, style: .continuous)
        .stroke(badgeTint.opacity(0.2), lineWidth: 1),
    )
  }

  private var bubbleAlignment: HorizontalAlignment {
    switch alignment {
    case .leading:
      return .leading
    case .center:
      return .center
    case .trailing:
      return .trailing
    }
  }

  private var bubbleFrameAlignment: SwiftUI.Alignment {
    switch alignment {
    case .leading:
      return .leading
    case .center:
      return .center
    case .trailing:
      return .trailing
    }
  }

  private var badgeTint: Color {
    switch message.role {
    case "assistant":
      return MobileTheme.accent
    case "system":
      return MobileTheme.warning
    default:
      return MobileTheme.foreground
    }
  }

  private var backgroundTint: Color {
    switch message.role {
    case "assistant":
      return MobileTheme.accent.opacity(0.08)
    case "system":
      return MobileTheme.warning.opacity(0.1)
    default:
      return MobileTheme.backgroundAlt
    }
  }
}

private struct MobileActivityRow: View {
  let activity: MobileThreadActivity

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Circle()
        .fill(toneColor)
        .frame(width: 10, height: 10)
        .padding(.top, 6)
      VStack(alignment: .leading, spacing: 4) {
        HStack {
          Text(activity.kind)
            .font(.subheadline.weight(.semibold))
          Spacer(minLength: 12)
          Text(activity.createdAt, style: .time)
            .font(.caption2)
            .foregroundStyle(MobileTheme.muted)
        }
        Text(activity.summary)
          .font(.callout)
          .foregroundStyle(MobileTheme.muted)
      }
    }
  }

  private var toneColor: Color {
    switch activity.tone {
    case "error":
      return MobileTheme.danger
    case "approval":
      return MobileTheme.warning
    case "tool":
      return MobileTheme.accent
    default:
      return MobileTheme.muted
    }
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

private struct MobileBulletRow: View {
  let text: String

  var body: some View {
    HStack(alignment: .top, spacing: 10) {
      Circle()
        .fill(MobileTheme.accent)
        .frame(width: 7, height: 7)
        .padding(.top, 7)
      Text(text)
        .font(.callout)
        .foregroundStyle(MobileTheme.foreground)
      Spacer(minLength: 0)
    }
  }
}

private struct MobilePrimaryButtonStyle: ButtonStyle {
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

private struct MobileSecondaryButtonStyle: ButtonStyle {
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

  var body: some View {
    VStack(spacing: 8) {
      qrImage
        .resizable()
        .interpolation(.none)
        .scaledToFit()
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(MobileTheme.border, lineWidth: 1),
        )
      Text(label)
        .font(.caption2)
        .foregroundStyle(MobileTheme.muted)
        .multilineTextAlignment(.center)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel(label)
  }

  private var qrImage: Image {
    guard let data = payload.data(using: .utf8) else {
      return Image(systemName: "qrcode")
    }

    let filter = CIFilter.qrCodeGenerator()
    filter.setValue(data, forKey: "inputMessage")
    filter.correctionLevel = "M"

    guard let output = filter.outputImage else {
      return Image(systemName: "qrcode")
    }

    let transformed = output.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
    let context = CIContext(options: nil)
    guard let cgImage = context.createCGImage(transformed, from: transformed.extent) else {
      return Image(systemName: "qrcode")
    }
    return Image(decorative: cgImage, scale: 1, orientation: .up)
  }
}

private func relativeDateString(_ date: Date) -> String {
  let formatter = RelativeDateTimeFormatter()
  formatter.unitsStyle = .short
  return formatter.localizedString(for: date, relativeTo: Date())
}
