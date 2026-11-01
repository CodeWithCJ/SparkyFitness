import SwiftUI

/// The Fasting page: how long the current fast has run and how far it is from
/// its goal. Starts and ends a fast by asking the phone, which owns the write.
struct FastingView: View {
    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// True from a tap until the phone's answer arrives (or a few seconds pass),
    /// so a second tap cannot start or end twice.
    @State private var waiting = false
    @State private var confirmingEnd = false
    /// The timeout that clears `waiting`. Cancelled when another request starts
    /// or the phone's answer arrives, so an older timer cannot unlock the buttons
    /// during a later request.
    @State private var waitTask: Task<Void, Never>?

    /// Protocols the wrist offers; ids are the phone's preset ids.
    private static let presets: [(id: String, label: String)] = [
        ("16-8", "16:8"), ("18-6", "18:6"), ("20-4", "20:4"),
    ]

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { timeline in
            if let fast = store.context.fast {
                running(fast, now: timeline.date)
            } else {
                idle
            }
        }
        .onChange(of: store.context.fast) {
            waitTask?.cancel()
            waitTask = nil
            waiting = false
        }
    }

    private func running(_ fast: WatchFast, now: Date) -> some View {
        let elapsed = max(0, now.timeIntervalSince(fast.startedAt))
        let total = fast.targetEndAt.map { max(1, $0.timeIntervalSince(fast.startedAt)) }
        let progress = total.map { min(1, elapsed / $0) }
        // Scrolls, like the idle page: on a 40 mm watch at a large text size
        // End fast would otherwise fall off the bottom.
        return ScrollView {
          VStack(spacing: 4) {
            Text(fast.label.map {
                String(localized: "watch.fasting.runningNamed", defaultValue: "Fasting · \($0)")
            } ?? String(localized: "watch.fasting.running", defaultValue: "Fasting"))
                .watchFont(.footnote.weight(.semibold), classic: .caption2)
                .foregroundStyle(.secondary)
            ZStack {
                if let progress {
                    Circle()
                        .stroke(Color.gray.opacity(0.25), lineWidth: 8)
                    Circle()
                        .trim(from: 0, to: progress)
                        .stroke(progress >= 1 ? Color.green : Color.orange,
                                style: StrokeStyle(lineWidth: 8, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                }
                Text(Self.clock(elapsed))
                    .watchFont(.system(size: WatchStyle.s(22), weight: .semibold, design: .rounded), classic: .title3.weight(.semibold))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                    .padding(.horizontal, 8)
            }
            .frame(width: WatchStyle.s(80), height: WatchStyle.s(80))
            if let total {
                let remaining = total - elapsed
                Text(remaining > 0
                     ? String(localized: "watch.fasting.remaining",
                              defaultValue: "\(Self.clock(remaining)) to go")
                     : String(localized: "watch.fasting.goalReached", defaultValue: "Goal reached"))
                    .watchFont(.footnote, classic: .caption2)
                    .foregroundStyle(remaining > 0 ? Color.secondary : Color.green)
                    .monospacedDigit()
            }
            // Below the ring rather than over it, where it covered the time
            // left on a 40 mm watch.
            Button(String(localized: "watch.fasting.end", defaultValue: "End fast")) {
                confirmingEnd = true
            }
            .watchFont(.body, classic: .caption2)
            .tint(.red)
            .disabled(waiting)
          }
          .frame(maxWidth: .infinity)
        }
        .confirmationDialog(
            String(localized: "watch.fasting.endConfirm", defaultValue: "End your fast?"),
            isPresented: $confirmingEnd,
            titleVisibility: .visible
        ) {
            Button(String(localized: "watch.fasting.end", defaultValue: "End fast"), role: .destructive) {
                begin { session.requestEndFast() }
            }
            Button(String(localized: "watch.fasting.cancel", defaultValue: "Cancel"), role: .cancel) {}
        }
    }

    /// Not fasting: one full-width button per preset, rather than three
    /// small ones side by side.
    private var idle: some View {
        ScrollView {
            VStack(spacing: 6) {
                Image(systemName: "fork.knife")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text(store.context.fastSynced == true
                     ? String(localized: "watch.fasting.notFasting", defaultValue: "Not fasting")
                     : String(localized: "watch.fasting.waiting", defaultValue: "Waiting for your iPhone"))
                    .watchFont(.body, classic: .footnote)
                    .multilineTextAlignment(.center)
                if store.context.fastSynced == true {
                    if waiting {
                        ProgressView()
                    } else {
                        ForEach(Self.presets, id: \.id) { preset in
                            Button {
                                begin { session.requestStartFast(presetId: preset.id) }
                            } label: {
                                Text(String(localized: "watch.fasting.startPreset", defaultValue: "Start \(preset.label)"))
                                    .frame(maxWidth: .infinity)
                            }
                            .watchFont(.body, classic: .caption2)
                            .tint(.green)
                        }
                    }
                }
            }
        }
    }

    /// Sends a request and holds the buttons until the phone's answer changes
    /// the fast, or eight seconds pass.
    private func begin(_ send: () -> Void) {
        waitTask?.cancel()
        waiting = true
        send()
        waitTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            guard !Task.isCancelled else { return }
            waiting = false
        }
    }

    /// 14:05 for under an hour is 14:05; an hour or more reads 16h 05m.
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0
            ? String(format: "%dh %02dm", hours, minutes)
            : String(format: "%d:%02d", minutes, secs)
    }
}
