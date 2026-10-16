import Foundation
import WidgetKit

/// Today's goal progress as the complications need it — four fractions, each
/// already clamped 0...1 by the phone.
struct GoalProgress: Equatable {
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
    /// Grams eaten and the goal behind each fraction, so a macro complication
    /// can show the numbers. Nil from a phone that does not send them.
    var proteinGrams: MacroGrams? = nil
    var carbsGrams: MacroGrams? = nil
    var fatGrams: MacroGrams? = nil
}

struct MacroGrams: Equatable {
    let consumed: Double
    let goal: Double
}

/// The watch app's only writer to shared App Group storage, and the only
/// caller of `WidgetCenter`.
///
/// Replaces the former `EnergyGoalSync` and `WaterGoalSync`, which were the
/// same mechanism written twice — same App Group lookup, same change-guard,
/// same reload call, differing only in key, kind and payload shape.
///
/// Why this exists at all: a complication runs in a *separate process* and
/// cannot read the watch app's own `UserDefaults.standard`, so anything it
/// displays has to be copied into storage both processes can see. This is
/// deliberately one-way — nothing here ever reads back what a complication
/// did, and the app's own pages never read from here.
enum ComplicationPublisher {
    // MARK: - Wire constants
    //
    // Every value below is a contract with targets/watch-widget, which decodes
    // these keys out of the shared suite and matches these kinds. Renaming one
    // here without renaming it there breaks the complication silently: it
    // simply finds nothing and renders its empty state.

    private enum Energy {
        static let key = "energyGoalSnapshot"
        static let kind = "energyGoalComplication"
    }

    private enum Water {
        static let key = "waterGoalSnapshot"
        static let kind = "waterGoalComplication"
    }

    private enum Steps {
        static let key = "stepsSnapshot"
        static let kind = "stepsComplication"
    }

    /// Field names here are decoded by `StepsComplication`.
    private struct StepsSnapshotPayload: Codable, Equatable {
        let date: String
        let count: Int
        let goal: Int
    }

    private enum Fasting {
        static let key = "fastingSnapshot"
        static let kind = "fastingComplication"
    }

    /// Field names here are decoded by `FastingComplication`. Times are epoch ms.
    private struct FastingSnapshotPayload: Codable, Equatable {
        let active: Bool
        let startedAt: Double?
        let targetEndAt: Double?
        let label: String?
    }

    /// Field names here are decoded by `EnergyGoalComplication`.
    private struct EnergySnapshot: Codable, Equatable {
        let date: String
        let calorieGoalProgress: Double
        let proteinGoalProgress: Double
        let carbsGoalProgress: Double
        let fatGoalProgress: Double
        let proteinConsumed: Double?
        let proteinGoal: Double?
        let carbsConsumed: Double?
        let carbsGoal: Double?
        let fatConsumed: Double?
        let fatGoal: Double?
    }

    /// Field names here are decoded by `WaterGoalComplication`.
    private struct WaterSnapshotPayload: Codable, Equatable {
        let date: String
        let progress: Double
    }

    // MARK: - Publishing

    /// Publishes nutrition progress for the Daily Energy Goal complication.
    ///
    /// `day` is the calendar day these numbers describe. It is checked rather
    /// than trusted — see `isPublishable(_:)`.
    static func publish(goals: GoalProgress, for day: String) {
        guard isPublishable(day) else { return }
        write(
            EnergySnapshot(
                date: day,
                calorieGoalProgress: goals.calories,
                proteinGoalProgress: goals.protein,
                carbsGoalProgress: goals.carbs,
                fatGoalProgress: goals.fat,
                proteinConsumed: goals.proteinGrams?.consumed,
                proteinGoal: goals.proteinGrams?.goal,
                carbsConsumed: goals.carbsGrams?.consumed,
                carbsGoal: goals.carbsGrams?.goal,
                fatConsumed: goals.fatGrams?.consumed,
                fatGoal: goals.fatGrams?.goal
            ),
            forKey: Energy.key,
            reloading: Energy.kind
        )
    }

