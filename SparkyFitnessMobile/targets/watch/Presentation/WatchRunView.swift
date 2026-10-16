import SwiftUI

/// A walk or run recorded from the wrist alone, shown on the Workout page once
/// started from its Cardio row: the clock, distance, pace and heart rate with
/// pause, lap and finish, then a short summary. Drawn with the strength
/// workout's tiles and buttons (`CardioLiveLayout`).
struct WatchRunView: View {
    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var store: CheckInStore
    @State private var showingSettings = false

    private var usesMiles: Bool { store.context.distanceUnit == "miles" }

    var body: some View {
        switch run.phase {
        case .idle:
            Color.clear
        case .running, .paused:
            live
        case .confirmingDistance:
            TreadmillDistanceView()
        case .finished:
            finished
        }
    }

    private var status: String? {
        guard run.phase == .paused else { return nil }
        return run.autoPaused ? String(localized: "watch.run.autoPaused", defaultValue: "Auto-paused") : String(localized: "watch.run.paused", defaultValue: "Paused")
    }

    // MARK: - Running

    private var live: some View {
        CardioLiveLayout(
            systemImage: run.kind.symbol,
            title: run.kind.title(run.place),
            status: status,
            elapsed: { _ in run.elapsed },
            stats: stats(elapsed: run.elapsed, metrics: run.metrics),
            controls: controls,
            signal: run.place == .outdoor
                ? { (now: Date) -> GpsSignal in GpsSignal(accuracy: run.gpsAccuracy, at: run.gpsAccuracyAt, now: now) }
                : nil,
            banner: { _ in
                if run.plan != nil, let position = run.currentPlanPosition() {
                    CardioPlanStep(
                        label: position.label,
                        remaining: position.finished ? nil : (position.remainingMeters.map { WatchRunPlan.distance($0, inMiles: position.inMiles) } ?? RecordingState.clock(position.remaining)),
                        next: position.next
                    )
                }
            }
        )
        .sheet(isPresented: $showingSettings) { settingsSheet }
    }

    private func stats(elapsed: TimeInterval, metrics: WatchRunMetrics) -> [CardioStat] {
        var stats = [
            CardioStat(
                id: "distance",
                value: WatchRunMetrics.distanceText(metrics.distanceMeters, usesMiles: usesMiles),
                unit: usesMiles ? "mi" : "km"
            ),
            CardioStat(
                id: "pace",
                value: WatchRunMetrics.paceText(
                    WatchRunMetrics.paceSeconds(
                        elapsed: elapsed,
                        distanceMeters: metrics.distanceMeters,
                        usesMiles: usesMiles
                    )
                ),
                unit: usesMiles ? "/mi" : "/km"
            ),
        ]
        stats.append(
            CardioStat(
                id: "heart",
                value: metrics.heartRate.map { "\(Int($0.rounded()))" } ?? "--",
                unit: "bpm",
                systemImage: "heart.fill",
                tint: metrics.heartRate == nil ? .secondary : .red
            )
        )
        return stats
    }

    /// Pause or resume is the main action, so it is the white one; finish is
    /// red so it is never taken for it; the gear opens this run's switches.
    private var controls: [CardioControl] {
        let running = run.phase == .running
        return [
            CardioControl(
                id: "lap",
                systemImage: "flag.fill",
                accessibilityLabel: run.lapCount > 0 ? String(localized: "watch.run.lapCount", defaultValue: "Lap, \(run.lapCount) so far") : String(localized: "watch.run.lap", defaultValue: "Lap"),
                disabled: !running,
                action: { run.lap() }
            ),
            CardioControl(
                id: "pause",
                systemImage: running ? "pause.fill" : "play.fill",
                accessibilityLabel: running ? String(localized: "watch.run.pause", defaultValue: "Pause") : String(localized: "watch.run.resume", defaultValue: "Resume"),
                prominent: true,
                action: { if running { run.pause() } else { run.resume() } }
            ),
            CardioControl(
                id: "finish",
                systemImage: "stop.fill",
                accessibilityLabel: String(localized: "watch.run.finish", defaultValue: "Finish"),
                tint: .red,
                action: { run.finish() }
            ),
            // Auto-pause, voice cues and Test voice. In the row, not the
            // header, where it sat beside the system clock and was missed.
            CardioControl(
                id: "settings",
                systemImage: "gearshape.fill",
                accessibilityLabel: String(localized: "watch.run.settings", defaultValue: "Auto-pause and voice cues"),
                action: { showingSettings = true }
            ),
        ]
    }

