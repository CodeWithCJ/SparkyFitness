import AppIntents
import SwiftUI
import WidgetKit

// PHASE 0 SPIKE for user-defined complications: one configurable complication
// whose picker lists the definitions the watch app saved to the app group.
// It answers two questions before the builder is written: does an AppEntity
// picker work for a watchOS complication, and does a definition written by the
// watch app show up in it. Values come from the snapshots the other
// complications already use. Helpers are file-private for the reason spelled
// out at the top of WaterGoalComplication.

private let customDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private func customDefaults() -> UserDefaults? {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty
    else { return nil }
    return UserDefaults(suiteName: appGroup)
}

/// Mirrors `ComplicationPublisher.CustomDefinition` (targets/watch).
private struct StoredDefinition: Decodable {
    let id: String
    let name: String
    let source: String
}

private func loadDefinitions() -> [StoredDefinition] {
    guard
        let data = customDefaults()?.data(forKey: "customComplicationDefinitions"),
        let list = try? JSONDecoder().decode([StoredDefinition].self, from: data)
    else { return [] }
    return list
}

private struct ProgressPayload: Decodable {
    let date: String?
    let calorieGoalProgress: Double?
    let progress: Double?
    let count: Int?
    let goal: Int?
}

/// Today's 0...1 progress for a source key, or 0 when there is none yet.
private func loadProgress(source: String) -> Double {
    let key: String
    switch source {
    case "calories": key = "energyGoalSnapshot"
    case "water": key = "waterGoalSnapshot"
    case "steps": key = "stepsSnapshot"
    default: return 0
    }
    guard
        let data = customDefaults()?.data(forKey: key),
        let payload = try? JSONDecoder().decode(ProgressPayload.self, from: data),
        payload.date == customDateFormatter.string(from: Date())
    else { return 0 }
    let value: Double
    switch source {
    case "calories": value = payload.calorieGoalProgress ?? 0
    case "water": value = payload.progress ?? 0
    default:
        guard let count = payload.count, let goal = payload.goal, goal > 0 else { return 0 }
        value = Double(count) / Double(goal)
    }
    return max(0, min(1, value))
}

struct CustomComplicationEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Complication")
    static let defaultQuery = CustomComplicationQuery()

    var id: String
    var name: String
    var source: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)")
    }
}

struct CustomComplicationQuery: EntityQuery {
    private func all() -> [CustomComplicationEntity] {
        loadDefinitions().map { CustomComplicationEntity(id: $0.id, name: $0.name, source: $0.source) }
    }

    func entities(for identifiers: [String]) async throws -> [CustomComplicationEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func suggestedEntities() async throws -> [CustomComplicationEntity] {
        all()
    }
}

struct SelectCustomComplicationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Custom Complication"
    static let description = IntentDescription("Choose which of your complications to show.")

    @Parameter(title: "Complication")
    var complication: CustomComplicationEntity?
}

struct CustomComplicationEntry: TimelineEntry {
    let date: Date
    /// Nil until the wearer picks a complication for this slot.
    let name: String?
    let progress: Double
}

struct CustomComplicationProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CustomComplicationEntry {
        CustomComplicationEntry(date: Date(), name: nil, progress: 0.6)
    }

    private func entry(for configuration: SelectCustomComplicationIntent) -> CustomComplicationEntry {
        guard let chosen = configuration.complication else {
            return CustomComplicationEntry(date: Date(), name: nil, progress: 0)
        }
        return CustomComplicationEntry(
            date: Date(),
            name: chosen.name,
            progress: loadProgress(source: chosen.source)
        )
    }

    func snapshot(for configuration: SelectCustomComplicationIntent, in context: Context) async -> CustomComplicationEntry {
        entry(for: configuration)
    }

    func timeline(for configuration: SelectCustomComplicationIntent, in context: Context) async -> Timeline<CustomComplicationEntry> {
        let now = Date()
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        return Timeline(entries: [entry(for: configuration)], policy: .after(min(in15Minutes, nextMidnight)))
    }
}

struct CustomComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CustomComplicationEntry

    private var percent: Int { Int((entry.progress * 100).rounded()) }

    var body: some View {
        content
            .widgetURL(ComplicationLink.goals.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                String(
                    localized: "watch.custom.accessibility",
                    defaultValue: "\(entry.name ?? "Complication") \(percent)%."
                )
            )
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: "gauge.with.dots.needle.33percent")
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .widgetLabel {
                    ProgressView(value: entry.progress) {
                        Text("\(percent)%")
                            .minimumScaleFactor(0.7)
                    }
                }
        default:
            Gauge(value: entry.progress) {
                Image(systemName: "gauge.with.dots.needle.33percent")
            } currentValueLabel: {
                Text("\(percent)%")
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
            }
            .gaugeStyle(.accessoryCircular)
        }
    }
}

struct CustomComplication: Widget {
    // Must match ComplicationPublisher's Custom.kind (targets/watch).
    let kind: String = "customComplication"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: kind,
            intent: SelectCustomComplicationIntent.self,
            provider: CustomComplicationProvider()
        ) { entry in
            CustomComplicationView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Custom Complication")
        .description("A complication you set up in the SparkyFitness app.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}
