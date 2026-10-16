import WidgetKit
import SwiftUI

// Protein, Carbs and Fat complications. They read the same `energyGoalSnapshot`
// the Daily Energy Goal ring decodes (ComplicationPublisher writes it), so no
// new data path exists: each is a single fraction of today's goal. Helpers are
// file-private for the reason spelled out at the top of WaterGoalComplication.

private let macroDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

enum MacroKind {
    case protein, carbs, fat

    var name: String {
        switch self {
        case .protein: return "Protein"
        case .carbs: return "Carbs"
        case .fat: return "Fat"
        }
    }

    var letter: String {
        switch self {
        case .protein: return "P"
        case .carbs: return "C"
        case .fat: return "F"
        }
    }

    var symbol: String {
        switch self {
        case .protein: return "fish.fill"
        case .carbs: return "leaf.fill"
        case .fat: return "drop.fill"
        }
    }

    /// Matches the macro colours in targets/watch's GoalPalette.
    var tint: Color {
        switch self {
        case .protein: return .red
        case .carbs: return .yellow
        case .fat: return .blue
        }
    }
}

private struct MacroSnapshotPayload: Decodable {
    let date: String?
    let proteinGoalProgress: Double?
    let carbsGoalProgress: Double?
    let fatGoalProgress: Double?
    let proteinConsumed: Double?
    let proteinGoal: Double?
    let carbsConsumed: Double?
    let carbsGoal: Double?
    let fatConsumed: Double?
    let fatGoal: Double?
}

/// Grams eaten and the goal, when the phone has sent them.
struct MacroAmount {
    let consumed: Int
    let goal: Int
}

private func loadMacro(_ macro: MacroKind) -> (progress: Double, amount: MacroAmount?) {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "energyGoalSnapshot"),
        let payload = try? JSONDecoder().decode(MacroSnapshotPayload.self, from: data),
        payload.date == macroDateFormatter.string(from: Date())
    else { return (0, nil) }
    let value: Double?
    let eaten: Double?
    let target: Double?
    switch macro {
    case .protein:
        value = payload.proteinGoalProgress
        eaten = payload.proteinConsumed
        target = payload.proteinGoal
    case .carbs:
        value = payload.carbsGoalProgress
        eaten = payload.carbsConsumed
        target = payload.carbsGoal
    case .fat:
        value = payload.fatGoalProgress
        eaten = payload.fatConsumed
        target = payload.fatGoal
    }
    var amount: MacroAmount?
    if let eaten, let target, target > 0 {
        amount = MacroAmount(consumed: Int(eaten.rounded()), goal: Int(target.rounded()))
    }
    return (max(0, min(1, value ?? 0)), amount)
}

struct MacroEntry: TimelineEntry {
    let date: Date
    let progress: Double
    var amount: MacroAmount? = nil
}

struct MacroProvider: TimelineProvider {
    let macro: MacroKind

    func placeholder(in context: Context) -> MacroEntry {
        MacroEntry(date: Date(), progress: 0.6, amount: MacroAmount(consumed: 90, goal: 150))
    }

    func getSnapshot(in context: Context, completion: @escaping (MacroEntry) -> Void) {
        let loaded = loadMacro(macro)
        completion(MacroEntry(date: Date(), progress: loaded.progress, amount: loaded.amount))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MacroEntry>) -> Void) {
        let now = Date()
        let loaded = loadMacro(macro)
        let entry = MacroEntry(date: now, progress: loaded.progress, amount: loaded.amount)
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        completion(Timeline(entries: [entry], policy: .after(min(in15Minutes, nextMidnight))))
    }
}

struct MacroComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let macro: MacroKind
    let entry: MacroEntry

    private var percent: Int { Int((entry.progress * 100).rounded()) }

    /// "85/150g" when the phone sent grams, otherwise the percentage.
    private var amountText: String {
        guard let amount = entry.amount else { return "\(percent)%" }
        return "\(amount.consumed)/\(amount.goal)g"
    }

    /// "81/150" for the corner's curved label, which clips anything longer.
    private var cornerLabel: String {
        guard let amount = entry.amount else { return "\(percent)%" }
        return "\(amount.consumed)/\(amount.goal)"
    }

    /// The figure that fits inside a small ring: grams eaten, else percent.
    private var shortText: String {
        entry.amount.map { "\($0.consumed)" } ?? "\(percent)"
    }

    var body: some View {
        content
            .widgetURL(ComplicationLink.goals.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                entry.amount.map {
                    "\(macro.name) \($0.consumed) of \($0.goal) grams, \(percent)% of goal."
                } ?? "\(macro.name) \(percent)% of goal."
            )
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            // The curved label has room for about seven characters before it
            // is clipped, so the macro's letter goes in the corner itself and
            // the label carries only "81/150" (or the percent), with no unit.
            Text(macro.letter)
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(macro.tint)
                .widgetLabel {
                    ProgressView(value: entry.progress) {
                        Text(cornerLabel)
                            .minimumScaleFactor(0.7)
                    }
                    .tint(macro.tint)
                }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label(macro.name, systemImage: macro.symbol)
                    .font(.headline)
                    .foregroundStyle(macro.tint)
                Text(amountText)
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                ProgressView(value: entry.progress)
                    .tint(macro.tint)
            }
        case .accessoryInline:
            Label("\(macro.letter) \(amountText)", systemImage: macro.symbol)
        default:
            Gauge(value: entry.progress) {
                Text(macro.letter)
            } currentValueLabel: {
                Text(shortText)
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
            .tint(macro.tint)
        }
    }
}

struct ProteinGoalComplication: Widget {
    // Must match MacroKind.protein.kind. Literals throughout, like the other
    // complications: a configuration built from interpolated strings crashed
    // the extension at load on watchOS 27.
    let kind: String = "proteinGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacroProvider(macro: .protein)) { entry in
            MacroComplicationView(macro: .protein, entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Protein Goal")
        .description("How much of today's protein goal you've reached.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}

struct CarbsGoalComplication: Widget {
    let kind: String = "carbsGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacroProvider(macro: .carbs)) { entry in
            MacroComplicationView(macro: .carbs, entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Carbs Goal")
        .description("How much of today's carbs goal you've reached.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}

struct FatGoalComplication: Widget {
    let kind: String = "fatGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacroProvider(macro: .fat)) { entry in
            MacroComplicationView(macro: .fat, entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Fat Goal")
        .description("How much of today's fat goal you've reached.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}
