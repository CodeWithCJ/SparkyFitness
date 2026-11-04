import SwiftUI

// The original layout of this page, kept as the default while the larger-
// text `GoalSummaryView` is opt-in (Settings → Apple Watch → Larger text on Goals
// and Water). `ContentView` picks between the two.

/// Today's nutrition against the phone's goals
///
/// Read-only by design: everything here is logged on the phone, so this is a
/// glance surface, not an input one. It deliberately mirrors the Daily Energy
///
/// Nothing here is computed locally. The fill fractions come from the phone
/// already clamped, which is what keeps this page and the complication from
/// disagreeing by a percent at the edges.
struct ClassicGoalSummaryView: View {
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
                    Text(String(localized: "watch.goals.openPhoneToSync", defaultValue: "Open SparkyFitness on your phone to sync today's numbers."))
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
            statBlock(value: nutrition?.caloriesConsumed, label: String(localized: "watch.goals.eaten", defaultValue: "Eaten"))
            calorieRing
            statBlock(value: nutrition?.caloriesBurned, label: String(localized: "watch.goals.burned", defaultValue: "Burned"))
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

    /// Signed: going over shows a minus as well as flipping the caption.
    ///
    /// Deliberately different from the phone, which strips the sign and lets
    /// "over" carry the meaning alone (`DiaryCalorieMacroSummary`). On a watch
    /// the number is read in a glance too short to take in the caption under
    /// it, so the sign does the work the word can't.
    private var calorieValueText: String {
        guard let nutrition else { return "–" }
        return whole(nutrition.caloriesRemaining)
    }

    private var calorieCaption: String {
        guard let nutrition, nutrition.caloriesRemaining < 0 else {
            return String(localized: "watch.goals.kcalLeftClassic", defaultValue: "Kcal left")
        }
        return String(localized: "watch.goals.kcalOverClassic", defaultValue: "Kcal over")
    }

    /// Unsigned here even though the visible number is signed: "minus 254
    /// calories over goal" is worse spoken than written, and the words
    /// already say which side of the goal the wearer is on.
    private var calorieAccessibilityLabel: String {
        guard let nutrition else { return String(localized: "watch.goals.caloriesNotSynced", defaultValue: "Calories not synced yet") }
        let amount = whole(abs(nutrition.caloriesRemaining))
        return nutrition.caloriesRemaining < 0
            ? String(localized: "watch.goals.caloriesOverGoal", defaultValue: "\(amount) calories over goal")
            : String(localized: "watch.goals.caloriesLeft", defaultValue: "\(amount) calories left")
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

    // MARK: - Nutrients

    /// The nutrients the phone's Settings → Apple Watch picked, in its order.
    /// Before the first sync, or from a phone build that doesn't pick, it is
    /// protein, carbs and fat — the order shown on the phone's dashboard. The
    /// complication's outer ring runs fat, carbs, protein clockwise; they are
    /// intentionally independent, since one is a list and the other a dial.
    private var rows: [NutrientRow?] {
        if let rows = nutrition?.rows { return rows }
        return [
            macroRow("protein", Self.macroTitle("protein"), nutrition?.protein),
            macroRow("carbs", Self.macroTitle("carbs"), nutrition?.carbs),
            macroRow("fat", Self.macroTitle("fat"), nutrition?.fat),
        ]
    }

    private var macroRows: some View {
        VStack(spacing: 7) {
            ForEach(Array(rows.enumerated()), id: \.offset) { index, row in
                nutrientRow(row, placeholderKey: Self.placeholderKeys[safe: index], index: index)
            }
        }
    }

    private static let placeholderKeys = ["protein", "carbs", "fat"]

    /// The fixed macros' names; `key` is also what picks the row's colour, so
    /// it is never the translated text.
    private static func macroTitle(_ key: String) -> String {
        switch key {
        case "protein": return String(localized: "watch.goals.protein", defaultValue: "Protein")
        case "carbs": return String(localized: "watch.goals.carbs", defaultValue: "Carbs")
        default: return String(localized: "watch.goals.fat", defaultValue: "Fat")
        }
    }

    /// The fixed macros as rows. Nil before the phone has synced today, which
    /// the row draws as dashes.
    private func macroRow(_ key: String, _ title: String, _ macro: MacroGoal?) -> NutrientRow? {
        guard let macro else { return nil }
        return NutrientRow(
            key: key,
            label: title,
            unit: String(localized: "watch.unit.grams", defaultValue: "g"),
            consumed: macro.consumed,
            goal: macro.hasGoal ? macro.goal : nil,
            progress: macro.progress
        )
    }

    private func nutrientRow(_ row: NutrientRow?, placeholderKey: String?, index: Int) -> some View {
        let color = GoalPalette.color(forNutrient: row?.key ?? placeholderKey ?? "", index: index)
        let title = row?.label ?? placeholderKey.map(Self.macroTitle) ?? ""
        return VStack(alignment: .leading, spacing: 3) {
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(title)
                    .font(.system(size: 14))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 4)
                Text(row.map { whole($0.consumed) } ?? "–")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(color)
                Text(goalText(row))
                    .font(.system(size: 13))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            // No goal, nothing to fill towards: the amount stands alone.
            if row == nil || row?.goal != nil {
                progressBar(progress: row?.progress ?? 0, color: color)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(nutrientAccessibilityLabel(title, row))
    }

    /// "/ 150g" against a goal, just the unit without one.
    private func goalText(_ row: NutrientRow?) -> String {
        guard let row else { return "/ –" }
        guard let goal = row.goal else { return row.unit }
        return "/ \(whole(goal))\(row.unit)"
    }

    private func nutrientAccessibilityLabel(_ title: String, _ row: NutrientRow?) -> String {
        guard let row else { return "\(title) not synced yet" }
        let amount = "\(whole(row.consumed)) \(row.unit)"
        guard let goal = row.goal else { return "\(title) \(amount)" }
        return "\(title) \(whole(row.consumed)) of \(whole(goal)) \(row.unit)"
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

// `GoalPalette` lives with `GoalSummaryView`.

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
