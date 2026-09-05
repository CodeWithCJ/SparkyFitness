import WidgetKit
import SwiftUI

// Like EnergyGoalComplication.swift, this target can't import targets/watch's
// Swift files (each `expo-target` is its own compiled module), so the small
// shared pieces — date helpers, the app group lookup — are duplicated rather
// than shared. Kept file-private here so the two complications' copies don't
// collide at link time.

private let waterDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

private func waterTodayString() -> String {
    waterDateFormatter.string(from: Date())
}

private func waterIsToday(_ dateString: String?) -> Bool {
    guard let dateString else { return false }
    return dateString == waterTodayString()
}

private func waterAppGroupIdentifier() -> String? {
    Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String
}

/// Mirrors the `WaterSnapshotPayload` type `ComplicationPublisher` encodes — one
/// fraction, already clamped to 0...1 by the watch app.
struct WaterGoalSnapshot {
    let progress: Double
 
    static let empty = WaterGoalSnapshot(progress: 0)
}

private struct WaterGoalSnapshotPayload: Decodable {
    let date: String?
    let progress: Double?
}

private func loadWaterGoalSnapshot() -> WaterGoalSnapshot {
    guard
        let appGroup = waterAppGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let data = defaults.data(forKey: "waterGoalSnapshot"),
        let payload = try? JSONDecoder().decode(WaterGoalSnapshotPayload.self, from: data),
        waterIsToday(payload.date)
    else {
        return .empty
    }
    return WaterGoalSnapshot(progress: payload.progress ?? 0)
}

struct WaterGoalEntry: TimelineEntry {
    let date: Date
    let snapshot: WaterGoalSnapshot
}

struct WaterGoalProvider: TimelineProvider {
    func placeholder(in context: Context) -> WaterGoalEntry {
        WaterGoalEntry(date: Date(), snapshot: WaterGoalSnapshot(progress: 0.6))
    }

