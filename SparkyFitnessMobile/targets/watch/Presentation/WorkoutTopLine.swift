import SwiftUI

/// The line in the clock's row over the set and rest screens: the workout's
/// elapsed time, or live heart rate and calories. The phone's workout top line
/// setting picks which shows first; a tap switches.
///
/// One always-on rule for both modes (`isLuminanceReduced`). Wrist raised, the
/// time shows M:SS (H:MM:SS from an hour) and updates once a second, and the
/// metrics are live. Dimmed, the time shows minutes only ("24 min") and updates
/// once a minute, while heart rate and calories stop refreshing to save
/// battery: the last reading stays, greyed with an outlined heart, until the
/// wrist is raised again.
///
/// This view observes the workout store and hands plain values to
/// `TopLineContent`, an `Equatable` view that is skipped when they are
/// unchanged, so the store's heart-rate and timer publishes do not redraw the
/// line while the wrist is down.
struct WorkoutTopLine: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.isLuminanceReduced) private var reducedLuminance
    private var dimmed: Bool { reducedLuminance || WatchStyle.forcedDimming }

    /// The wearer's tap; nil until then, so the phone's setting decides.
    @State private var showsMetricsOverride: Bool?
    /// The readings as the wrist went down, shown until it is raised.
    @State private var frozen: Readings?

    private var showsMetrics: Bool {
        showsMetricsOverride ?? checkIn.context.effectiveWorkoutTopLineIsMetrics
    }

    private var liveReadings: Readings {
        Readings(
            bpm: store.latestBpm.map { "\(Int($0.rounded()))" } ?? "--",
            kcal: store.activeEnergyKcal.map { "\(Int(checkIn.context.energyFromKcal($0)))" } ?? "--"
        )
    }

    var body: some View {
        TopLineContent(
            startedAt: store.workoutStartedAt,
            showsMetrics: showsMetrics,
            dimmed: dimmed,
            readings: dimmed ? (frozen ?? liveReadings) : liveReadings,
            onToggle: { showsMetricsOverride = !showsMetrics }
        )
        .equatable()
        .onChange(of: dimmed) {
            frozen = dimmed ? liveReadings : nil
            // Nothing on this screen needs the once-a-second elapsed publish
            // while dimmed; the time is drawn from the start date.
            store.setElapsedPublishing(suspended: dimmed)
        }
        .onAppear { if dimmed, frozen == nil { frozen = liveReadings } }
        .onDisappear { store.setElapsedPublishing(suspended: false) }
    }

    struct Readings: Equatable {
        let bpm: String
        let kcal: String
    }
}

private struct TopLineContent: View, Equatable {
    let startedAt: Date?
    let showsMetrics: Bool
    let dimmed: Bool
    let readings: WorkoutTopLine.Readings
    let onToggle: () -> Void

    @Environment(\.setTint) private var tint

    static func == (a: Self, b: Self) -> Bool {
        a.startedAt == b.startedAt && a.showsMetrics == b.showsMetrics
            && a.dimmed == b.dimmed && a.readings == b.readings
    }

    var body: some View {
        Button {
            Haptics.tap()
            onToggle()
        } label: {
            if showsMetrics {
                metricsLine
            } else if dimmed {
                TimelineView(.everyMinute) { context in timeLine(now: context.date) }
            } else {
                TimelineView(.periodic(from: .now, by: 1)) { context in timeLine(now: context.date) }
            }
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, WatchStyle.m(3))
        .frame(height: WatchStyle.m(42))
        .padding(.top, WatchStyle.m(8))
    }

    private var metricsLine: some View {
        let stale = dimmed
        let heart = stale ? WatchStyle.grey.opacity(0.7) : WatchStyle.heart
        let size = WatchStyle.num(30)
        return HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(12)) {
            HStack(spacing: WatchStyle.m(4)) {
                Image(systemName: stale ? "heart" : "heart.fill")
                    .font(.system(size: WatchStyle.m(24), weight: .medium))
                Text(readings.bpm)
                    .font(.system(size: size, weight: WatchStyle.numWeight))
                    .monospacedDigit()
            }
            .foregroundStyle(heart)
            HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(4)) {
                Text(readings.kcal)
                    .font(.system(size: size, weight: WatchStyle.numWeight))
                    .monospacedDigit()
                Text(String(localized: "watch.workout.kcalUnit", defaultValue: "kcal"))
                    .font(.system(size: WatchStyle.m(15), weight: .semibold))
            }
            .foregroundStyle(tint.light.opacity(stale ? 0.7 : 1))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.6)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "watch.workout.metricsOnlyLine", defaultValue: "Heart rate \(readings.bpm), \(readings.kcal) calories"))
    }

    private func timeLine(now: Date) -> some View {
        let seconds = Self.elapsedSeconds(startedAt: startedAt, now: now)
        return Text(Self.elapsed(seconds, minutesOnly: dimmed))
            .foregroundStyle(tint.light)
            .font(.system(size: WatchStyle.num(37), weight: WatchStyle.numWeight))
            .monospacedDigit()
            .lineLimit(1)
            .fixedSize()
            .accessibilityLabel(String(localized: "watch.workout.timeLine", defaultValue: "Time \(Self.elapsed(seconds, minutesOnly: false))"))
    }

    private static func elapsedSeconds(startedAt: Date?, now: Date) -> Int {
        #if DEBUG
        if let frozen = ScreenshotSeed.elapsedOverride { return frozen }
        #endif
        return startedAt.map { max(0, Int(now.timeIntervalSince($0))) } ?? 0
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
