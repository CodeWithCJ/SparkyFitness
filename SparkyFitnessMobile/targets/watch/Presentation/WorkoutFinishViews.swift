import SwiftUI

/// Full-screen "New PR!" after a set that beats the exercise's best. The
/// Continue button drains as a countdown; the store closes the screen on its
/// own after the same ~5 seconds if it is not tapped.
struct NewPrView: View {
    let exercise: String
    let onContinue: () -> Void

    @State private var drained = false

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "trophy.fill")
                .font(.system(size: WatchStyle.s(34)))
            Text(String(localized: "watch.workout.newPr", defaultValue: "New PR!"))
                .font(.title3.weight(.bold))
            if !exercise.isEmpty {
                Text(exercise)
                    .font(.footnote.weight(.semibold))
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                    .multilineTextAlignment(.center)
            }
            Button(action: Haptics.tapping(onContinue)) {
                Text(String(localized: "watch.common.continue", defaultValue: "Continue"))
                    .font(.headline)
                    .foregroundStyle(Color.yellow)
                    .frame(maxWidth: .infinity)
                    .frame(height: WatchStyle.s(40))
                    .background(alignment: .leading) {
                        GeometryReader { geo in
                            Color.black.opacity(0.55)
                                .frame(width: drained ? 0 : geo.size.width)
                        }
                    }
                    .background(Color.black.opacity(0.25))
                    .clipShape(WatchStyle.shape)
                    .contentShape(WatchStyle.shape)
            }
            .buttonStyle(.plain)
        }
        .foregroundStyle(.black)
        .padding(.horizontal, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            LinearGradient(colors: [.yellow, .orange], startPoint: .top, endPoint: .bottom)
                .ignoresSafeArea()
        )
        .onAppear {
            withAnimation(.linear(duration: 5)) { drained = true }
        }
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

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Label(String(localized: "watch.workout.done", defaultValue: "Workout done"), systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(.green)
                row(String(localized: "watch.summary.time", defaultValue: "Time"), duration)
                row(String(localized: "watch.summary.sets", defaultValue: "Sets"), "\(summary.setsCompleted)")
                if summary.volumeKg > 0 {
                    row(String(localized: "watch.summary.volume", defaultValue: "Volume"), "\(Int(unit.fromKg(summary.volumeKg).rounded())) \(unit.suffix)")
                }
                if let avg = summary.averageBpm {
                    row(String(localized: "watch.summary.avgHr", defaultValue: "Avg HR"), "\(Int(avg.rounded())) bpm")
                }
                if let max = summary.maxBpm {
                    row(String(localized: "watch.summary.maxHr", defaultValue: "Max HR"), "\(Int(max.rounded())) bpm")
                }
                if let kcal = summary.activeEnergyKcal, kcal > 0 {
                    row(String(localized: "watch.summary.active", defaultValue: "Active"), "\(Int(checkIn.context.energyFromKcal(kcal).rounded())) \(checkIn.context.energyUnitLabel)")
                }
                WorkoutEffortPicker(trackStyle: true) { score, done in
                    session.rateWorkoutEffort(score, sessionId: summary.sessionId, completion: done)
                }
                .padding(.top, 6)
                if let name = summary.changedPresetName, !presetAnswered {
                    presetCard(name)
                }
                Button(action: Haptics.tapping(done)) {
                    Text(String(localized: "watch.common.done", defaultValue: "Done"))
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.s(40))
                        .background(WatchStyle.fill, in: WatchStyle.shape)
                        .contentShape(WatchStyle.shape)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
            .padding(.horizontal, 4)
            // The clock sits over the top of a scrolling page, so the title
            // starts below it.
            .padding(.top, 22)
        }
    }

    private func presetCard(_ name: String) -> some View {
        VStack(spacing: 6) {
            Text(String(localized: "watch.workout.updatePresetMessage", defaultValue: "Save the changes you made to \"\(name)\"?"))
                .font(.footnote)
                .multilineTextAlignment(.center)
            HStack(spacing: 4) {
                answerButton(String(localized: "watch.workout.keepOriginal", defaultValue: "Keep Original"), update: false)
                answerButton(String(localized: "watch.workout.updatePreset", defaultValue: "Update"), update: true)
            }
        }
        .padding(8)
        .background(WatchStyle.fill, in: WatchStyle.shape)
    }

    private func answerButton(_ title: String, update: Bool) -> some View {
        Button(action: Haptics.tapping { answer(update: update) }) {
            Text(title)
                .font(.footnote.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(update ? Color.black : Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: WatchStyle.s(34))
                .background(update ? Color.white : Color.white.opacity(0.15), in: Capsule())
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
            Text(title).font(.body).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.body.weight(.semibold)).monospacedDigit()
        }
    }
}
