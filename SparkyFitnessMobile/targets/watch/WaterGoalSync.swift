import Foundation
import WidgetKit

/// Relays today's water progress from WatchConnectivity into the shared App
/// Group, where the Water Intake complication (a separate process,
/// `targets/watch-widget`) can read it.
///
/// Sibling of `EnergyGoalSync`, deliberately kept separate rather than folded
/// into its snapshot: the two feed different complications, and a wearer who
/// only has one of them on their face shouldn't have the other's data
/// changing force a redraw they can't see. Separate keys, separate kinds,
/// separate reloads.
enum WaterGoalSync {
    private static let snapshotKey = "waterGoalSnapshot"
    /// Must match the `kind` string in targets/watch-widget's Widget.
    private static let complicationKind = "waterGoalComplication"

    private struct Snapshot: Codable, Equatable {
        let date: String
        let progress: Double
    }

    /// Writes today's progress and asks WidgetKit to redraw — but only when
    /// the value actually moved.
    ///
    /// The guard matters: `handle(context:)` runs on every context push, and
    /// the phone re-pushes on app launch, foreground, and every reachability
    /// change, not just when water was logged. watchOS caps how many times an
    /// app may force a complication redraw per day and silently ignores the
    /// calls past that cap — so reloading on every identical push burns the
    /// budget on nothing and leaves real changes later in the day unable to
    /// refresh. Comparing against what's already stored keeps the reloads
    /// proportional to actual drinks.
    static func write(progress: Double) {
        guard
            let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
            !appGroup.isEmpty,
            let defaults = UserDefaults(suiteName: appGroup)
        else { return }

        let snapshot = Snapshot(
            date: CheckInDate.today(),
            progress: max(0, min(1, progress))
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
