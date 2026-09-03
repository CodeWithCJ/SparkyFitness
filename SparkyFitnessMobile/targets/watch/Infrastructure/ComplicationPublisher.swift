import Foundation
import WidgetKit

/// Today's goal progress as the complications need it — four fractions, each
/// already clamped 0...1 by the phone.
struct GoalProgress: Equatable {
    let calories: Double
    let protein: Double
    let carbs: Double
    let fat: Double
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

    /// Field names here are decoded by `EnergyGoalComplication`.
    private struct EnergySnapshot: Codable, Equatable {
        let date: String
        let calorieGoalProgress: Double
        let proteinGoalProgress: Double
        let carbsGoalProgress: Double
        let fatGoalProgress: Double
    }

    /// Field names here are decoded by `WaterGoalComplication`.
    private struct WaterSnapshotPayload: Codable, Equatable {
        let date: String
        let progress: Double
    }

    // MARK: - Publishing

    /// Publishes nutrition progress for the Daily Energy Goal complication.
    static func publish(goals: GoalProgress) {
        write(
            EnergySnapshot(
                date: CheckInDate.today(),
                calorieGoalProgress: goals.calories,
                proteinGoalProgress: goals.protein,
                carbsGoalProgress: goals.carbs,
                fatGoalProgress: goals.fat
            ),
            forKey: Energy.key,
            reloading: Energy.kind
        )
    }

    /// Publishes water progress for the Water Intake complication.
    static func publish(waterProgress: Double) {
        write(
            WaterSnapshotPayload(
                date: CheckInDate.today(),
                progress: max(0, min(1, waterProgress))
            ),
            forKey: Water.key,
            reloading: Water.kind
        )
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
