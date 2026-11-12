import SwiftUI

/// The line in the clock's row over the set and rest screens: the workout's
/// elapsed time, or live heart rate and calories. The phone's workout top line
/// setting picks which shows first; a tap switches.
///
/// One always-on rule for both modes (`isLuminanceReduced`). Wrist raised, the
/// time shows M:SS (H:MM:SS from an hour) and updates once a second, and the
/// metrics are live. Dimmed, the time shows minutes only ("24 min") and updates
/// once a minute, while heart rate and calories stop
/// refreshing to save battery: the last reading stays, greyed with an outlined
/// heart, until the wrist is raised again.
struct WorkoutTopLine: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.isLuminanceReduced) private var dimmed

    /// The wearer's tap; nil until then, so the phone's setting decides.
    @State private var showsMetricsOverride: Bool?
    /// The readings as the wrist went down, shown until it is raised.
    @State private var frozen: (bpm: String, kcal: String)?

    /// The clock's width at the top right, measured on 40 and 46 mm, with a
    /// gap so the line does not touch its running glyph.
    private static var clockWidth: CGFloat { WatchStyle.s(64) }

    private var showsMetrics: Bool {
        showsMetricsOverride ?? checkIn.context.effectiveWorkoutTopLineIsMetrics
    }

    private var liveReadings: (bpm: String, kcal: String) {
        (
            store.latestBpm.map { "\(Int($0.rounded()))" } ?? "--",
            store.activeEnergyKcal.map { "\(Int(checkIn.context.energyFromKcal($0)))" } ?? "--"
        )
    }

    var body: some View {
        Button {
            Haptics.tap()
            showsMetricsOverride = !showsMetrics
        } label: {
            if showsMetrics {
                metricsLine
            } else {
                if dimmed {
                    TimelineView(.everyMinute) { context in timeLine(now: context.date) }
                } else {
                    TimelineView(.periodic(from: .now, by: 1)) { context in timeLine(now: context.date) }
                }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.trailing, Self.clockWidth)
        // Up into the clock's row instead of pushing the set down.
        .padding(.top, -WatchStyle.s(20))
        .onChange(of: dimmed) { frozen = dimmed ? liveReadings : nil }
        .onAppear { if dimmed, frozen == nil { frozen = liveReadings } }
    }

    private var metricsLine: some View {
        let stale = dimmed
        // Captured the first time it is drawn dimmed, so a reading that lands
        // after the wrist went down never refreshes it.
        let readings = dimmed ? (frozen ?? liveReadings) : liveReadings
        let heart = stale ? Color.gray : Color.red
        let flame = stale ? Color.gray : Color.orange
        return (Text(Image(systemName: stale ? "heart" : "heart.fill")).foregroundStyle(heart)
            + Text("\(readings.bpm) ").foregroundStyle(heart)
            + Text(Image(systemName: stale ? "flame" : "flame.fill")).foregroundStyle(flame)
            + Text(readings.kcal).foregroundStyle(flame))
            .modifier(LineStyle())
            .accessibilityLabel(String(localized: "watch.workout.metricsOnlyLine", defaultValue: "Heart rate \(readings.bpm), \(readings.kcal) calories"))
    }

    private func timeLine(now: Date) -> some View {
        Text(Self.elapsed(Int(store.elapsed(at: now)), minutesOnly: dimmed))
            .foregroundStyle(.yellow)
            .modifier(LineStyle())
            .accessibilityLabel(String(localized: "watch.workout.timeLine", defaultValue: "Time \(Self.elapsed(Int(store.elapsed(at: now)), minutesOnly: false))"))
    }

    private struct LineStyle: ViewModifier {
        func body(content: Content) -> some View {
            content
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.65)
        }
    }

    /// `12:34` or `1:05:09`; dimmed, minutes only: `24 min` or `1 h 05 min`.
    static func elapsed(_ seconds: Int, minutesOnly: Bool) -> String {
        guard minutesOnly else { return WorkoutMetricsPage.elapsed(seconds) }
        let hours = seconds / 3600, minutes = (seconds % 3600) / 60
        return hours > 0
            ? String(localized: "watch.workout.elapsedHoursMinutes", defaultValue: "\(hours) h \(String(format: "%02d", minutes)) min")
            : String(localized: "watch.workout.elapsedMinutes", defaultValue: "\(minutes) min")
    }
}