    /// Publishes water progress for the Water Intake complication.
    static func publish(waterProgress: Double, for day: String) {
        guard isPublishable(day) else { return }
        write(
            WaterSnapshotPayload(
                date: day,
                progress: max(0, min(1, waterProgress))
            ),
            forKey: Water.key,
            reloading: Water.kind
        )
    }

    /// Publishes today's step count for the Steps complication.
    static func publish(steps: Int, goal: Int, for day: String) {
        guard isPublishable(day) else { return }
        write(
            StepsSnapshotPayload(date: day, count: max(0, steps), goal: max(1, goal)),
            forKey: Steps.key,
            reloading: Steps.kind
        )
    }

    /// Removes the step count, for a phone that has none for today, so the
    /// complication does not keep showing an earlier figure.
    static func clearSteps() {
        guard let defaults = sharedDefaults(),
              defaults.data(forKey: Steps.key) != nil else { return }
        defaults.removeObject(forKey: Steps.key)
        WidgetCenter.shared.reloadTimelines(ofKind: Steps.kind)
    }

    /// Publishes the running fast (or none) for the Fasting complication. Not
    /// day-scoped: a fast spans midnight, and the widget counts from its start.
    static func publish(fast: WatchFast?) {
        write(
            FastingSnapshotPayload(
                active: fast != nil,
                startedAt: fast.map { $0.startedAt.timeIntervalSince1970 * 1000 },
                targetEndAt: fast?.targetEndAt.map { $0.timeIntervalSince1970 * 1000 },
                label: fast?.label
            ),
            forKey: Fasting.key,
            reloading: Fasting.kind
        )
    }

    /// Refuses to publish numbers describing a day other than today.
    ///
    /// This used to be each caller's job, and one of them didn't do it.
    /// `handle(context:)` published whatever arrived while the snapshot
    /// stamped `CheckInDate.today()` itself, so replaying a cached overnight
    /// context laundered yesterday's figures through a fresh date and the
    /// widget's own `isToday` check waved them straight through. Stale data
    /// on a complication is worse than none: an empty ring reads as "nothing
    /// logged yet", yesterday's ring reads as a lie about today.
    ///
    /// Taking the day as a parameter instead of stamping it here is the whole
    /// point — a caller now has to state which day it means, and can't
    /// accidentally assert "today" about data it never checked.
    private static func isPublishable(_ day: String) -> Bool {
        day == CheckInDate.today()
    }

    // MARK: - Shared mechanism

    /// Stores `snapshot` and asks WidgetKit to redraw — but only when the
    /// value actually moved.
    ///
    /// The change-guard is load-bearing, not an optimisation. watchOS caps how
    /// many times an app may force a complication redraw per day and silently
    /// ignores calls past that cap: no error, nothing in the build log, the
    /// complication just stops updating until its own scheduled refresh comes
    /// round. Meanwhile the callers fire on every context push — app launch,
    /// foreground, every reachability change — not only when something was
    /// logged. Reloading on identical data spends the budget on nothing and
    /// leaves real changes later in the day unable to get through. Two
    /// complications now draw on that same per-app budget, which doubles the
    /// cost of getting this wrong.
    private static func write<Snapshot: Codable & Equatable>(
        _ snapshot: Snapshot,
        forKey key: String,
        reloading kind: String
    ) {
        guard let defaults = sharedDefaults() else { return }

        if let existing = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(Snapshot.self, from: existing),
           decoded == snapshot {
            return
        }

        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)

        WidgetCenter.shared.reloadTimelines(ofKind: kind)
    }

    /// The App Group suite both processes share.
    ///
    /// Read from this target's Info.plist rather than hard-coded: declaring
    /// the group under `entitlements` wires up code-signing only, so the
    /// identifier is surfaced as an Info.plist key that both the app and the
    /// widget extension read the same way.
    private static func sharedDefaults() -> UserDefaults? {
        guard
            let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
            !appGroup.isEmpty
        else { return nil }
        return UserDefaults(suiteName: appGroup)
    }
}
