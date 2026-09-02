import SwiftUI

/// Icon-only indicator of whether the watch's last weight/body-fat check-in
/// has reached the phone yet. Shared by TrendView and WaterIntakeView so
/// every page speaks with the same status, rather than each inventing its
/// own: green means saved, orange means queued (delivery is the system's
/// job, not the wearer's problem — framed as complete because it is), red
/// means it needs a retry tap. The label exists for VoiceOver even though it
/// doesn't render as visible text.
struct SyncStatusIcon: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        let state = store.lastCapturedState
        Button {
            if state == .failed { session.retryPending() }
        } label: {
            Image(systemName: state.symbol)
                .font(.caption2)
                .foregroundStyle(color(for: state))
        }
        .buttonStyle(.plain)
        .disabled(state != .failed)
        .accessibilityLabel(state.label)
    }

    private func color(for state: SyncState) -> Color {
        switch state {
        case .saved: return .green
        case .queued: return .orange
        case .failed: return .red
        }
    }
}
