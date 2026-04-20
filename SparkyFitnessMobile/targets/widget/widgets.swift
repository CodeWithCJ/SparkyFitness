import WidgetKit
import SwiftUI

struct CalorieSnapshot {
    let food: Double
    let burned: Double
    let goal: Double
    let remaining: Double
    let progress: Double
    let lastUpdated: Date?

    static let empty = CalorieSnapshot(food: 0, burned: 0, goal: 0, remaining: 0, progress: 0, lastUpdated: nil)

    var hasData: Bool { goal > 0 || food > 0 || burned > 0 }
}

private struct CalorieSnapshotPayload: Decodable {
    let date: String?
    let food: Double?
    let burned: Double?
    let goal: Double?
    let remaining: Double?
    let progress: Double?
    let lastUpdated: Double?
}

private func loadCalorieSnapshot() -> CalorieSnapshot {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "calorieSnapshot"),
        let payload = try? JSONDecoder().decode(CalorieSnapshotPayload.self, from: data),
        isToday(payload.date)
    else {
        return .empty
    }
    return snapshot(from: payload)
}

private func fallbackProgress(goal: Double, remaining: Double) -> Double {
    guard goal > 0 else { return 0 }
    return min(1, max(0, (goal - remaining) / goal))
}

private func snapshot(from payload: CalorieSnapshotPayload) -> CalorieSnapshot {
    let goal = payload.goal ?? 0
    let remaining = payload.remaining ?? 0
    return CalorieSnapshot(
        food: payload.food ?? 0,
        burned: payload.burned ?? 0,
        goal: goal,
        remaining: remaining,
        progress: payload.progress ?? fallbackProgress(goal: goal, remaining: remaining),
        lastUpdated: payload.lastUpdated.map { Date(timeIntervalSince1970: $0) }
    )
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let snapshot: CalorieSnapshot
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        completion(SimpleEntry(date: Date(), snapshot: loadCalorieSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        let now = Date()
        let entry = SimpleEntry(date: now, snapshot: loadCalorieSnapshot())
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        let refreshAt = min(in15Minutes, nextMidnight)
        completion(Timeline(entries: [entry], policy: .after(refreshAt)))
    }
}

private struct CalorieRing: View {
    let progress: Double
    let size: CGFloat
    let strokeWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(
                    Color.secondary.opacity(0.2),
                    style: StrokeStyle(lineWidth: strokeWidth)
                )
            Circle()
                .trim(from: 0, to: CGFloat(progress))
                .stroke(
                    Color("AccentColor"),
                    style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
    }
}

private struct RingWithLabel: View {
    let snapshot: CalorieSnapshot
    let ringSize: CGFloat
    let strokeWidth: CGFloat
    let numberFontSize: CGFloat

    private var remainingText: String {
        guard snapshot.hasData else { return "—" }
        return Self.numberFormatter.string(from: NSNumber(value: Int(snapshot.remaining.rounded()))) ?? "0"
    }

    private static let numberFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()

    var body: some View {
        CalorieRing(progress: snapshot.progress, size: ringSize, strokeWidth: strokeWidth)
            .overlay(
                VStack(spacing: 0) {
                    Text(remainingText)
                        .font(.system(size: numberFontSize, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("kcal left")
                        .font(.system(size: numberFontSize * 0.58))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, strokeWidth)
            )
    }
}

private struct StatBlock: View {
    let label: String
    let value: Double

    private var valueText: String {
        Self.numberFormatter.string(from: NSNumber(value: Int(value.rounded()))) ?? "0"
    }

    private static let numberFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()

    var body: some View {
        HStack(spacing: 8) {
            Text(label)
                .font(.system(size: 15))
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            Text(valueText)
                .font(.system(size: 16, weight: .medium, design: .rounded))
                .foregroundStyle(.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }
}

struct ActionButton: View {
    let icon: String
    let destination: URL

    var body: some View {
        Link(destination: destination) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color("AccentColor"))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .contentShape(Rectangle())
        }
    }
}

struct widgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: Provider.Entry

    private var dashboardURL: URL? {
        URL(string: "sparkyfitnessmobile://")
    }

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                smallBody
            default:
                mediumBody
            }
        }
        .widgetURL(dashboardURL)
    }

    private var smallBody: some View {
        VStack(spacing: 8) {
            RingWithLabel(
                snapshot: entry.snapshot,
                ringSize: 80,
                strokeWidth: 8,
                numberFontSize: 18
            )
            VStack(spacing: 3) {
                StatBlock(label: "Food", value: entry.snapshot.food)
                StatBlock(label: "Burned", value: entry.snapshot.burned)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var mediumBody: some View {
        GeometryReader { geo in
            let isCompact = geo.size.width < 310
            let ringSize: CGFloat = isCompact ? 82 : 95
            let hSpacing: CGFloat = isCompact ? 14 : 28
            let buttonColumnWidth: CGFloat = isCompact ? 26 : 32

            HStack(spacing: hSpacing) {
                RingWithLabel(
                    snapshot: entry.snapshot,
                    ringSize: ringSize,
                    strokeWidth: 7,
                    numberFontSize: isCompact ? 18 : 20
                )

                VStack(alignment: .leading, spacing: 20) {
                    StatBlock(label: "Goal", value: entry.snapshot.goal)
                    StatBlock(label: "Food", value: entry.snapshot.food)
                    StatBlock(label: "Burned", value: entry.snapshot.burned)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Rectangle()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)

                VStack(spacing: 16) {
                    ActionButton(
                        icon: "magnifyingglass",
                        destination: URL(string: "sparkyfitnessmobile://search")!
                    )
                    ActionButton(
                        icon: "barcode.viewfinder",
                        destination: URL(string: "sparkyfitnessmobile://scan")!
                    )
                }
                .frame(width: buttonColumnWidth)
                .frame(maxHeight: .infinity)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct widget: Widget {
    let kind: String = "widget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            widgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Calorie Tracker")
        .description("Today's calorie intake at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#if DEBUG
    #Preview(as: .systemSmall) {
        widget()
    } timeline: {
        SimpleEntry(
            date: .now,
            snapshot: CalorieSnapshot(food: 1540, burned: 255, goal: 3055, remaining: 1515, progress: 0.5, lastUpdated: .now)
        )
        SimpleEntry(date: .now, snapshot: .empty)
    }

    #Preview(as: .systemMedium) {
        widget()
    } timeline: {
        SimpleEntry(
            date: .now,
            snapshot: CalorieSnapshot(food: 1540, burned: 255, goal: 3055, remaining: 1515, progress: 0.5, lastUpdated: .now)
        )
        SimpleEntry(date: .now, snapshot: .empty)
    }
#endif
