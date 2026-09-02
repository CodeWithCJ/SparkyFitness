import WidgetKit
import SwiftUI

// This target can't import targets/watch's Swift files (each `expo-target`
// is its own compiled module), so the small pieces it needs — date helpers,
// the app group lookup — are duplicated here rather than shared. Mirrors the
// same convention targets/widget already uses for its own SharedHelpers.swift.

private let snapshotDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private func todayDateString() -> String {
    snapshotDateFormatter.string(from: Date())
}

private func isToday(_ dateString: String?) -> Bool {
    guard let dateString else { return false }
    return dateString == todayDateString()
}

private func appGroupIdentifier() -> String? {
    Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String
}

/// Mirrors the `Snapshot` type `EnergyGoalSync` (targets/watch) encodes —
/// four fractions, each already clamped to 0...1 by the phone.
struct EnergyGoalSnapshot {
    let calorieGoalProgress: Double
    let proteinGoalProgress: Double
    let carbsGoalProgress: Double
    let fatGoalProgress: Double

    static let empty = EnergyGoalSnapshot(
        calorieGoalProgress: 0,
        proteinGoalProgress: 0,
        carbsGoalProgress: 0,
        fatGoalProgress: 0
    )
}

private struct EnergyGoalSnapshotPayload: Decodable {
    let date: String?
    let calorieGoalProgress: Double?
    let proteinGoalProgress: Double?
    let carbsGoalProgress: Double?
    let fatGoalProgress: Double?
}

private func loadEnergyGoalSnapshot() -> EnergyGoalSnapshot {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "energyGoalSnapshot"),
        let payload = try? JSONDecoder().decode(EnergyGoalSnapshotPayload.self, from: data),
        isToday(payload.date)
    else {
        return .empty
    }
    return EnergyGoalSnapshot(
        calorieGoalProgress: payload.calorieGoalProgress ?? 0,
        proteinGoalProgress: payload.proteinGoalProgress ?? 0,
        carbsGoalProgress: payload.carbsGoalProgress ?? 0,
        fatGoalProgress: payload.fatGoalProgress ?? 0
    )
}

struct EnergyGoalEntry: TimelineEntry {
    let date: Date
    let snapshot: EnergyGoalSnapshot
}

struct EnergyGoalProvider: TimelineProvider {
    func placeholder(in context: Context) -> EnergyGoalEntry {
        EnergyGoalEntry(
            date: Date(),
            snapshot: EnergyGoalSnapshot(
                calorieGoalProgress: 0.6,
                proteinGoalProgress: 0.8,
                carbsGoalProgress: 0.5,
                fatGoalProgress: 0.3
            )
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (EnergyGoalEntry) -> Void) {
        completion(EnergyGoalEntry(date: Date(), snapshot: loadEnergyGoalSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EnergyGoalEntry>) -> Void) {
        let now = Date()
        let entry = EnergyGoalEntry(date: now, snapshot: loadEnergyGoalSnapshot())
        // Same refresh cadence as the iOS calorie/macro widgets: whichever
        // comes first, a 15-minute check-in or the goals resetting at
        // midnight.
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

/// Mirror of `GoalPalette` in targets/watch — separate compiled targets can't
/// share a constant, so if one changes, change both.
private enum ComplicationPalette {
    /// #8992DC, sampled off the phone's calorie ring. Sitting outside the
    /// macro hues entirely is deliberate: the inner calorie ring sits right
    /// against the outer macro ring here, and the previous `.green` was a
    /// near-neighbour of carbs once the macros took the app's colours.
    static let calories = Color(red: 0.537, green: 0.573, blue: 0.863)
    // Sampled straight off the phone's Nutrients card, so a macro is the same
    // colour on the watch face as in the app: fat #8AC2DA, carbs #97C692,
    // protein #DBB06F. Literal values rather than the system colours because
    // these are deliberately muted — `.yellow`/`.orange`/`.blue` are far more
    // saturated and wouldn't match.
    static let fat = Color(red: 0.541, green: 0.761, blue: 0.855)
    static let carbs = Color(red: 0.592, green: 0.776, blue: 0.573)
    static let protein = Color(red: 0.859, green: 0.690, blue: 0.435)
}

/// Inner ring: a single full-circle progress trim for the calorie goal.
/// Reaching or passing the goal (progress == 1) draws a complete circle.
private struct CalorieRing: View {
    let progress: Double
    let size: CGFloat
    let strokeWidth: CGFloat

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.25), style: StrokeStyle(lineWidth: strokeWidth))
            Circle()
                .trim(from: 0, to: CGFloat(progress))
                .stroke(
                    ComplicationPalette.calories,
                    style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
        }
        // Half the stroke, because a stroke straddles its path — see the
        // matching note in MacroGoalRing. Applied here too even though this
        // ring sits well inside the container and was never clipped: once the
        // outer ring is inset inward, an un-inset inner ring would collide
        // with it.
        .padding(strokeWidth / 2)
        .frame(width: size, height: size)
    }
}

/// Outer ring: three FIXED equal thirds (120° each) — fat, carbs, protein, in
/// that clockwise order starting from 12 o'clock. Each third independently
/// fills 0...100% of its own goal within its own 120° allotment; this is
/// deliberately not proportional to the macros' relative gram/kcal amounts
/// (that's the different composition-ring concept the iOS macroWidget uses).
private struct MacroGoalRing: View {
    let snapshot: EnergyGoalSnapshot
    let size: CGFloat
    let strokeWidth: CGFloat

