import AppIntents
import SwiftUI
import WidgetKit

// The wearer's own complications. One configurable complication whose picker
// lists the definitions the phone sent (`complicationConfig`, saved by
// ComplicationPublisher under `customComplicationDefinitions`), so any number
// can be made and each watch-face slot picks one. What a definition shows comes
// from `customMetricsSnapshot`, the numbers the watch app copies out of its
// context. Helpers are file-private for the reason spelled out at the top of
// WaterGoalComplication.

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

/// Mirrors `ComplicationPublisher.CustomDefinition` (targets/watch). Every
/// field but the first three is optional so a list written by a build that
/// lacked one still decodes.
private struct StoredDefinition: Decodable {
    let id: String
    let name: String
    let source: String
    let format: String?
    let gauge: Bool?
    let color: String?
    let icon: String?
}

/// What the picker offers before the phone's list has reached the watch (a
/// fresh install, or a watch that has not been in range yet), so it is never
/// empty. Mirrors `starterComplications` in `src/utils/watchComplications.ts`
/// and uses the same ids, so a slot set to one of these keeps working once the
/// phone's list arrives: change one side, change the other.
private func starterDefinitions() -> [StoredDefinition] {
    func starter(
        _ source: String, _ name: String, _ format: String, _ gauge: Bool,
        _ color: String, _ icon: String
    ) -> StoredDefinition {
        StoredDefinition(
            id: "starter-\(source)", name: name, source: source,
            format: format, gauge: gauge, color: color, icon: icon
        )
    }
    return [
        starter("calories", String(localized: "watch.custom.starter.calories", defaultValue: "Calories"), "percent", true, "calories", "flame.fill"),
        starter("caloriesRemaining", String(localized: "watch.custom.starter.caloriesRemaining", defaultValue: "Calories left"), "value", false, "calories", "flame.fill"),
        starter("protein", String(localized: "watch.custom.starter.protein", defaultValue: "Protein"), "percent", true, "protein", "fish.fill"),
        starter("carbs", String(localized: "watch.custom.starter.carbs", defaultValue: "Carbs"), "percent", true, "carbs", "leaf.fill"),
        starter("fat", String(localized: "watch.custom.starter.fat", defaultValue: "Fat"), "percent", true, "fat", "drop.fill"),
        starter("water", String(localized: "watch.custom.starter.water", defaultValue: "Water"), "percent", true, "water", "drop.fill"),
        starter("steps", String(localized: "watch.custom.starter.steps", defaultValue: "Steps"), "value", true, "steps", "figure.walk"),
        starter("fasting", String(localized: "watch.custom.starter.fasting", defaultValue: "Fasting"), "value", true, "fasting", "timer"),
        starter("weight", String(localized: "watch.custom.starter.weight", defaultValue: "Weight"), "value", false, "weight", "scalemass.fill"),
    ]
}

/// The phone's list, or the starter set while there is none.
private func loadDefinitions() -> [StoredDefinition] {
    guard
        let data = customDefaults()?.data(forKey: "customComplicationDefinitions"),
        let list = try? JSONDecoder().decode([StoredDefinition].self, from: data),
        !list.isEmpty
    else { return starterDefinitions() }
    return list
}

/// Mirrors `CustomMetric` (targets/watch).
private struct StoredMetric: Decodable {
    let key: String
    let value: Double
    let goal: Double?
    let progress: Double?
    let unit: String?
    let decimals: Int?
    let day: String?
    let startedAt: Double?
    let targetEndAt: Double?
}

private struct StoredMetrics: Decodable {
    let metrics: [StoredMetric]
}

/// The metric a source names, unless it describes another day.
private func loadMetric(source: String, now: Date) -> StoredMetric? {
    guard
        let data = customDefaults()?.data(forKey: "customMetricsSnapshot"),
        let stored = try? JSONDecoder().decode(StoredMetrics.self, from: data),
        let metric = stored.metrics.first(where: { $0.key == source })
    else { return nil }
    if let day = metric.day, day != customDateFormatter.string(from: now) { return nil }
    return metric
}

private func formatted(_ value: Double, decimals: Int) -> String {
    value.formatted(.number.precision(.fractionLength(decimals)))
}

private func percentText(_ progress: Double) -> String {
    "\(Int((max(0, min(1, progress)) * 100).rounded()))%"
}

/// Elapsed or remaining time as H:MM.
private func clockText(_ seconds: TimeInterval) -> String {
    let minutes = Int(max(0, seconds) / 60)
    return String(format: "%d:%02d", minutes / 60, minutes % 60)
}

/// The words a definition shows: the main text, a line under it for the
/// rectangular size, and the 0...1 fill. Dashes when its number isn't there. A
/// format that needs a figure the metric lacks (percent without progress,
/// remaining without a goal) shows the plain value instead.
private struct Shown {
    let text: String
    let detail: String?
    let progress: Double?

    static let missing = Shown(text: "–", detail: nil, progress: nil)
}

