import SwiftUI
import Charts

/// Post-save screen, and the app's home screen on later launches.
///
/// The point of the chart is that the wearer verifies the *shape* rather than
/// re-reading digits: a correct entry visibly continues the corridor, a wrong
/// one juts out of it. That check is pre-verbal and survives a barely-awake
/// brain — and because the server upserts by date, tapping today's point to
/// correct it is a clean overwrite rather than a delete-and-re-add.
///
/// Metric trends (weight, body fat, and later water) are pages the Digital
/// Crown steps between — one detent per metric, matching the crown's role on
/// the Entry screen as the device's one no-aiming-required input. There is no
/// button back to Entry here; that's a swipe now (see ContentView).
struct TrendView: View {
    /// One page per tracked metric. Add a case here (and a branch in
    /// `metricContent`) when water intake trends land — nothing else about
    /// the paging needs to change.
    private enum Metric: Int, CaseIterable {
        case weight, bodyFat

        var emptyStateMessage: String {
            switch self {
            case .weight: return "Log a few days to see your weight trend."
            case .bodyFat: return "Log body fat a few times to see its trend."
            }
        }
    }

    @EnvironmentObject private var store: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager

    /// Crown-driven page index. Kept as a Double (rounded to the nearest
    /// whole page) because `digitalCrownRotation` only binds to Double.
    @State private var metricIndex: Double = 0

    private var points: [HistoryPoint] { store.trendPoints() }
    private var mean: [HistoryPoint] { store.rollingMean(points: points) }

    /// Mirrors the phone's Settings → default weight unit. Stored/transmitted
    /// values (`points`, `store.lastCaptured`, etc.) stay kg throughout — this
    /// only affects what gets drawn.
    private var unit: WeightUnit { store.context.effectiveWeightUnit }

    private var weightDomain: ClosedRange<Double> {
        let weights = points.map { unit.fromKg($0.weightKg) }
        guard let min = weights.min(), let max = weights.max() else { return 0...1 }
        // Tight auto-scaling is what makes an outlier obvious at this size.
        let pad = unit.fromKg(1.0)
        return (min - pad)...(max + pad)
    }

    private var bodyFatPoints: [HistoryPoint] {
        points.filter { $0.bodyFatPercentage != nil }
    }

    private var currentMetric: Metric {
        Metric(rawValue: Int(metricIndex.rounded())) ?? .weight
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            summaryRow
            metricContent
        }
        .padding(.horizontal, 4)
        .focusable(true)
        .digitalCrownRotation(
            $metricIndex,
            from: 0,
            through: Double(Metric.allCases.count - 1),
            by: 1,
            sensitivity: .medium,
            isContinuous: false,
            isHapticFeedbackEnabled: true
        )
    }

    /// Status icon and the captured numbers share one row — the icon alone
    /// (no label) carries the sync state, freeing a full row of height for
    /// the chart below.
    private var summaryRow: some View {
        HStack(alignment: .center, spacing: 8) {
            statusIcon
            capturedSummary
        }
    }

    /// Icon-only status indicator. "Queued" is framed as complete because it
    /// is — the number is captured and delivery is the system's job, not the
    /// wearer's problem. The label still exists for VoiceOver even though it
    /// no longer renders.
    private var statusIcon: some View {
        let state = store.lastCapturedState
        return Button {
            if state == .failed { session.retryPending() }
        } label: {
            Image(systemName: state.symbol)
                .font(.caption2)
                .foregroundStyle(color(for: state))
        }
        .buttonStyle(.plain)
        .disabled(state != .failed)
        .accessibilityLabel(state.label)
    }

    private func color(for state: SyncState) -> Color {
        switch state {
        case .saved: return .green
        case .queued: return .orange
        case .failed: return .red
        }
    }

    /// Which of the two numbers reads as "in focus" follows whichever trend
    /// page the crown currently has selected, so the summary line always
    /// agrees with the chart underneath it.
    @ViewBuilder
    private var capturedSummary: some View {
        if let last = store.lastCaptured {
            HStack(alignment: .lastTextBaseline, spacing: 6) {
                Text("\(String(format: "%.1f", unit.fromKg(last.weightKg))) \(unit.suffix)")
                    .font(currentMetric == .weight ? .headline : .subheadline)
                    .monospacedDigit()
                    .foregroundStyle(currentMetric == .weight ? .primary : .secondary)
                if let fat = last.bodyFatPercentage {
                    Text(String(format: "%.1f %%", fat))
                        .font(currentMetric == .bodyFat ? .headline : .subheadline)
                        .monospacedDigit()
                        .foregroundStyle(currentMetric == .bodyFat ? .primary : .secondary)
                }
            }
        }
    }

    @ViewBuilder
    private var metricContent: some View {
        switch currentMetric {
        case .weight:
            if points.count >= 2 {
                weightChart
            } else {
                emptyState(for: .weight)
            }
        case .bodyFat:
            if bodyFatPoints.count >= 2 {
                bodyFatChart
            } else {
                emptyState(for: .bodyFat)
            }
        }
    }

    private func emptyState(for metric: Metric) -> some View {
        Text(metric.emptyStateMessage)
            .font(.caption2)
            .foregroundStyle(.secondary)
    }

    private var weightChart: some View {
        Chart {
            ForEach(mean) { point in
                if let date = point.date {
                    LineMark(x: .value("Day", date), y: .value("Mean", unit.fromKg(point.weightKg)))
                        .lineStyle(StrokeStyle(lineWidth: 2))
                        .foregroundStyle(.tint)
                        .interpolationMethod(.catmullRom)
                }
            }
            ForEach(points) { point in
                if let date = point.date {
                    // Today's point is drawn larger, and hollow while it is still
                    // only captured on the watch — the chart itself carries the
                    // sync state rather than hiding it in a label.
                    let isToday = point.day == CheckInDate.today()
                    PointMark(x: .value("Day", date), y: .value("Weight", unit.fromKg(point.weightKg)))
                        .symbolSize(isToday ? 60 : 16)
                        .symbol(store.isDayUnconfirmed(point.day) ? .circle : .circle)
                        .foregroundStyle(
                            isToday
                                ? (store.isDayUnconfirmed(point.day) ? Color.orange : Color.green)
                                : Color.secondary
                        )
                        .opacity(store.isDayUnconfirmed(point.day) ? 0.55 : 1)
                }
            }
        }
        .chartYScale(domain: weightDomain)
        .chartXAxis(.hidden)
        .chartYAxis { AxisMarks(values: .automatic(desiredCount: 2)) }
        .frame(height: 96)
    }

    private var bodyFatChart: some View {
        Chart(bodyFatPoints) { point in
            if let date = point.date, let fat = point.bodyFatPercentage {
                LineMark(x: .value("Day", date), y: .value("Body fat", fat))
                    .lineStyle(StrokeStyle(lineWidth: 1.5))
                    .foregroundStyle(.secondary)
                    .interpolationMethod(.catmullRom)
            }
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: 96)
        .overlay(alignment: .trailing) {
            if let latest = bodyFatPoints.last?.bodyFatPercentage {
                Text(String(format: "%.1f %%", latest))
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        }
    }
}
