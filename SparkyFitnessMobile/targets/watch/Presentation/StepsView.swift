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
            Text("Steps")
                .font(.caption2)
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
                        .font(.caption)
                        .foregroundStyle(.mint)
                    Text(steps.map { $0.formatted() } ?? "--")
                        .font(.title3)
                        .fontWeight(.semibold)
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
            }
            .frame(width: 110, height: 110)
            Text(steps == nil ? "Waiting for your iPhone" : "of \(goal.formatted())")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
