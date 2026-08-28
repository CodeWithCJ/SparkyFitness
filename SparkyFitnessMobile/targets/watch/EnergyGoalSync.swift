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

    private struct Snapshot: Codable {
        let date: String
        let calorieGoalProgress: Double
        let proteinGoalProgress: Double
        let carbsGoalProgress: Double
        let fatGoalProgress: Double
    }

    /// Writes today's progress and asks WidgetKit to redraw the complication
    /// immediately, rather than waiting for its next scheduled timeline
    /// refresh (which on watchOS can lag well behind when the data actually
    /// changed).
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
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)

        WidgetCenter.shared.reloadTimelines(ofKind: complicationKind)
    }
}
