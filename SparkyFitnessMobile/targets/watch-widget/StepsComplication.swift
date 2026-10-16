import WidgetKit
import SwiftUI

// Steps complication. ComplicationPublisher writes `stepsSnapshot` (count and
// goal for the day) when the phone's context carries today's steps.

private let stepsDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private struct StepsSnapshotPayload: Decodable {
    let date: String?
    let count: Int?
    let goal: Int?
}

struct StepsEntry: TimelineEntry {
    let date: Date
    let count: Int
    let goal: Int

    var progress: Double { goal > 0 ? max(0, min(1, Double(count) / Double(goal))) : 0 }
}

private func loadStepsEntry(at date: Date = Date()) -> StepsEntry {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "stepsSnapshot"),
        let payload = try? JSONDecoder().decode(StepsSnapshotPayload.self, from: data),
        payload.date == stepsDateFormatter.string(from: date)
    else { return StepsEntry(date: date, count: 0, goal: 10_000) }
    return StepsEntry(date: date, count: payload.count ?? 0, goal: payload.goal ?? 10_000)
}

struct StepsProvider: TimelineProvider {
    func placeholder(in context: Context) -> StepsEntry {
        StepsEntry(date: Date(), count: 6_000, goal: 10_000)
    }

    func getSnapshot(in context: Context, completion: @escaping (StepsEntry) -> Void) {
        completion(loadStepsEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<StepsEntry>) -> Void) {
        let now = Date()
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        completion(Timeline(entries: [loadStepsEntry(at: now)], policy: .after(min(in15Minutes, nextMidnight))))
    }
}

struct StepsComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: StepsEntry

    private var short: String {
        entry.count >= 10_000
            ? String(format: "%.1fk", Double(entry.count) / 1000)
            : entry.count.formatted()
    }

    var body: some View {
        content
            .widgetURL(ComplicationLink.steps.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(entry.count) of \(entry.goal) steps.")
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: "figure.walk")
                .font(.title3)
                .foregroundStyle(.mint)
                .widgetLabel {
                    ProgressView(value: entry.progress).tint(.mint)
                }
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Label("Steps", systemImage: "figure.walk")
                    .font(.headline)
                    .foregroundStyle(.mint)
                Text(entry.count.formatted())
                    .font(.system(.title3, design: .rounded).weight(.semibold))
                    .monospacedDigit()
                ProgressView(value: entry.progress).tint(.mint)
            }
        case .accessoryInline:
            Label("\(entry.count.formatted()) steps", systemImage: "figure.walk")
        default:
            Gauge(value: entry.progress) {
                Image(systemName: "figure.walk")
            } currentValueLabel: {
                Text(short)
                    .monospacedDigit()
                    .minimumScaleFactor(0.5)
            }
            .gaugeStyle(.accessoryCircular)
            .tint(.mint)
        }
    }
}

struct StepsComplication: Widget {
    // Must match ComplicationPublisher's Steps.kind (targets/watch).
    let kind: String = "stepsComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StepsProvider()) { entry in
            StepsComplicationView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Steps")
        .description("Today's steps toward your daily goal.")
        .supportedFamilies([
            .accessoryCircular, .accessoryCorner, .accessoryRectangular, .accessoryInline,
        ])
    }
}