    func getSnapshot(in context: Context, completion: @escaping (WaterGoalEntry) -> Void) {
        completion(WaterGoalEntry(date: Date(), snapshot: loadWaterGoalSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WaterGoalEntry>) -> Void) {
        let now = Date()
        let entry = WaterGoalEntry(date: now, snapshot: loadWaterGoalSnapshot())
        // Same cadence as the Daily Energy Goal complication: whichever comes
        // first, a 15-minute check-in or the goal resetting at midnight.
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

/// Matches `GoalPalette.water` in targets/watch — separate compiled targets
/// can't share a constant, so if one changes, change both.
private let waterTint = Color.cyan

/// Open gauge: an arc broken at the bottom, where the droplet sits, with the
/// percentage centred inside it. The break is what makes the complication
/// read as "water" at a glance on a face that may also be carrying the macro
/// rings — those are closed circles, this one isn't.
private struct WaterGoalRing: View {
    let progress: Double

    /// How much of the circle is left open at the bottom for the droplet.
    /// Has to clear more than the droplet itself: the arc's round end caps
    /// each extend half a stroke width past where the trim stops, eating
    /// into the gap from both sides.
    private static let gapDegrees: Double = 60

    /// The fraction of a full turn the arc actually covers. Every trim below
    /// is scaled by this, so progress still runs 0...1 over the visible arc
    /// rather than over a circle that isn't all there.
    private static let arcSpan: Double = 1 - Self.gapDegrees / 360

    /// Puts the arc's start just clockwise of the gap.
    ///
    /// A Circle's trim starts at 3 o'clock, which is 90° clockwise of 12, and
    /// the gap is centred on 6 o'clock (180°). Starting the arc at
    /// `180 + gap/2` — the gap's trailing edge, low on the left — means
    /// sweeping clockwise from there climbs the left side, crosses the top
    /// and comes down the right to finish at the gap's leading edge. So the
    /// rotation needed is that start minus the 90° the trim already carries.
    private static let arcStartDegrees: Double = 90 + Self.gapDegrees / 2

    private var clamped: Double { max(0, min(1, progress)) }

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let stroke = side * 0.10
            let dropSize = side * 0.20

            ZStack {
                // Inset by half the stroke, because a stroke straddles the
                // path it's drawn on: without this the outer half sits
                // outside the frame, and accessoryCircular clips to its
                // circular container, so the arc — round end caps included —
                // comes back visibly sliced down its length. Costs nothing
                // visually, since the ring simply sits where it always looked
                // like it was.
                ZStack {
                    Circle()
                        .trim(from: 0, to: CGFloat(Self.arcSpan))
                        .stroke(
                            Color.secondary.opacity(0.25),
                            style: StrokeStyle(lineWidth: stroke, lineCap: .round)
                        )
                        .rotationEffect(.degrees(Self.arcStartDegrees))

                    // Skipped entirely at zero: a round cap on an empty trim
                    // still paints, leaving a stray dot floating at the arc's
                    // start.
                    if clamped > 0 {
                        Circle()
                            .trim(from: 0, to: CGFloat(Self.arcSpan * clamped))
                            .stroke(
                                waterTint,
                                style: StrokeStyle(lineWidth: stroke, lineCap: .round)
                            )
                            .rotationEffect(.degrees(Self.arcStartDegrees))
                    }
                }
                .padding(stroke / 2)

                Text(percentText)
                    .font(.system(size: side * 0.34, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    // Clear of the arc on both sides — the percent sign makes
                    // this string wider than a bare number would be. Scales
                    // with the stroke (a thicker arc leaves less room inside
                    // it), but at a tighter multiple than the arc's own width
                    // so thickening it doesn't shrink the number twice over.
                    .padding(.horizontal, stroke * 1.15)

                // Sits in the gap, so it reads as part of the ring rather
                // than something parked underneath it — but pulled inward
                // from the arc's centreline by a fraction of its own size.
                // Sitting exactly on the centreline put the glyph's centre at
                // 0.45 of the way out, which left its lower half hanging past
                // where accessoryCircular clips, and the drop came back with
                // its point cut off. Scaling the pull-in off `dropSize` keeps
                // that clearance if the drop is ever resized.
                Image(systemName: "drop.fill")
                    .font(.system(size: dropSize))
                    .foregroundStyle(waterTint)
                    .offset(y: side / 2 - stroke / 2 - dropSize * 0.4)
            }
            .frame(width: side, height: side)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var percentText: String {
        "\(Int((clamped * 100).rounded()))%"
    }
}

struct WaterGoalComplicationEntryView: View {
    var entry: WaterGoalProvider.Entry

    var body: some View {
        WaterGoalRing(progress: entry.snapshot.progress)
            // Opens the watch app straight to its Water page. The link was
            // wired ahead of this complication existing — see
            // ComplicationLinks.swift and WatchDeepLink in targets/watch.
            .widgetURL(ComplicationLink.water.url)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "Water \(Int((max(0, min(1, entry.snapshot.progress)) * 100).rounded()))% of goal."
            )
    }
}

struct WaterGoalComplication: Widget {
    // Must match ComplicationPublisher's Water.kind (targets/watch).
    let kind: String = "waterGoalComplication"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WaterGoalProvider()) { entry in
            WaterGoalComplicationEntryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Water Intake")
        .description("How much of today's water goal you've reached.")
        // Round only, matching the Daily Energy Goal complication.
        .supportedFamilies([.accessoryCircular])
    }
}

#if DEBUG
    #Preview(as: .accessoryCircular) {
        WaterGoalComplication()
    } timeline: {
        WaterGoalEntry(date: .now, snapshot: WaterGoalSnapshot(progress: 0.6))
        WaterGoalEntry(date: .now, snapshot: WaterGoalSnapshot(progress: 1))
        WaterGoalEntry(date: .now, snapshot: .empty)
    }
#endif