    /// Visual gap between the three sections, as a fraction of a full turn.
    /// Has to clear the `.round` line caps before any daylight actually shows:
    /// each cap extends about strokeWidth/2 along the arc — roughly 0.0175 of
    /// the circumference at this ring's proportions — so the two caps facing
    /// each other across a gap swallow ~0.035 of it between them. The original
    /// 0.01 was entirely inside that, which is why the sections read as one
    /// continuous ring.
    private static let sectionGap: Double = 0.055
    private static let third: Double = 1.0 / 3.0

    var body: some View {
        ZStack {
            trackSection(start: 0)
            trackSection(start: Self.third)
            trackSection(start: 2 * Self.third)

            section(start: 0, filled: snapshot.fatGoalProgress, color: ComplicationPalette.fat)
            section(start: Self.third, filled: snapshot.carbsGoalProgress, color: ComplicationPalette.carbs)
            section(start: 2 * Self.third, filled: snapshot.proteinGoalProgress, color: ComplicationPalette.protein)
        }
        // Inset by half the stroke, because a stroke straddles the path it's
        // drawn on. This ring's frame is the full complication width, so
        // without the inset its outer half fell outside the frame and
        // accessoryCircular — which clips to a circle — cut it away: the ring
        // was rendering at half its intended thickness with the round caps
        // sliced lengthwise. The gap to the inner ring is unchanged, since
        // CalorieRing is inset by the same amount.
        .padding(strokeWidth / 2)
        .frame(width: size, height: size)
    }

    /// The dim full-width background for one 120° section, so an unfilled
    /// section still reads as "a section", not empty space.
    @ViewBuilder
    private func trackSection(start: Double) -> some View {
        let gap = Self.sectionGap
        Circle()
            .trim(from: CGFloat(start + gap / 2), to: CGFloat(start + Self.third - gap / 2))
            .stroke(
                Color.secondary.opacity(0.25),
                style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round)
            )
            .rotationEffect(.degrees(-90))
    }

    /// The filled progress within one 120° section, scaled by that macro's
    /// own goal progress — a full section means 100% of that macro's goal.
    @ViewBuilder
    private func section(start: Double, filled: Double, color: Color) -> some View {
        let gap = Self.sectionGap
        let usable = Self.third - gap
        let length = usable * max(0, min(1, filled))
        let from = start + gap / 2
        let to = from + length
        if length > 0 {
            Circle()
                .trim(from: CGFloat(from), to: CGFloat(to))
                .stroke(color, style: StrokeStyle(lineWidth: strokeWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

private struct EnergyGoalRings: View {
    let snapshot: EnergyGoalSnapshot

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let outerStroke = side * 0.11
            let innerStroke = side * 0.11
            let outerSize = side
            let innerSize = side - outerStroke * 2 - side * 0.06

            ZStack {
                MacroGoalRing(snapshot: snapshot, size: outerSize, strokeWidth: outerStroke)
                CalorieRing(progress: snapshot.calorieGoalProgress, size: innerSize, strokeWidth: innerStroke)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
    }
}

private func percentText(_ fraction: Double) -> String {
    "\(Int((max(0, min(1, fraction)) * 100).rounded()))%"
}

struct EnergyGoalComplicationEntryView: View {
    var entry: EnergyGoalProvider.Entry

    var body: some View {
        // Bare ring, no visible text — Adam's choice, to keep the watch face
        // uncluttered. Everything still reaches VoiceOver/Assistive Access
        // through the accessibility label below.
        EnergyGoalRings(snapshot: entry.snapshot)
            // Tapping the complication opens the watch app on its Goals page
            // rather than wherever the app was last left.
            .widgetURL(ComplicationLink.goals.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "Calories \(percentText(entry.snapshot.calorieGoalProgress)) of goal. "
                    + "Fat \(percentText(entry.snapshot.fatGoalProgress)), "
                    + "carbs \(percentText(entry.snapshot.carbsGoalProgress)), "
                    + "protein \(percentText(entry.snapshot.proteinGoalProgress)) of their goals."
            )
    }
}

struct EnergyGoalComplication: Widget {
    // Must match EnergyGoalSync.complicationKind (targets/watch).
    let kind: String = "energyGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: EnergyGoalProvider()) { entry in
            EnergyGoalComplicationEntryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Daily Energy Goal")
        .description("Calories in the inner ring, fat/carbs/protein goal progress in the outer ring.")
        .supportedFamilies([.accessoryCircular])
    }
}

#if DEBUG
    #Preview(as: .accessoryCircular) {
        EnergyGoalComplication()
    } timeline: {
        EnergyGoalEntry(
            date: .now,
            snapshot: EnergyGoalSnapshot(
                calorieGoalProgress: 0.65,
                proteinGoalProgress: 1,
                carbsGoalProgress: 0.4,
                fatGoalProgress: 0.7
            )
        )
        EnergyGoalEntry(date: .now, snapshot: .empty)
    }
#endif