    /// This walk's or run's switches, changeable while it goes. The phone's
    /// live view changes the same two.
    private var settingsSheet: some View {
        NavigationStack {
            List {
                Toggle(String(localized: "watch.run.autoPause", defaultValue: "Auto-pause"), isOn: Binding(
                    get: { run.settings.autoPause },
                    set: { run.setAutoPause($0) }
                ))
                Toggle(String(localized: "watch.run.voiceCues", defaultValue: "Voice cues"), isOn: Binding(
                    get: { run.settings.voiceCues },
                    set: { run.setVoiceCues($0) }
                ))
                paceAlertRow
                heartRateAlertRow
                // Plays whatever the switch says, so a silent speaker can be
                // told apart from cues that are off.
                Button(String(localized: "watch.run.testVoice", defaultValue: "Test voice")) {
                    WatchRunCues.shared.speak(String(localized: "watch.run.testVoicePhrase", defaultValue: "This is how your voice cues sound."), interrupt: true)
                }
            }
            .navigationTitle(run.kind.title(run.place))
        }
    }

    /// The pace range comes from the phone (set on its Record screen), so the
    /// switch is only live once the watch has one.
    @ViewBuilder
    private var paceAlertRow: some View {
        let perStep = run.plan?.steps.contains { $0.pace != nil } ?? false
        // Describe what the alert will judge by: the run's own range, else the
        // steps' ranges, else the phone's saved one (not shown over a plan's).
        let band = run.settings.paceBand ?? (perStep ? nil : store.context.runPaceBand)
        if band != nil || perStep {
            Toggle(isOn: Binding(
                get: { run.paceAlertOn },
                set: { run.setPaceAlert($0) }
            )) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(String(localized: "watch.run.paceAlert", defaultValue: "Pace alert"))
                    Text(band.map(bandText) ?? String(localized: "watch.run.alertPerStep", defaultValue: "Each step has its own"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text(String(localized: "watch.run.paceAlert", defaultValue: "Pace alert"))
                Text(String(localized: "watch.run.paceAlertSetup", defaultValue: "Set a pace range on your iPhone"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// Like the pace alert: the range is set on the phone.
    @ViewBuilder
    private var heartRateAlertRow: some View {
        let perStep = run.plan?.steps.contains { $0.heartRate != nil } ?? false
        let band = run.settings.heartRateBand ?? (perStep ? nil : store.context.runHeartRateBand)
        if band != nil || perStep {
            Toggle(isOn: Binding(
                get: { run.heartRateAlertOn },
                set: { run.setHeartRateAlert($0) }
            )) {
                VStack(alignment: .leading, spacing: 0) {
                    Text(String(localized: "watch.run.heartRateAlert", defaultValue: "Heart rate alert"))
                    Text(band.map { "\(Int($0.minBpm))–\(Int($0.maxBpm)) bpm" } ?? String(localized: "watch.run.alertPerStep", defaultValue: "Each step has its own"))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                Text(String(localized: "watch.run.heartRateAlert", defaultValue: "Heart rate alert"))
                Text(String(localized: "watch.run.heartRateAlertSetup", defaultValue: "Set a heart rate range on your iPhone"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    /// "5:00–5:30 /km", in the phone's unit.
    private func bandText(_ band: WatchPaceBand) -> String {
        let perUnit = usesMiles ? 1.609344 : 1
        let fast = WatchRunMetrics.paceText(band.minSecondsPerKm * perUnit)
        let slow = WatchRunMetrics.paceText(band.maxSecondsPerKm * perUnit)
        return "\(fast)–\(slow) \(usesMiles ? String(localized: "watch.unit.perMi", defaultValue: "/mi") : String(localized: "watch.unit.perKm", defaultValue: "/km"))"
    }

    // MARK: - Finished

    /// The totals in the strength summary's rows, so both endings look alike.
    @ViewBuilder
    private var finished: some View {
        if let summary = run.summary {
            ScrollView {
                VStack(spacing: 6) {
                    Label(
                        summary.saved ? String(localized: "watch.run.saved", defaultValue: "\(summary.kind.title(summary.place)) saved") : String(localized: "watch.run.done", defaultValue: "\(summary.kind.title(summary.place)) done"),
                        systemImage: summary.saved ? "checkmark.circle.fill" : summary.kind.symbol
                    )
                    .font(.headline)
                    .foregroundStyle(.green)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    row(String(localized: "watch.run.row.time", defaultValue: "Time"), RecordingState.clock(summary.elapsed))
                    row(
                        String(localized: "watch.run.row.distance", defaultValue: "Distance"),
                        "\(WatchRunMetrics.distanceText(summary.metrics.distanceMeters, usesMiles: usesMiles)) \(usesMiles ? String(localized: "watch.unit.mi", defaultValue: "mi") : String(localized: "watch.unit.km", defaultValue: "km"))"
                    )
                    row(
                        String(localized: "watch.run.row.pace", defaultValue: "Pace"),
                        "\(WatchRunMetrics.paceText(WatchRunMetrics.paceSeconds(elapsed: summary.elapsed, distanceMeters: summary.metrics.distanceMeters, usesMiles: usesMiles))) \(usesMiles ? String(localized: "watch.unit.perMi", defaultValue: "/mi") : String(localized: "watch.unit.perKm", defaultValue: "/km"))"
                    )
                    if summary.metrics.activeEnergyKcal > 0 {
                        row(String(localized: "watch.run.row.active", defaultValue: "Active"), "\(Int(summary.metrics.activeEnergyKcal.rounded())) \(String(localized: "watch.unit.kcal", defaultValue: "kcal"))")
                    }
                    Text(String(localized: "watch.run.sentToPhone", defaultValue: "Sent to your iPhone. It shows up in SparkyFitness once the phone can reach the server."))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                    Button(String(localized: "watch.run.done.button", defaultValue: "Done")) {
                        Haptics.tap()
                        run.dismissSummary()
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 4)
                // The clock sits over the top of a scrolling page, so the
                // title starts below it.
                .padding(.top, 22)
            }
        } else {
            Color.clear.onAppear { run.dismissSummary() }
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.caption.weight(.semibold)).monospacedDigit()
        }
    }
}

/// Asked when an indoor walk or run ends, before it is sent to the phone: the
/// treadmill's distance. The diary gets the machine's figure, and the phone
/// learns from the difference so the next indoor session reads closer.
private struct TreadmillDistanceView: View {
    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var store: CheckInStore
    @State private var entering = false

    private var usesMiles: Bool { store.context.distanceUnit == "miles" }
    private var unitMeters: Double { usesMiles ? 1609.344 : 1000 }
    private var unit: String { usesMiles ? String(localized: "watch.unit.mi", defaultValue: "mi") : String(localized: "watch.unit.km", defaultValue: "km") }

    private var treadmillMessage: String {
        let measured = WatchRunMetrics.distanceText(run.metrics.distanceMeters, usesMiles: usesMiles)
        return run.kind == .walk
            ? String(localized: "watch.run.treadmill.messageWalk", defaultValue: "The watch measured \(measured) \(unit). Enter what the machine showed, and the next walk will read closer.")
            : String(localized: "watch.run.treadmill.messageRun", defaultValue: "The watch measured \(measured) \(unit). Enter what the machine showed, and the next run will read closer.")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 8) {
                Label(String(localized: "watch.run.treadmill.title", defaultValue: "Treadmill distance?"), systemImage: run.kind.symbol)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(treadmillMessage)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button {
                    Haptics.tap()
                    entering = true
                } label: {
                    Label(String(localized: "watch.run.treadmill.enter", defaultValue: "Enter distance"), systemImage: "number")
                }
                .buttonStyle(.borderedProminent)
                Button(String(localized: "watch.run.treadmill.keep", defaultValue: "Keep watch distance")) {
                    Haptics.tap()
                    run.confirmDistance(nil)
                }
            }
            .padding(.horizontal, 4)
            // The clock sits over the top of a scrolling page.
            .padding(.top, 22)
        }
        .sheet(isPresented: $entering) {
            NumericKeypadView(
                title: unit,
                initial: (run.metrics.distanceMeters / unitMeters * 100).rounded() / 100,
                allowsDecimal: true
            ) { value in
                run.confirmDistance(value * unitMeters)
            }
        }
    }
}
