import SwiftUI

/// The Steps page: today's step count against the daily goal. Read-only; the
/// count is whatever the phone last reported.
struct StepsView: View {
    @EnvironmentObject private var store: CheckInStore

    private var steps: Int? {
        guard let snapshot = store.context.steps, snapshot.isToday else { return nil }
        return snapshot.count
    }

    private var goal: Int { max(1, store.context.stepGoal ?? 10_000) }

    var body: some View {
        let progress = steps.map { min(1, Double($0) / Double(goal)) } ?? 0
        VStack(spacing: 6) {
            Text(String(localized: "watch.steps.title", defaultValue: "Steps"))
                .watchFont(.footnote.weight(.semibold), classic: .caption2)
                .foregroundStyle(.secondary)
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.25), lineWidth: 8)
                Circle()
                    .trim(from: 0, to: progress)
                    .stroke(progress >= 1 ? Color.green : Color.mint,
                            style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Image(systemName: "figure.walk")
                        .watchFont(.body, classic: .caption)
                        .foregroundStyle(.mint)
                    Text(steps.map { $0.formatted() } ?? "--")
                        .watchFont(.system(size: WatchStyle.s(26), weight: .semibold, design: .rounded), classic: .title3.weight(.semibold))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                .padding(.horizontal, 12)
            }
            .frame(width: WatchStyle.s(110), height: WatchStyle.s(110))
            Text(steps == nil
                 ? String(localized: "watch.steps.waiting", defaultValue: "Waiting for your iPhone")
                 : String(localized: "watch.steps.ofGoal", defaultValue: "of \(goal.formatted())"))
                .watchFont(.footnote, classic: .caption2)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
