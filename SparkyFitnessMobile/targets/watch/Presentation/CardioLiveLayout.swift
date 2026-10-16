import SwiftUI

/// One reading on a cardio screen's tile row: "2.41 km", "8:12 /km", "152 bpm".
struct CardioStat: Identifiable {
    let id: String
    let value: String
    let unit: String
    /// A small glyph before the value (the heart on heart rate).
    var systemImage: String?
    var tint: Color = .white
}

/// A control on a cardio screen's button row, drawn as the strength workout's
/// squircle.
struct CardioControl: Identifiable {
    let id: String
    let systemImage: String
    let accessibilityLabel: String
    var prominent = false
    var tint: Color?
    var disabled = false
    let action: () -> Void
}

/// The live screen of a walk, run or ride, shared by the wrist-only recording
/// and the phone's GPS recording. Laid out like the strength workout: a quiet
/// header with the activity, its state and the GPS signal, the clock large,
/// the readings in the same dark tiles as the set values, and squircle buttons
/// along the bottom with the main one (pause or resume) in white.
struct CardioLiveLayout<Banner: View>: View {
    let systemImage: String
    /// "Indoor walk", "Outdoor run", "Ride".
    let title: String
    /// "Paused", "Auto-paused"; nil while it is going. Shown in the title's place.
    let status: String?
    /// The time to show at a moment, ticked every second.
    let elapsed: (Date) -> TimeInterval
    let stats: [CardioStat]
    let controls: [CardioControl]
    /// GPS signal bars beside the title, worked out at a moment so they go
    /// grey when fixes stop coming; nil hides them (indoors, or a recording
    /// whose GPS is on the phone).
    var signal: ((Date) -> GpsSignal)?
    /// A plan's current step, under the clock. Gets the same moment as the clock.
    @ViewBuilder let banner: (Date) -> Banner

    var body: some View {
        // Fits a 41 mm screen with a plan step showing, buttons included: the
        // sizes below leave the bottom row clear of the rounded corners. The
        // scroll is only a fallback for larger text sizes.
        ScrollView {
            VStack(spacing: WatchStyle.s(4)) {
                header
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    VStack(spacing: WatchStyle.s(4)) {
                        Text(RecordingState.clock(elapsed(context.date)))
                            .font(.system(size: WatchStyle.s(28), weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(status == nil ? Color.white : Color.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        banner(context.date)
                    }
                }
                HStack(spacing: WatchStyle.s(4)) {
                    ForEach(stats) { stat in
                        tile(stat)
                    }
                }
                HStack(spacing: WatchStyle.s(4)) {
                    ForEach(controls) { control in
                        SquircleButton(
                            systemImage: control.systemImage,
                            prominent: control.prominent,
                            tint: control.tint,
                            height: 36,
                            action: control.action
                        )
                        .disabled(control.disabled)
                        .accessibilityLabel(control.accessibilityLabel)
                    }
                }
                .padding(.top, WatchStyle.s(2))
            }
            .padding(.horizontal, WatchStyle.s(4))
            // Room under the buttons for the screen's rounded corners.
            .padding(.bottom, WatchStyle.s(6))
        }
        .scrollBounceBehavior(.basedOnSize)
        .scrollIndicators(.hidden)
    }

    /// The activity, small like the strength header. While paused the state
    /// takes the title's place in orange (the glyph still says walk or run),
    /// so the line never has to hold both and lose its end under the clock.
    private var header: some View {
        HStack(alignment: .center, spacing: WatchStyle.s(5)) {
            Image(systemName: systemImage)
                .font(.system(size: WatchStyle.s(14), weight: .semibold))
                .foregroundStyle(status == nil ? Color.green : Color.orange)
            Text(status ?? title)
                .font(.system(size: WatchStyle.s(14), weight: .semibold))
                .foregroundStyle(status == nil ? Color.secondary : Color.orange)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityLabel(status.map { String(localized: "watch.run.titleWithStatus", defaultValue: "\(title), \($0)") } ?? title)
            if let signal {
                TimelineView(.periodic(from: .now, by: 5)) { context in
                    GpsSignalBars(signal: signal(context.date))
                }
            }
            // The system clock sits over the top right; keep the title out
            // from under it.
            Color.clear.frame(width: WatchStyle.s(48), height: 1)
        }
    }

    private func tile(_ stat: CardioStat) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 2) {
                if let systemImage = stat.systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: WatchStyle.s(11), weight: .bold))
                }
                Text(stat.value)
                    .font(.system(size: WatchStyle.s(17), weight: .bold, design: .rounded))
                    .monospacedDigit()
            }
            .foregroundStyle(stat.tint)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            Text(stat.unit)
                .font(.system(size: WatchStyle.s(10), weight: .medium))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 2)
        .frame(maxWidth: .infinity)
        .frame(height: WatchStyle.s(36))
        .background(WatchStyle.fill, in: RoundedRectangle(cornerRadius: WatchStyle.s(12), style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// A plan's current step and countdown, then what comes next: a tinted strip
/// under the clock, so it reads as part of the timing rather than another tile.
struct CardioPlanStep: View {
    let label: String
    /// What is left of the step, already worded ("1:30", "400 m"); nil once
    /// the plan is complete.
    let remaining: String?
    let next: String?
    var tint: Color = .orange

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                Text(label)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                if let remaining {
                    Text(remaining)
                        .monospacedDigit()
                }
            }
            .font(.system(size: WatchStyle.s(14), weight: .bold))
            .foregroundStyle(tint)
            if let next {
                Text(String(localized: "watch.recording.next", defaultValue: "Next: \(next)"))
                    .font(.system(size: WatchStyle.s(11)))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .padding(.horizontal, WatchStyle.s(8))
        .padding(.vertical, WatchStyle.s(3))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.18), in: RoundedRectangle(cornerRadius: WatchStyle.s(10), style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// Three bars, lit by how good the GPS fix is: green when good, yellow when
/// fair, red when weak, grey with none.
struct GpsSignalBars: View {
    let signal: GpsSignal

    private var tint: Color {
        switch signal {
        case .good: return .green
        case .fair: return .yellow
        case .weak: return .red
        case .none: return .gray
        }
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: WatchStyle.s(2)) {
            ForEach(1...3, id: \.self) { bar in
                RoundedRectangle(cornerRadius: 1)
                    .fill(bar <= signal.rawValue ? tint : Color.white.opacity(0.25))
                    .frame(width: WatchStyle.s(3), height: WatchStyle.s(CGFloat(3 + bar * 3)))
            }
        }
        .accessibilityElement()
        .accessibilityLabel(signal.label)
    }
}
