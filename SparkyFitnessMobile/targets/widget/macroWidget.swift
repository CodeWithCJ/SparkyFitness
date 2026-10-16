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

/// The Lock Screen version of the macro ring: the same three shares of the
/// day's macro calories, separated by opacity because the Lock Screen tints
/// everything the same colour.
private struct MacroLockRing: View {
    let snapshot: MacroSnapshot

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.primary.opacity(0.15), style: StrokeStyle(lineWidth: 5))
            if snapshot.macroKcalTotal > 0 {
                let total = snapshot.macroKcalTotal
                let protein = snapshot.proteinKcal / total
                let carbs = snapshot.carbsKcal / total
                arc(from: 0, to: protein, opacity: 1)
                arc(from: protein, to: protein + carbs, opacity: 0.65)
                arc(from: protein + carbs, to: 1, opacity: 0.35)
            }
        }
        .padding(2)
    }

    private func arc(from: Double, to: Double, opacity: Double) -> some View {
        Circle()
            .trim(from: CGFloat(from + 0.01), to: CGFloat(max(from + 0.01, to - 0.01)))
            .stroke(Color.primary.opacity(opacity), style: StrokeStyle(lineWidth: 5, lineCap: .butt))
            .rotationEffect(.degrees(-90))
    }
}

private struct MacroRingWithLabel: View {
    let snapshot: MacroSnapshot
    let ringSize: CGFloat
    let strokeWidth: CGFloat
    let numberFontSize: CGFloat

    private var centerText: String {
        guard snapshot.hasData else { return "-" }
        return localizedNumberString(snapshot.caloriesConsumed)
    }

    var body: some View {
        MacroRing(snapshot: snapshot, size: ringSize, strokeWidth: strokeWidth)
            .overlay(
                VStack(spacing: 0) {
                    Text(centerText)
                        .font(.system(size: numberFontSize, weight: .bold, design: .rounded))
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text(localizedWidgetString("widget.kcal"))
                        .font(.system(size: numberFontSize * 0.58))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, strokeWidth)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(
                    String(
                        format: localizedWidgetString("widget.a11y.kcal"),
                        centerText
                    )
                )
            )
    }
}

private struct MacroRow: View {
    let label: String
    let grams: Double
    let color: Color

    private var valueText: String {
        String(
            format: localizedWidgetString("widget.grams"),
            localizedNumberString(grams)
        )
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
        .accessibilityElement(children: .combine)
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
            case .accessoryCircular:
                lockCircular
            case .accessoryRectangular:
                lockRectangular
            case .accessoryInline:
                lockInline
            case .systemSmall:
                smallBody
            default:
                mediumBody
            }
        }
        .widgetURL(dashboardURL)
    }

    // Lock Screen: the Lock Screen draws everything in one tint, so the three
    // macros are told apart by opacity and by their names, not by colour.
    private var lockSummary: String {
        let snapshot = entry.snapshot
        return [
            (localizedWidgetString("widget.protein"), snapshot.proteinGrams),
            (localizedWidgetString("widget.carbs"), snapshot.carbsGrams),
            (localizedWidgetString("widget.fat"), snapshot.fatGrams),
        ]
        .map { name, grams in
            "\(name) " + String(
                format: localizedWidgetString("widget.grams"),
                localizedNumberString(grams)
            )
        }
        .joined(separator: ", ")
    }

    private var lockCircular: some View {
        let calories = entry.snapshot.hasData
            ? localizedNumberString(entry.snapshot.caloriesConsumed)
            : "-"
        return MacroLockRing(snapshot: entry.snapshot)
            .overlay(
                Text(calories)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .padding(.horizontal, 6)
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                String(format: localizedWidgetString("widget.a11y.kcal"), calories)
                    + ", "
                    + lockSummary
            )
    }

    private var lockRectangular: some View {
        VStack(spacing: 1) {
            lockRow(localizedWidgetString("widget.protein"), entry.snapshot.proteinGrams, opacity: 1)
            lockRow(localizedWidgetString("widget.carbs"), entry.snapshot.carbsGrams, opacity: 0.7)
            lockRow(localizedWidgetString("widget.fat"), entry.snapshot.fatGrams, opacity: 0.45)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lockSummary)
    }

    private func lockRow(_ name: String, _ grams: Double, opacity: Double) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(Color.primary.opacity(opacity))
                .frame(width: 7, height: 7)
            Text(name)
                .font(.caption)
                .lineLimit(1)
            Spacer(minLength: 0)
            Text(String(format: localizedWidgetString("widget.grams"), localizedNumberString(grams)))
                .font(.system(.caption, design: .rounded).weight(.semibold))
                .lineLimit(1)
        }
    }

    private var lockInline: some View {
        let snapshot = entry.snapshot
        let text = [
            (localizedWidgetString("widget.protein"), snapshot.proteinGrams),
            (localizedWidgetString("widget.carbs"), snapshot.carbsGrams),
            (localizedWidgetString("widget.fat"), snapshot.fatGrams),
        ]
        .map { name, grams in
            "\(name) " + String(
                format: localizedWidgetString("widget.grams"),
                localizedNumberString(grams)
            )
        }
        .joined(separator: " · ")
        return Label(text, systemImage: "fork.knife")
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
                MacroRow(label: localizedWidgetString("widget.protein"), grams: entry.snapshot.proteinGrams, color: MacroPalette.protein)
                MacroRow(label: localizedWidgetString("widget.carbs"), grams: entry.snapshot.carbsGrams, color: MacroPalette.carbs)
                MacroRow(label: localizedWidgetString("widget.fat"), grams: entry.snapshot.fatGrams, color: MacroPalette.fat)
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
                    MacroRow(label: localizedWidgetString("widget.protein"), grams: entry.snapshot.proteinGrams, color: MacroPalette.protein)
                    MacroRow(label: localizedWidgetString("widget.carbs"), grams: entry.snapshot.carbsGrams, color: MacroPalette.carbs)
                    MacroRow(label: localizedWidgetString("widget.fat"), grams: entry.snapshot.fatGrams, color: MacroPalette.fat)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                Rectangle()
                    .fill(Color.secondary.opacity(0.25))
                    .frame(width: 1)
                    .frame(maxHeight: .infinity)

                VStack(spacing: 16) {
                    ActionButton(
                        icon: "magnifyingglass",
                        destination: URL(string: "sparkyfitnessmobile://search")!,
                        accessibilityLabel: localizedWidgetString("widget.search_food")
                    )
                    ActionButton(
                        icon: "barcode.viewfinder",
                        destination: URL(string: "sparkyfitnessmobile://scan")!,
                        accessibilityLabel: localizedWidgetString("widget.scan_barcode")
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
        .configurationDisplayName("widget.macro.name")
        .description("widget.macro.description")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
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