private func ofGoalText(_ goal: String) -> String {
    String(localized: "watch.custom.ofGoal", defaultValue: "of \(goal)")
}

/// "kcal left", or just "left" for a number with no unit.
private func leftText(unit: String) -> String {
    unit.isEmpty
        ? String(localized: "watch.custom.leftOnly", defaultValue: "left")
        : String(localized: "watch.custom.left", defaultValue: "\(unit) left")
}

/// An amount and its unit, as one phrase.
private func amountText(_ value: Double, unit: String, decimals: Int) -> String {
    let number = formatted(value, decimals: decimals)
    return unit.isEmpty ? number : "\(number) \(unit)"
}

private func display(
    _ definition: StoredDefinition,
    metric: StoredMetric?,
    now: Date
) -> Shown {
    guard let metric else { return .missing }
    let format = definition.format ?? "value"

    if definition.source == "fasting" {
        // Not fasting: no start time.
        guard let started = metric.startedAt else { return .missing }
        let elapsed = max(0, now.timeIntervalSince1970 - started / 1000)
        var progress: Double?
        var remaining: TimeInterval?
        var total: TimeInterval?
        if let target = metric.targetEndAt {
            let span = (target - started) / 1000
            if span > 0 {
                total = span
                progress = min(1, elapsed / span)
                remaining = max(0, span - elapsed)
            }
        }
        if format == "percent", let progress {
            return Shown(text: percentText(progress), detail: clockText(elapsed), progress: progress)
        }
        if format == "remaining", let remaining {
            return Shown(text: clockText(remaining), detail: leftText(unit: ""), progress: progress)
        }
        return Shown(
            text: clockText(elapsed),
            detail: total.map { ofGoalText(clockText($0)) },
            progress: progress
        )
    }

    let decimals = metric.decimals ?? 0
    let unit = metric.unit ?? ""
    if format == "percent", let progress = metric.progress {
        return Shown(
            text: percentText(progress),
            detail: amountText(metric.value, unit: unit, decimals: decimals),
            progress: progress
        )
    }
    if format == "remaining", let goal = metric.goal {
        return Shown(
            text: formatted(max(0, goal - metric.value), decimals: decimals),
            detail: leftText(unit: unit),
            progress: metric.progress
        )
    }
    return Shown(
        text: formatted(metric.value, decimals: decimals),
        detail: metric.goal.map { ofGoalText(amountText($0, unit: unit, decimals: decimals)) }
            ?? (unit.isEmpty ? nil : unit),
        progress: metric.progress
    )
}

private func tint(_ color: String?) -> Color {
    switch color {
    case "calories": return ComplicationPalette.calories
    case "protein": return ComplicationPalette.protein
    case "carbs": return ComplicationPalette.carbs
    case "fat": return ComplicationPalette.fat
    case "water": return .cyan
    case "steps": return .mint
    case "fasting": return .orange
    case "weight": return .teal
    default: return .white
    }
}

/// A tap goes to the page that matches what the complication shows.
private func link(for source: String) -> ComplicationLink {
    switch source {
    case "water": return .water
    case "steps": return .steps
    case "fasting": return .fasting
    default: return .goals
    }
}

struct CustomComplicationEntity: AppEntity, Sendable {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Complication")
    static let defaultQuery = CustomComplicationQuery()

    let id: String
    let name: String
    let icon: String

    // The name is the wearer's own text, so it is passed as a literal rather
    // than as a localisable string.
    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(
            title: .init(stringLiteral: name),
            image: .init(systemName: icon)
        )
    }
}

struct CustomComplicationQuery: EntityQuery, EntityStringQuery {
    func entities(for identifiers: [CustomComplicationEntity.ID]) async throws -> [CustomComplicationEntity] {
        all().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> IntentItemCollection<CustomComplicationEntity> {
        .init(items: all().filter { string.isEmpty || $0.name.localizedCaseInsensitiveContains(string) })
    }

    func suggestedEntities() async throws -> IntentItemCollection<CustomComplicationEntity> {
        .init(items: all())
    }

    /// A slot starts on the first complication, so adding one shows something
    /// before the wearer has picked.
    func defaultResult() async -> CustomComplicationEntity? {
        all().first
    }

    private func all() -> [CustomComplicationEntity] {
        loadDefinitions().map {
            CustomComplicationEntity(
                id: $0.id,
                name: $0.name,
                icon: $0.icon ?? "gauge.with.dots.needle.33percent"
            )
        }
    }
}

struct SelectCustomComplicationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Custom Complication"
    static let description = IntentDescription("Choose which of your complications to show.")

    @Parameter(title: "Complication")
    var complication: CustomComplicationEntity?

    init() {}
}

/// What a slot draws, worked out once so the view has nothing left to decide.
struct CustomComplicationContent {
    let name: String
    let icon: String
    let color: Color
    let text: String
    /// A line under the text, for the rectangular size.
    let detail: String?
    /// Nil draws no gauge: the definition turned it off, or the number has no goal.
    let progress: Double?
    let link: ComplicationLink

