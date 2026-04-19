import WidgetKit
import SwiftUI

struct MacroSnapshot {
    let proteinGrams: Double
    let carbsGrams: Double
    let fatGrams: Double
    let caloriesConsumed: Double
    let lastUpdated: Date?

    var proteinKcal: Double { proteinGrams * 4 }
    var carbsKcal:   Double { carbsGrams   * 4 }
    var fatKcal:     Double { fatGrams     * 9 }
    var macroKcalTotal: Double { proteinKcal + carbsKcal + fatKcal }
    var hasData: Bool { macroKcalTotal > 0 || caloriesConsumed > 0 }

    static let empty = MacroSnapshot(
        proteinGrams: 0, carbsGrams: 0, fatGrams: 0,
        caloriesConsumed: 0, lastUpdated: nil
    )
}

private struct MacroSnapshotPayload: Decodable {
    let date: String?
    let protein: Double?
    let carbs: Double?
    let fat: Double?
    let calories: Double?
    let lastUpdated: Double?
}

private func loadMacroSnapshot() -> MacroSnapshot {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "macroSnapshot"),
        let payload = try? JSONDecoder().decode(MacroSnapshotPayload.self, from: data),
        isToday(payload.date)
    else {
        return .empty
    }
    return MacroSnapshot(
        proteinGrams: payload.protein ?? 0,
        carbsGrams: payload.carbs ?? 0,
        fatGrams: payload.fat ?? 0,
        caloriesConsumed: payload.calories ?? 0,
        lastUpdated: payload.lastUpdated.map { Date(timeIntervalSince1970: $0) }
    )
}

struct MacroEntry: TimelineEntry {
    let date: Date
    let snapshot: MacroSnapshot
}

struct MacroProvider: TimelineProvider {
    func placeholder(in context: Context) -> MacroEntry {
        MacroEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (MacroEntry) -> Void) {
        completion(MacroEntry(date: Date(), snapshot: loadMacroSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MacroEntry>) -> Void) {
        let now = Date()
        let entry = MacroEntry(date: now, snapshot: loadMacroSnapshot())
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

private enum MacroPalette {
    static let protein = Color(red: 0.965, green: 0.694, blue: 0.318)
    static let carbs   = Color(red: 0.484, green: 0.840, blue: 0.503)
    static let fat     = Color(red: 0.430, green: 0.797, blue: 0.913)
}

private struct MacroRing: View {
    let snapshot: MacroSnapshot
    let size: CGFloat
    let strokeWidth: CGFloat

    private static let segmentGap: Double = 0.006

    var body: some View {
        ZStack {
            Circle()
                .stroke(
                    Color.secondary.opacity(0.2),
                    style: StrokeStyle(lineWidth: strokeWidth)
                )

            if snapshot.hasData && snapshot.macroKcalTotal > 0 {
                let total = snapshot.macroKcalTotal
                let proteinFrac = snapshot.proteinKcal / total
                let carbsFrac = snapshot.carbsKcal / total
                let fatFrac = snapshot.fatKcal / total

                segment(
                    start: 0,
                    length: proteinFrac,
                    color: MacroPalette.protein
                )
                segment(
                    start: proteinFrac,
                    length: carbsFrac,
                    color: MacroPalette.carbs
                )
                segment(
                    start: proteinFrac + carbsFrac,
                    length: fatFrac,
                    color: MacroPalette.fat
                )
            }
        }
        .frame(width: size, height: size)
    }

    @ViewBuilder
    private func segment(start: Double, length: Double, color: Color) -> some View {
        let gap = Self.segmentGap
        let from = CGFloat(start + gap / 2)
        let to = CGFloat(start + max(0, length - gap / 2))
        if to > from {
            Circle()
                .trim(from: from, to: to)
                .stroke(
                    color,
                    style: StrokeStyle(lineWidth: strokeWidth, lineCap: .butt)
                )
                .rotationEffect(.degrees(-90))
        }
    }
}

private struct MacroRingWithLabel: View {
    let snapshot: MacroSnapshot
    let ringSize: CGFloat
    let strokeWidth: CGFloat
    let numberFontSize: CGFloat

    private var centerText: String {
        guard snapshot.hasData else { return "—" }
        return Self.numberFormatter.string(from: NSNumber(value: Int(snapshot.caloriesConsumed.rounded()))) ?? "0"
    }

    private static let numberFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()

    var body: some View {
        MacroRing(snapshot: snapshot, size: ringSize, strokeWidth: strokeWidth)
            .overlay(
                VStack(spacing: 0) {
                    Text(centerText)
                        .font(.system(size: numberFontSize, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("kcal")
                        .font(.system(size: numberFontSize * 0.58))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, strokeWidth)
            )
    }
}

private struct MacroRow: View {
    let label: String
    let grams: Double
    let color: Color

    private var valueText: String {
        "\(Int(grams.rounded())) g"
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
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

struct macroWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: MacroProvider.Entry

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
            MacroRingWithLabel(
                snapshot: entry.snapshot,
                ringSize: 80,
                strokeWidth: 8,
                numberFontSize: 18
            )
            VStack(spacing: 3) {
                MacroRow(label: "Protein", grams: entry.snapshot.proteinGrams, color: MacroPalette.protein)
                MacroRow(label: "Carbs", grams: entry.snapshot.carbsGrams, color: MacroPalette.carbs)
                MacroRow(label: "Fat", grams: entry.snapshot.fatGrams, color: MacroPalette.fat)
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
                MacroRingWithLabel(
                    snapshot: entry.snapshot,
                    ringSize: ringSize,
                    strokeWidth: 7,
                    numberFontSize: isCompact ? 18 : 20
                )

                VStack(alignment: .leading, spacing: 20) {
                    MacroRow(label: "Protein", grams: entry.snapshot.proteinGrams, color: MacroPalette.protein)
                    MacroRow(label: "Carbs", grams: entry.snapshot.carbsGrams, color: MacroPalette.carbs)
                    MacroRow(label: "Fat", grams: entry.snapshot.fatGrams, color: MacroPalette.fat)
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

struct macroWidget: Widget {
    let kind: String = "macroWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacroProvider()) { entry in
            macroWidgetEntryView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("Macros")
        .description("Today's protein, carbs, and fat at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

#if DEBUG
    #Preview(as: .systemSmall) {
        macroWidget()
    } timeline: {
        MacroEntry(
            date: .now,
            snapshot: MacroSnapshot(proteinGrams: 92, carbsGrams: 180, fatGrams: 55, caloriesConsumed: 1540, lastUpdated: .now)
        )
        MacroEntry(date: .now, snapshot: .empty)
    }

    #Preview(as: .systemMedium) {
        macroWidget()
    } timeline: {
        MacroEntry(
            date: .now,
            snapshot: MacroSnapshot(proteinGrams: 92, carbsGrams: 180, fatGrams: 55, caloriesConsumed: 1540, lastUpdated: .now)
        )
        MacroEntry(date: .now, snapshot: .empty)
    }
#endif
