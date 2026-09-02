import Foundation
import WidgetKit

/// Relays today's nutrition-goal progress from WatchConnectivity into the
/// shared App Group, where the Daily Energy Goal complication (a separate
/// process, `targets/watch-widget`) can read it.
///
/// Deliberately not part of `CheckInStore`/`WatchContext`: those are about
/// weight/body-fat check-ins, which this app's own UI displays. Nutrition
/// goal progress is never shown anywhere in this app — it exists only to
/// feed the complication — so it skips the app's own persistence layer
/// entirely and goes straight to the shared storage the complication reads.
enum EnergyGoalSync {
    private static let snapshotKey = "energyGoalSnapshot"
    /// Must match the `kind` string in targets/watch-widget's Widget.
    private static let complicationKind = "energyGoalComplication"

    private struct Snapshot: Codable, Equatable {
        let date: String
        let calorieGoalProgress: Double
        let proteinGoalProgress: Double
        let carbsGoalProgress: Double
        let fatGoalProgress: Double
    }

    /// Writes today's progress and asks WidgetKit to redraw the complication
    /// immediately, rather than waiting for its next scheduled timeline
    /// refresh (which on watchOS can lag well behind when the data actually
    /// changed) — but only when the value actually moved.
    ///
    /// The guard matters: `handle(context:)` runs on every context push, and
    /// the phone re-pushes on app launch, foreground, and every reachability
    /// change, not just when food was logged. watchOS caps how many times an
    /// app may force a complication redraw per day and silently ignores the
    /// calls past that cap — no error, nothing in the build log, the
    /// complication simply stops updating until its own scheduled refresh
    /// comes around. Reloading on every identical push spends that budget on
    /// nothing; comparing against what's already stored keeps the reloads
    /// proportional to actual changes. Doubly load-bearing now that a second
    /// complication (WaterGoalSync) draws on the same per-app budget.
    static func write(
        calorieGoalProgress: Double,
        proteinGoalProgress: Double,
        carbsGoalProgress: Double,
        fatGoalProgress: Double
    ) {
        guard
            let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
            !appGroup.isEmpty,
            let defaults = UserDefaults(suiteName: appGroup)
        else { return }

        let snapshot = Snapshot(
            date: CheckInDate.today(),
            calorieGoalProgress: calorieGoalProgress,
            proteinGoalProgress: proteinGoalProgress,
            carbsGoalProgress: carbsGoalProgress,
            fatGoalProgress: fatGoalProgress
        )

        if let existing = defaults.data(forKey: snapshotKey),
           let decoded = try? JSONDecoder().decode(Snapshot.self, from: existing),
           decoded == snapshot {
            return
        }

        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)

        WidgetCenter.shared.reloadTimelines(ofKind: complicationKind)
    }
}
