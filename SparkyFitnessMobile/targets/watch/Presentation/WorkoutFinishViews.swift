import SwiftUI

/// Full-screen "New PR!" after a set that beats the exercise's best. The
/// Continue button drains as a countdown; the store closes the screen on its
/// own after the same ~5 seconds if it is not tapped.
struct NewPrView: View {
    let exercise: String
    /// The record set's weight and reps, "85 kg × 8".
    var detail: String?
    let onContinue: () -> Void

    @State private var shownAt = Date()

    private static let ink = Color(red: 26 / 255, green: 18 / 255, blue: 0)

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "trophy.fill")
                .font(.system(size: WatchStyle.m(44)))
                .frame(height: WatchStyle.m(48))
            Text(String(localized: "watch.workout.newPr", defaultValue: "New PR!"))
                .font(.system(size: WatchStyle.m(34), weight: .bold))
                .tracking(-0.3)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(height: WatchStyle.m(38))
            if !exercise.isEmpty {
                Text(exercise)
                    .font(.system(size: WatchStyle.m(17), weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .frame(height: WatchStyle.m(21))
            }
            if let detail {
                Text(detail)
                    .font(.system(size: WatchStyle.num(40), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(height: WatchStyle.m(44))
            }
            Spacer(minLength: WatchStyle.m(8))
            Button(action: Haptics.tapping(onContinue)) {
                // Date-driven, like the other countdowns: a one-shot animation
                // started in onAppear is lost to the overlay's transition.
                TimelineView(.animation) { context in
                    let elapsed = context.date.timeIntervalSince(shownAt)
                    let left = max(0, 5 - Int(elapsed))
                    Text(String(localized: "watch.workout.continueIn", defaultValue: "Continue · \(left)s"))
                        .font(.system(size: WatchStyle.m(17), weight: .bold))
                        .foregroundStyle(Color(red: 1, green: 211 / 255, blue: 92 / 255))
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(48))
                        .background(alignment: .leading) {
                            GeometryReader { geo in
                                Color.white.opacity(0.3)
                                    .frame(width: geo.size.width * max(0, 1 - elapsed / 5))
                            }
                        }
                }
                .background(Self.ink)
                .clipShape(Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            .padding(.bottom, WatchStyle.bottom + WatchStyle.m(14))
        }
        .foregroundStyle(Self.ink)
        .padding(.horizontal, max(0, WatchStyle.m(11) - 1.5))
        .padding(.top, WatchStyle.m(18))
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            GeometryReader { geo in
                ZStack {
                    LinearGradient(
                        stops: [
                            .init(color: Color(red: 1, green: 211 / 255, blue: 92 / 255), location: 0),
                            .init(color: Color(red: 245 / 255, green: 166 / 255, blue: 35 / 255), location: 0.62),
                            .init(color: Color(red: 224 / 255, green: 130 / 255, blue: 15 / 255), location: 1),
                        ],
                        startPoint: UnitPoint(x: 0.41, y: 0), endPoint: UnitPoint(x: 0.59, y: 1)
                    )
                    RadialGradient(
                        colors: [Color(red: 1, green: 237 / 255, blue: 179 / 255), Color(red: 1, green: 237 / 255, blue: 179 / 255).opacity(0)],
                        center: UnitPoint(x: 0.5, y: 0.18), startRadius: 0, endRadius: geo.size.width * 0.5
                    )
                }
            }
            .ignoresSafeArea()
        )
        .onAppear { shownAt = Date() }
        .accessibilityElement(children: .combine)
    }
}

/// Shown after a workout ends, until Done. One scrolling screen: the totals,
/// How hard, then, only if the workout changed from its saved one, a card to
/// update it. Done without choosing keeps the original.
struct WorkoutFinishSummaryView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    let summary: WorkoutSummary

    /// Whether the update card has been answered.
    @State private var presetAnswered = false

    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }

    private var duration: String {
        let s = summary.durationSeconds
        return s >= 3600
            ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String(format: "%d:%02d", s / 60, s % 60)
    }

    private static let green = Color(red: 52 / 255, green: 199 / 255, blue: 123 / 255)

    private var volumeText: String {
        let value = Int(unit.fromKg(summary.volumeKg).rounded())
        let formatted = NumberFormatter.localizedString(from: NSNumber(value: value), number: .decimal)
        return "\(formatted) \(unit.suffix)"
    }

    private var heartText: String? {
        switch (summary.averageBpm, summary.maxBpm) {
        case let (avg?, max?): return "\(Int(avg.rounded())) / \(Int(max.rounded()))"
        case let (avg?, nil): return "\(Int(avg.rounded()))"
        case let (nil, max?): return "\(Int(max.rounded()))"
        default: return nil
        }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Text(String(localized: "watch.workout.done", defaultValue: "Workout done"))
                    .font(.system(size: WatchStyle.m(17), weight: .semibold))
                    .foregroundStyle(Self.green)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: WatchStyle.m(42))
                    // The 17 pt capitals start about m(15) into the line.
                    .padding(.leading, WatchStyle.cornerExtra(y: WatchStyle.top + WatchStyle.m(15), have: WatchStyle.overlaySide))
                    .accessibilityAddTraits(.isHeader)
                row(String(localized: "watch.summary.time", defaultValue: "Time"), duration)
                row(String(localized: "watch.summary.sets", defaultValue: "Sets"), "\(summary.setsCompleted)")
                if summary.volumeKg > 0 {
                    row(String(localized: "watch.summary.volume", defaultValue: "Volume"), volumeText)
                }
                if let heart = heartText {
                    row(String(localized: "watch.summary.avgMaxHr", defaultValue: "Avg / Max HR"), heart)
                }
                if let kcal = summary.activeEnergyKcal, kcal > 0 {
                    row(String(localized: "watch.summary.active", defaultValue: "Active"), "\(Int(checkIn.context.energyFromKcal(kcal).rounded())) \(checkIn.context.energyUnitLabel)")
                }
                WorkoutEffortPicker(trackStyle: true) { score, done in
                    session.rateWorkoutEffort(score, sessionId: summary.sessionId, completion: done)
                }
                .padding(.top, WatchStyle.m(30))
                if let name = summary.changedPresetName, !presetAnswered {
                    presetCard(name)
                        .padding(.top, WatchStyle.m(18))
                }
                Button(action: Haptics.tapping(done)) {
                    Text(String(localized: "watch.common.done", defaultValue: "Done"))
                        .font(.system(size: WatchStyle.m(17), weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(46))
                        .background(Color.white, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .padding(.top, WatchStyle.m(14))
                .padding(.bottom, WatchStyle.m(30))
            }
            .padding(.horizontal, max(0, WatchStyle.m(11) - 1.5))
            // The clock sits over the top of a scrolling page, so the title
            // starts below it.
            .padding(.top, WatchStyle.top)
        }
        .ignoresSafeArea(edges: .top)
    }

    private func presetCard(_ name: String) -> some View {
        VStack(alignment: .leading, spacing: WatchStyle.m(6)) {
            Text(String(localized: "watch.workout.changedPreset", defaultValue: "You changed \(name)"))
                .font(.system(size: WatchStyle.m(16), weight: .semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.7)
            HStack(spacing: WatchStyle.m(6)) {
                answerButton(String(localized: "watch.workout.updatePreset", defaultValue: "Update"), update: true)
                answerButton(String(localized: "watch.workout.keepShort", defaultValue: "Keep"), update: false)
            }
            .padding(.top, WatchStyle.m(4))
        }
        .padding(WatchStyle.m(12))
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(WatchStyle.surface, in: RoundedRectangle(cornerRadius: WatchStyle.m(18), style: .continuous))
    }

    private func answerButton(_ title: String, update: Bool) -> some View {
        Button(action: Haptics.tapping { answer(update: update) }) {
            Text(title)
                .font(.system(size: WatchStyle.m(15), weight: update ? .bold : .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(update ? Color.black : Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: WatchStyle.m(38))
                .background(update ? Color.white : Color(red: 47 / 255, green: 49 / 255, blue: 54 / 255), in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func answer(update: Bool) {
        presetAnswered = true
        if let sessionId = summary.sessionId {
            session.sendPresetUpdateAnswer(sessionId: sessionId, update: update)
        }
    }

    private func done() {
        // No choice made is Keep, which also closes the question on the phone.
        if summary.changedPresetName != nil, !presetAnswered { answer(update: false) }
        store.dismissSummary()
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: WatchStyle.m(15)))
                .foregroundStyle(WatchStyle.lightGrey)
            Spacer(minLength: WatchStyle.m(6))
            Text(value)
                .font(.system(size: WatchStyle.m(19), weight: .semibold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(height: WatchStyle.m(29))
        .accessibilityElement(children: .combine)
    }
}
