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
        /// The Protein, Carbs and Fat complications decode this same key, so
        /// every one of them has to be reloaded when it changes, not just the
        /// ring. Leaving them out kept them on stale numbers until watchOS
        /// got round to their own scheduled refresh, often hours later (#3641).
        static let kinds = [
            kind,
            "proteinGoalComplication",
            "carbsGoalComplication",
            "fatGoalComplication",
            CalorieGoal.kind,
        ]
    }

    /// The calories-only complication reads the Energy snapshot above, so it
    /// has no key of its own — only a kind to reload.
    private enum CalorieGoal {
        static let kind = "calorieGoalComplication"
    }

    /// The user-defined complication. The wearer's definitions live under
    /// `key` (sent by the phone as `complicationConfig`); the numbers they can
    /// show live under `metricsKey`. `revisionKey` keeps the newest list when
    /// queued copies arrive out of order.
    private enum Custom {
        static let key = "customComplicationDefinitions"
        static let metricsKey = "customMetricsSnapshot"
        static let revisionKey = "customComplicationRevision"
        static let kind = "customComplication"
    }

    /// The colour and icon the wearer chose for each built-in complication,
    /// stored under `key` for the widgets (`BuiltInStyle.swift`).
    private enum BuiltIn {
        static let key = "builtInComplicationStyles"
        /// Every complication a style can change, so a change reloads them all.
        static let kinds = [
            "calorieGoalComplication", "proteinGoalComplication", "carbsGoalComplication",
            "fatGoalComplication", "waterGoalComplication", "fastingComplication",
            "stepsComplication",
        ]
    }

    /// One built-in complication's look. `key` is the phone's built-in key
    /// (`calorieGoal`, `proteinGoal`, `carbsGoal`, `fatGoal`, `water`, `fasting`,
    /// `steps`); only the parts the wearer changed are set. Field names are
    /// decoded by `BuiltInStyle.swift` in targets/watch-widget.
    struct BuiltInStyle: Codable, Equatable {
        let key: String
        let color: String?
        let icon: String?
    }

    /// Field names here are decoded by `CustomComplication`; the strings are
    /// the phone's wire values (`src/utils/watchComplications.ts`).
    struct CustomDefinition: Codable, Equatable {
        let id: String
        let name: String
        let source: String
        let format: String
        let gauge: Bool
        let color: String
        let icon: String
        /// The second and third values, shown with the first. Nil for a
        /// complication with one value, and for a list saved before this existed.
        let extras: [CustomItem]?
    }

    /// One more value of a custom complication, with its own look.
    struct CustomItem: Codable, Equatable {
        let source: String
        let format: String
        let color: String
        let icon: String
    }

    /// Field names here are decoded by `CustomComplication`.
    private struct CustomMetricsPayload: Codable, Equatable {
        let metrics: [CustomMetric]
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

    /// Publishes nutrition progress for the Daily Energy Goal complication and
    /// the Protein, Carbs and Fat complications that read the same snapshot.
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
            reloading: Energy.kinds + [Custom.kind]
        )
    }

    /// Publishes the wearer's custom complications, for the watch-face picker.
    /// Ignores a list older than the one already held, since queued copies can
    /// arrive out of order.
    ///
    /// `reload` is the phone's Reload button: the picker and every face slot
    /// refresh even when the list is the one already held, which is how a picker
    /// that cached an old answer is put right.
    ///
    /// `builtInStyles` rides in the same message (nil from a phone that does not
    /// send them, which leaves the saved ones alone) and is held to the same
    /// revision rule.
    static func publish(
        customDefinitions: [CustomDefinition],
        revision: Double,
        reload: Bool = false,
        builtInStyles: [BuiltInStyle]? = nil
    ) {
        guard let defaults = sharedDefaults() else { return }
        guard revision >= defaults.double(forKey: Custom.revisionKey) else { return }
        defaults.set(revision, forKey: Custom.revisionKey)

        let previous = defaults.data(forKey: Custom.key)
            .flatMap { try? JSONDecoder().decode([CustomDefinition].self, from: $0) }
        write(customDefinitions, forKey: Custom.key, reloading: [Custom.kind])

        // The picker is built from the widget's recommendations, which watchOS
        // caches until told they changed. Only what the picker lists (the ids
        // and names) needs it, as in Home Assistant's watch app; a format or
        // colour change shows up through the normal reload above.
        if reload
            || previous?.map(\.id) != customDefinitions.map(\.id)
            || previous?.map(\.name) != customDefinitions.map(\.name) {
            invalidateCustomRecommendations()
        }
        if reload {
            WidgetCenter.shared.reloadTimelines(ofKind: Custom.kind)
        }
        if let builtInStyles {
            publish(builtInStyles: builtInStyles, force: reload, defaults: defaults)
        }
    }

    /// Saves the wearer's looks for the built-in complications and reloads them
    /// when they changed (or when `force`, the phone's Reload button).
    private static func publish(builtInStyles: [BuiltInStyle], force: Bool, defaults: UserDefaults) {
        let previous = defaults.data(forKey: BuiltIn.key)
            .flatMap { try? JSONDecoder().decode([BuiltInStyle].self, from: $0) }
        guard force || previous != builtInStyles else { return }
        guard let data = try? JSONEncoder().encode(builtInStyles) else { return }
        defaults.set(data, forKey: BuiltIn.key)
        for kind in BuiltIn.kinds {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
    }

    /// Makes watchOS ask the Custom Complication for its choices again. Apple:
    /// call this "when your app receives new data for preconfigured widgets
    /// you'd like to appear in the list of available watch complications". Also
    /// called at launch, so a picker that cached an empty answer before there
    /// was a list (or starters) asks again.
    static func invalidateCustomRecommendations() {
        WidgetCenter.shared.invalidateConfigurationRecommendations()
    }

    /// Publishes the numbers a custom complication can show. Each carries its
    /// own day, so unlike the snapshots above this isn't gated on `day`.
    static func publish(customMetrics: [CustomMetric]) {
        write(
            CustomMetricsPayload(metrics: customMetrics),
            forKey: Custom.metricsKey,
            reloading: [Custom.kind]
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
            reloading: [Water.kind, Custom.kind]
        )
    }

    /// Publishes today's step count for the Steps complication.
    static func publish(steps: Int, goal: Int, for day: String) {
        guard isPublishable(day) else { return }
        write(
            StepsSnapshotPayload(date: day, count: max(0, steps), goal: max(1, goal)),
            forKey: Steps.key,
            reloading: [Steps.kind, Custom.kind]
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
            reloading: [Fasting.kind]
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

    /// Stores `snapshot` and asks WidgetKit to redraw every complication kind
    /// that reads `key` — but only when the value actually moved.
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
        reloading kinds: [String]
    ) {
        guard let defaults = sharedDefaults() else { return }

        if let existing = defaults.data(forKey: key),
           let decoded = try? JSONDecoder().decode(Snapshot.self, from: existing),
           decoded == snapshot {
            return
        }

        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)

        for kind in kinds {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
        }
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
