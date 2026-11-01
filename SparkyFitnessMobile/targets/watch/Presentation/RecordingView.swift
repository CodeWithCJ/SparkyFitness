import SwiftUI

/// Live stats for the phone's GPS recording, with pause/resume, lap and
/// finish, drawn like the wrist-only run (`CardioLiveLayout`).
/// The phone records the route; this page is a remote and a heart-rate sensor.
/// A control is only a request: the screen changes when the phone answers.
struct RecordingView: View {
    @EnvironmentObject private var recording: RecordingStore

    var body: some View {
        if let state = recording.state {
            content(for: state)
        } else {
            Text(String(localized: "watch.recording.none", defaultValue: "No recording"))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func content(for state: RecordingState) -> some View {
        if state.status == .finished {
            finished(state)
        } else {
            CardioLiveLayout(
                systemImage: state.activity.symbol,
                title: state.activity.title,
                status: state.status == .paused ? String(localized: "watch.run.paused", defaultValue: "Paused") : nil,
                elapsed: { state.elapsed(at: $0) },
                stats: stats(for: state),
                controls: controls(for: state),
                banner: { date in
                    if let step = state.interval {
                        CardioPlanStep(
                            label: step.label,
                            remaining: step.remaining > 0
                                ? RecordingState.clock(step.remaining(in: state, at: date).rounded(.up))
                                : nil,
                            next: step.next,
                            tint: .yellow
                        )
                    }
                }
            )
        }
    }

    private func stats(for state: RecordingState) -> [CardioStat] {
        [
            CardioStat(id: "distance", value: state.distanceText, unit: state.distanceUnitText),
            CardioStat(id: "pace", value: state.paceText, unit: state.paceUnitText),
            CardioStat(
                id: "heart",
                value: recording.liveHeartRate.map { "\($0)" } ?? "--",
                unit: String(localized: "watch.unit.bpm", defaultValue: "bpm"),
                systemImage: "heart.fill",
                tint: recording.liveHeartRate == nil ? .secondary : .red
            ),
        ]
    }

    /// A control is a request to the phone; the screen changes when it answers.
    private func controls(for state: RecordingState) -> [CardioControl] {
        let recordingNow = state.status == .recording
        return [
            CardioControl(
                id: "lap",
                systemImage: "flag.fill",
                accessibilityLabel: state.lapCount > 0 ? String(localized: "watch.run.lapCount", defaultValue: "Lap, \(state.lapCount) so far") : String(localized: "watch.run.lap", defaultValue: "Lap"),
                // A lap needs distance to measure, so only while moving.
                disabled: !recordingNow,
                action: { recording.lap() }
            ),
            CardioControl(
                id: "pause",
                systemImage: recordingNow ? "pause.fill" : "play.fill",
                accessibilityLabel: recordingNow ? String(localized: "watch.run.pause", defaultValue: "Pause") : String(localized: "watch.run.resume", defaultValue: "Resume"),
                prominent: true,
                action: { if recordingNow { recording.pause() } else { recording.resume() } }
            ),
            CardioControl(
                id: "finish",
                systemImage: "stop.fill",
                accessibilityLabel: String(localized: "watch.run.finish", defaultValue: "Finish"),
                tint: .red,
                action: { recording.finish() }
            ),
        ]
    }

    /// Finished on either side: the totals, and where to save it.
    private func finished(_ state: RecordingState) -> some View {
        VStack(spacing: 6) {
            Label(String(localized: "watch.recording.finished", defaultValue: "\(state.activity.title) finished"), systemImage: state.activity.symbol)
                .font(.headline)
                .foregroundStyle(.green)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(RecordingState.clock(state.elapsed(at: Date())))
                .font(.system(size: WatchStyle.s(30), weight: .semibold, design: .rounded))
                .monospacedDigit()
            HStack {
                Text("\(state.distanceText) \(state.distanceUnitText)")
                Spacer()
                Text("\(state.paceText) \(state.paceUnitText)")
            }
            .watchFont(.headline, classic: .caption.weight(.semibold))
            .monospacedDigit()
            Label(String(localized: "watch.recording.saveOnPhone", defaultValue: "Save it on your iPhone"), systemImage: "iphone")
                .watchFont(.footnote, classic: .caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, WatchStyle.s(4))
    }
}
