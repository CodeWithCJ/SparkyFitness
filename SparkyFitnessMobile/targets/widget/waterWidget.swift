import AppIntents
import SwiftUI
import WidgetKit

// Water widget: today's intake against the goal, with a button that logs one
// drink of the dashboard's container without opening the app (iOS 17+). The
// button needs the login the app keeps for the shortcuts while a server is
// signed in; until the app has written a snapshot (`canLog` false) the widget
// just opens the app. Home Screen small/medium and the three Lock Screen shapes.

struct WaterSnapshot {
    let consumedMl: Double
    let goalMl: Double
    /// What one tap of the button adds, in millilitres. Nil without a container.
    let drinkMl: Double?
    /// The unit the app shows water in: `ml`, `oz` or `liter`.
    let unit: String
    let canLog: Bool

    static let empty = WaterSnapshot(consumedMl: 0, goalMl: 0, drinkMl: nil, unit: "ml", canLog: false)

    var hasData: Bool { goalMl > 0 || consumedMl > 0 }
    var progress: Double { goalMl > 0 ? min(1, max(0, consumedMl / goalMl)) : 0 }

    private func inUnit(_ ml: Double) -> Double {
        switch unit {
        case "oz": return ml / 29.5735295625
        case "liter": return ml / 1000
        default: return ml
        }
    }

    private var unitLabel: String {
        switch unit {
        case "oz": return "oz"
        case "liter": return "L"
        default: return "ml"
        }
    }

    private func formatted(_ ml: Double) -> String {
        let value = inUnit(ml)
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        formatter.locale = widgetLocale()
        formatter.maximumFractionDigits = unit == "liter" ? 1 : 0
        return formatter.string(from: NSNumber(value: value)) ?? "0"
    }

    var consumedText: String { hasData ? formatted(consumedMl) : "-" }
    var goalText: String { goalMl > 0 ? formatted(goalMl) : "-" }
    /// "12 / 64 oz"
    var amountText: String { "\(consumedText) / \(goalText) \(unitLabel)" }
    /// "/ 64 oz", under the amount inside the ring.
    var goalLineText: String { "/ \(goalText) \(unitLabel)" }
}

private struct WaterSnapshotPayload: Decodable {
    let date: String?
    let consumedMl: Double?
    let goalMl: Double?
    let drinkMl: Double?
    let unit: String?
    let canLog: Int?
}

func loadWaterSnapshot() -> WaterSnapshot {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "waterSnapshot"),
        let payload = try? JSONDecoder().decode(WaterSnapshotPayload.self, from: data),
        isToday(payload.date)
    else {
        return .empty
    }
    return WaterSnapshot(
        consumedMl: payload.consumedMl ?? 0,
        goalMl: payload.goalMl ?? 0,
        drinkMl: (payload.drinkMl ?? 0) > 0 ? payload.drinkMl : nil,
        unit: payload.unit ?? "ml",
        canLog: (payload.canLog ?? 0) != 0
    )
}

struct WaterEntry: TimelineEntry {
    let date: Date
    let snapshot: WaterSnapshot
}

struct WaterProvider: TimelineProvider {
    func placeholder(in context: Context) -> WaterEntry {
        WaterEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (WaterEntry) -> Void) {
        completion(WaterEntry(date: Date(), snapshot: loadWaterSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WaterEntry>) -> Void) {
        let now = Date()
        let entry = WaterEntry(date: now, snapshot: loadWaterSnapshot())
        let in15Minutes = Calendar.current.date(byAdding: .minute, value: 15, to: now) ?? now
        let nextMidnight = Calendar.current.nextDate(
            after: now,
            matching: DateComponents(hour: 0, minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? in15Minutes
        completion(Timeline(entries: [entry], policy: .after(min(in15Minutes, nextMidnight))))
    }
}

private struct WaterRing: View {
    let progress: Double
    let size: CGFloat
    let strokeWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.blue.opacity(0.2), style: StrokeStyle(lineWidth: strokeWidth))
            Circle()
                .trim(from: 0, to: CGFloat(progress))
                .stroke(Color.blue, style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: size, height: size)
    }
}

/// The minus and plus buttons where the system can run them, otherwise nothing.
/// Minus is dimmed and inert while nothing has been logged today.
private struct LogDrinkButton: View {
    let snapshot: WaterSnapshot

