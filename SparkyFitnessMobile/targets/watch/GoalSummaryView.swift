import SwiftUI

/// Today's nutrition against the phone's goals — the middle page of the swipe
/// deck (Entry ▸ Goals ▸ Trend).
///
/// Read-only by design: everything here is logged on the phone, so this is a
/// glance surface, not an input one. It deliberately mirrors the Daily Energy
/// Goal complication's colours — green calories, orange carbs, yellow fat,
/// blue protein — so that glancing at the watch face and opening the app tell
/// the same story in the same language.
///
/// Nothing here is computed locally. The fill fractions come from the phone
/// already clamped, which is what keeps this page and the complication from
/// disagreeing by a percent at the edges.
struct GoalSummaryView: View {
    @EnvironmentObject private var store: CheckInStore

    /// Today's snapshot, or nil when the phone hasn't synced one yet.
    /// Yesterday's totals are worse than none — the watch can easily wake
    /// before the phone has pushed a new day — so a stale one is discarded
    /// rather than shown.
    private var nutrition: NutritionSnapshot? {
        guard let snapshot = store.context.nutrition, snapshot.isToday else { return nil }
        return snapshot
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                headlineRow
                macroRows
                if nutrition == nil {
                    Text("Open SparkyFitness on your phone to sync today's numbers.")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 2)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    // MARK: - Calories

    /// Eaten and burned flank the ring rather than sitting under it: at this
    /// width the ring is the only thing that reads instantly, and the two
    /// supporting numbers stay out of its way.
    private var headlineRow: some View {
        HStack(spacing: 2) {
            statBlock(value: nutrition?.caloriesConsumed, label: "Eaten")
            calorieRing
            statBlock(value: nutrition?.caloriesBurned, label: "Burned")
        }
    }

    private var calorieRing: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.25), style: StrokeStyle(lineWidth: 7))
            Circle()
                .trim(from: 0, to: CGFloat(nutrition?.calorieProgress ?? 0))
                .stroke(
                    GoalPalette.calories,
                    style: StrokeStyle(lineWidth: 7, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            VStack(spacing: -1) {
                Text(calorieValueText)
                    .font(.system(size: 22, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(calorieCaption)
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 9)
        }
        .frame(width: 76, height: 76)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(calorieAccessibilityLabel)
    }

    /// Always a positive number — going over flips the caption instead of
    /// showing a minus sign, which is easier to read at a glance and matches
    /// how the phone phrases it.
    private var calorieValueText: String {
        guard let nutrition else { return "–" }
        return whole(abs(nutrition.caloriesRemaining))
    }

    private var calorieCaption: String {
        guard let nutrition, nutrition.caloriesRemaining < 0 else { return "Kcal left" }
        return "Kcal over"
    }

    private var calorieAccessibilityLabel: String {
        guard let nutrition else { return "Calories not synced yet" }
        let amount = whole(abs(nutrition.caloriesRemaining))
        return nutrition.caloriesRemaining < 0
            ? "\(amount) calories over goal"
            : "\(amount) calories left"
    }

    private func statBlock(value: Double?, label: String) -> some View {
        VStack(spacing: 1) {
            Text(value.map(whole) ?? "–")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(.system(size: 9))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Macros

    /// Carbs, fat, protein — the order shown on the phone's dashboard. The
    /// complication's outer ring runs fat, carbs, protein clockwise; they are
    /// intentionally independent, since one is a list and the other a dial.
    private var macroRows: some View {
        VStack(spacing: 7) {
            macroRow("Carbs", nutrition?.carbs, color: GoalPalette.carbs)
            macroRow("Fat", nutrition?.fat, color: GoalPalette.fat)
            macroRow("Protein", nutrition?.protein, color: GoalPalette.protein)
        }
    }

    private func macroRow(_ title: String, _ macro: MacroGoal?, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(title)
                    .font(.system(size: 14))
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(macro.map { whole($0.consumed) } ?? "–")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(color)
                Text(macro.map { "/ \(whole($0.goal))g" } ?? "/ –")
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            progressBar(progress: macro?.progress ?? 0, color: color)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(macroAccessibilityLabel(title, macro))
    }

    private func macroAccessibilityLabel(_ title: String, _ macro: MacroGoal?) -> String {
        guard let macro else { return "\(title) not synced yet" }
        return "\(title) \(whole(macro.consumed)) of \(whole(macro.goal)) grams"
    }

    /// Gradient rather than a flat fill so a nearly-empty bar still shows its
    /// colour identity at this size, where a 3pt sliver of solid colour reads
    /// as noise.
    private func progressBar(progress: Double, color: Color) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(Color.secondary.opacity(0.22))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [color.opacity(0.35), color],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: geo.size.width * max(0, min(1, progress)))
            }
        }
        .frame(height: 6)
    }

    // MARK: - Formatting

    /// Whole numbers throughout: grams and calories to one decimal place is
    /// false precision, and the extra glyphs cost more than they say.
    private func whole(_ value: Double) -> String {
        String(Int(value.rounded()))
    }
}

/// Matches `ComplicationPalette` in targets/watch-widget. The two can't share
/// a file — separate compiled targets — so if one changes, change both.
private enum GoalPalette {
    static let calories = Color.green
    static let carbs = Color.orange
    static let fat = Color.yellow
    static let protein = Color.blue
}
