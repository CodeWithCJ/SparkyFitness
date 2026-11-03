import WidgetKit
import SwiftUI

// Calories-only complication: one gauge for today's calorie goal, without the
// macro ring the Daily Energy Goal complication wraps around it. It reads the
// same `energyGoalSnapshot` ComplicationPublisher already writes, so no new
// data path exists. Helpers are file-private for the reason spelled out at the
// top of WaterGoalComplication.

private let calorieDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private struct CalorieSnapshotPayload: Decodable {
    let date: String?
    let calorieGoalProgress: Double?
}

private func loadCalorieProgress() -> Double {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "energyGoalSnapshot"),
        let payload = try? JSONDecoder().decode(CalorieSnapshotPayload.self, from: data),
        payload.date == calorieDateFormatter.string(from: Date())
    else { return 0 }
    return max(0, min(1, payload.calorieGoalProgress ?? 0))
}

struct CalorieEntry: TimelineEntry {
    let date: Date
    let progress: Double
}

struct CalorieProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalorieEntry {
        CalorieEntry(date: Date(), progress: 0.6)
    }

    func getSnapshot(in context: Context, completion: @escaping (CalorieEntry) -> Void) {
        completion(CalorieEntry(date: Date(), progress: loadCalorieProgress()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<CalorieEntry>) -> Void) {
        let now = Date()
        let entry = CalorieEntry(date: now, progress: loadCalorieProgress())
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        completion(Timeline(entries: [entry], policy: .after(min(in15Minutes, nextMidnight))))
    }
}

struct CalorieComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CalorieEntry

    private var percent: Int { Int((entry.progress * 100).rounded()) }

    var body: some View {
        content
            .widgetURL(ComplicationLink.goals.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                String(
                    localized: "watch.calories.accessibility",
                    defaultValue: "Calories \(percent)% of goal."
                )
            )
    }

    @ViewBuilder
    private var content: some View {
        switch family {
        case .accessoryCorner:
            Image(systemName: "flame.fill")
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundStyle(ComplicationPalette.calories)
                .widgetLabel {
                    ProgressView(value: entry.progress) {
                        Text("\(percent)%")
                            .minimumScaleFactor(0.7)
                    }
                    .tint(ComplicationPalette.calories)
                }
        default:
            Gauge(value: entry.progress) {
                Image(systemName: "flame.fill")
            } currentValueLabel: {
                Text("\(percent)")
                    .monospacedDigit()
            }
            .gaugeStyle(.accessoryCircular)
            .tint(ComplicationPalette.calories)
        }
    }
}

struct CalorieGoalComplication: Widget {
    // Must match ComplicationPublisher's CalorieGoal.kind (targets/watch).
    // Literals throughout, like the other complications: a configuration built
    // from interpolated strings crashed the extension at load on watchOS 27.
    let kind: String = "calorieGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CalorieProvider()) { entry in
            CalorieComplicationView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Calorie Goal")
        .description("How much of today's calorie goal you've reached.")
        .supportedFamilies([.accessoryCircular, .accessoryCorner])
    }
}

#if DEBUG
    #Preview(as: .accessoryCircular) {
        CalorieGoalComplication()
    } timeline: {
        CalorieEntry(date: .now, progress: 0.65)
        CalorieEntry(date: .now, progress: 0)
    }

    #Preview(as: .accessoryCorner) {
        CalorieGoalComplication()
    } timeline: {
        CalorieEntry(date: .now, progress: 0.65)
    }
#endif