    /// Plus is the solid button; minus is the quieter tinted one.
    private func circle(_ symbol: String, solid: Bool, enabled: Bool = true) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(solid ? Color.white : Color.blue)
            .frame(width: 34, height: 34)
            .background(
                Circle().fill(solid ? Color.blue : Color.blue.opacity(0.2))
            )
            .opacity(enabled ? 1 : 0.4)
    }

    var body: some View {
        if #available(iOS 17.0, *), snapshot.canLog, snapshot.drinkMl != nil {
            HStack(spacing: 14) {
                Button(intent: RemoveWaterIntent()) {
                    circle("minus", solid: false, enabled: snapshot.consumedMl > 0)
                }
                .buttonStyle(.plain)
                .disabled(snapshot.consumedMl <= 0)
                .accessibilityLabel(localizedWidgetString("widget.water.remove"))

                Button(intent: LogWaterIntent()) {
                    circle("plus", solid: true)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(localizedWidgetString("widget.water.add"))
            }
        }
    }
}

struct waterWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: WaterProvider.Entry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: entry.snapshot.progress) {
                    Image(systemName: "drop.fill")
                } currentValueLabel: {
                    Text(entry.snapshot.consumedText).minimumScaleFactor(0.5)
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Label(localizedWidgetString("widget.water.title"), systemImage: "drop.fill")
                        .font(.headline)
                    Text(entry.snapshot.amountText)
                        .font(.body)
                        .minimumScaleFactor(0.7)
                    ProgressView(value: entry.snapshot.progress)
                }
            case .accessoryInline:
                Label(entry.snapshot.amountText, systemImage: "drop.fill")
            case .systemMedium:
                HStack(spacing: 16) {
                    ring(size: 90, stroke: 9)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(localizedWidgetString("widget.water.title"))
                            .font(.headline)
                        Text(entry.snapshot.amountText)
                            .font(.system(.title3, design: .rounded).weight(.semibold))
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    LogDrinkButton(snapshot: entry.snapshot)
                }
            default:
                // Small: the ring and the amount, with the two buttons under
                // them when they exist.
                let hasButtons = entry.snapshot.canLog && entry.snapshot.drinkMl != nil
                VStack(spacing: 10) {
                    amountRing(size: hasButtons ? 92 : 112, stroke: hasButtons ? 9 : 11)
                    LogDrinkButton(snapshot: entry.snapshot)
                }
            }
        }
        .widgetURL(URL(string: "sparkyfitnessmobile://"))
    }

    /// The ring with the amount inside it, for the small widget.
    private func amountRing(size: CGFloat, stroke: CGFloat) -> some View {
        WaterRing(progress: entry.snapshot.progress, size: size, strokeWidth: stroke)
            .overlay(
                VStack(spacing: 0) {
                    Text(entry.snapshot.consumedText)
                        .font(.system(size: size * 0.27, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(entry.snapshot.goalLineText)
                        .font(.system(size: size * 0.13, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                }
                .padding(.horizontal, stroke + 4)
            )
    }

    private func ring(size: CGFloat, stroke: CGFloat) -> some View {
        WaterRing(progress: entry.snapshot.progress, size: size, strokeWidth: stroke)
            .overlay(
                Image(systemName: "drop.fill")
                    .font(.system(size: size * 0.3))
                    .foregroundStyle(Color.blue)
            )
    }
}

struct waterWidget: Widget {
    let kind: String = "waterWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WaterProvider()) { entry in
            waterWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("widget.water.name")
        .description("widget.water.description")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}
