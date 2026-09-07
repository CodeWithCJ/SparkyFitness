import SwiftUI
import Charts
import WatchKit

/// Post-save screen,
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
            // Off, because the haptic is driven from `currentMetric` below
            // instead. The crown's own feedback fires on its detents, which
            // are positions on `metricIndex` — a Double the view then rounds.
            // Driving it off the rounded value ties the tap to the thing the
            // wearer actually perceives: the chart changing. One tap per
            // switch, at the moment it switches, rather than two sources
            // firing near each other.
            isHapticFeedbackEnabled: false
        )
        .onChange(of: currentMetric) {
            WKInterfaceDevice.current().play(.click)
        }
    }

    /// Status icon and the captured numbers share one row — the icon alone
    /// (no label) carries the sync state, freeing a full row of height for
    /// the chart below.
    private var summaryRow: some View {
        HStack(alignment: .center, spacing: 8) {
            SyncStatusIcon()
            capturedSummary
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
                    let unconfirmed = store.isDayUnconfirmed(point.day)
                    PointMark(x: .value("Day", date), y: .value("Weight", unit.fromKg(point.weightKg)))
                        // A custom symbol view rather than `symbolSize` plus a
                        // `ChartSymbolShape`: every built-in shape is filled,
                        // so there is no `.circle`-but-hollow to pick. Size and
                        // colour move into the symbol with it, since a custom
                        // symbol draws itself.
                        .symbol {
                            TrendPointSymbol(
                                // Matches what `symbolSize(60)` and
                                // `symbolSize(16)` used to produce — those are
                                // areas in points², so ~8.7pt and ~4.5pt across.
                                diameter: isToday ? 9 : 4.5,
                                color: isToday ? (unconfirmed ? .orange : .green) : .secondary,
                                hollow: unconfirmed
                            )
                        }
                        .opacity(unconfirmed ? 0.55 : 1)
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

/// One dot on the weight chart.
///
/// A ring rather than a disc while the day is captured on the watch but not
/// yet acknowledged by the phone. `CheckInStore.isDayUnconfirmed` has always
/// documented that as "drawn hollow", but the chart asked for `.circle` on
/// both sides of the ternary, so opacity was carrying the whole distinction
/// on its own.
private struct TrendPointSymbol: View {
    let diameter: CGFloat
    let color: Color
    let hollow: Bool

    var body: some View {
        Group {
            if hollow {
                // `strokeBorder`, not `stroke`: a stroke straddles the path and
                // would spill half its width outside the frame below — the same
                // thing that clipped the complication rings.
                Circle().strokeBorder(color, lineWidth: 1.5)
            } else {
                Circle().fill(color)
            }
        }
        .frame(width: diameter, height: diameter)
    }
}