    static let placeholder = CustomComplicationContent(
        name: "", icon: "gauge.with.dots.needle.33percent", color: .white,
        text: "60%", detail: nil, progress: 0.6, link: .goals
    )

    /// The slot has no complication yet, or the one it had was deleted.
    static let empty = CustomComplicationContent(
        name: "", icon: "gauge.with.dots.needle.33percent", color: .secondary,
        text: "–", detail: nil, progress: nil, link: .goals
    )
}

struct CustomComplicationEntry: TimelineEntry {
    let date: Date
    let content: CustomComplicationContent
}

struct CustomComplicationProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CustomComplicationEntry {
        CustomComplicationEntry(date: Date(), content: .placeholder)
    }

    /// Looks the definition up again by id rather than trusting the stored
    /// choice, so an edit shows up and a deleted one falls back to empty.
    private func content(for configuration: SelectCustomComplicationIntent, at now: Date) -> CustomComplicationContent {
        guard
            let chosen = configuration.complication,
            let definition = loadDefinitions().first(where: { $0.id == chosen.id })
        else { return .empty }
        let shown = display(definition, metric: loadMetric(source: definition.source, now: now), now: now)
        return CustomComplicationContent(
            name: definition.name,
            icon: definition.icon ?? "gauge.with.dots.needle.33percent",
            color: tint(definition.color),
            text: shown.text,
            detail: shown.detail,
            progress: (definition.gauge ?? false) ? shown.progress : nil,
            link: link(for: definition.source)
        )
    }

    /// watchOS asks a configurable complication for the choices it can offer
    /// when the wearer adds it to a face, so each saved definition appears as
    /// a ready-made option rather than leaving the picker to the wearer.
    func recommendations() -> [AppIntentRecommendation<SelectCustomComplicationIntent>] {
        loadDefinitions().map { definition in
            var intent = SelectCustomComplicationIntent()
            intent.complication = CustomComplicationEntity(
                id: definition.id,
                name: definition.name,
                icon: definition.icon ?? "gauge.with.dots.needle.33percent"
            )
            return AppIntentRecommendation(intent: intent, description: "\(definition.name)")
        }
    }

    func snapshot(for configuration: SelectCustomComplicationIntent, in context: Context) async -> CustomComplicationEntry {
        // The watch-face gallery shows a sample, never the wearer's numbers.
        if context.isPreview { return CustomComplicationEntry(date: Date(), content: .placeholder) }
        let now = Date()
        return CustomComplicationEntry(date: now, content: content(for: configuration, at: now))
    }

    func timeline(for configuration: SelectCustomComplicationIntent, in context: Context) async -> Timeline<CustomComplicationEntry> {
        let now = Date()
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        return Timeline(
            entries: [CustomComplicationEntry(date: now, content: content(for: configuration, at: now))],
            policy: .after(min(in15Minutes, nextMidnight))
        )
    }
}

struct CustomComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CustomComplicationEntry

    private var content: CustomComplicationContent { entry.content }

    var body: some View {
        face
            .widgetURL(content.link.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                String(
                    localized: "watch.custom.accessibility",
                    defaultValue: "\(content.name) \(content.text)"
                )
            )
    }

    @ViewBuilder
    private var face: some View {
        switch family {
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label {
                    Text(verbatim: content.name)
                } icon: {
                    Image(systemName: content.icon)
                }
                .font(.headline)
                .foregroundStyle(content.color)
                .lineLimit(1)
                Text(content.text)
                    .font(.system(.body, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let progress = content.progress {
                    ProgressView(value: progress)
                        .tint(content.color)
                } else if let detail = content.detail {
                    Text(detail)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        case .accessoryInline:
            // The value goes first so a long name is what gets cut, never the number.
            Label {
                Text(verbatim: "\(content.text) \(content.name)")
            } icon: {
                Image(systemName: content.icon)
            }
        case .accessoryCorner:
            Image(systemName: content.icon)
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(content.color)
                .widgetLabel {
                    cornerLabel
                }
        default:
            if let progress = content.progress {
                Gauge(value: progress) {
                    Image(systemName: content.icon)
                } currentValueLabel: {
                    Text(content.text)
                        .monospacedDigit()
                        .minimumScaleFactor(0.5)
                }
                .gaugeStyle(.accessoryCircular)
                .tint(content.color)
            } else {
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 1) {
                        Image(systemName: content.icon)
                            .font(.caption)
                            .foregroundStyle(content.color)
                        Text(content.text)
                            .font(.system(.body, design: .rounded).weight(.semibold))
                            .monospacedDigit()
                            .minimumScaleFactor(0.5)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var cornerLabel: some View {
        if let progress = content.progress {
            ProgressView(value: progress) {
                Text(content.text)
                    .minimumScaleFactor(0.7)
            }
            .tint(content.color)
        } else {
            Text(content.text)
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
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}
