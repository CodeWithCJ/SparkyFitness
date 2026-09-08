#if DEBUG
import Foundation

/// A realistic day's worth of data, for Xcode previews.
///
/// Exists because the pages read everything through `CheckInStore`, and a
/// preview backed by the real store shows an empty one: the canvas runs in its
/// own process with its own empty `UserDefaults`, so every page renders its
/// "not synced yet" state — the single layout that doesn't need checking.
///
/// Deliberately mid-day rather than tidy: calories over goal, macros at
/// different fractions, an odd number of water logs. Round numbers and
/// half-full bars hide the layout problems worth catching — a minus sign that
/// doesn't fit, a container name that truncates, a percentage that wraps.
///
/// `#if DEBUG` so none of this reaches a release build.
enum SampleDay {

    /// Today, so every `isToday` guard in the app passes and the pages render
    /// their populated state rather than the stale-day fallback.
    static var today: String { CheckInDate.today() }

    // MARK: - Water

    static let containers: [WaterContainer] = [
        WaterContainer(id: 1, name: "Glass", servingVolumeMl: 250, unit: "ml"),
        WaterContainer(id: 2, name: "Bottle", servingVolumeMl: 500, unit: "ml"),
        // A deliberately long name: this is the one that truncates first on a
        // 40mm, which is exactly what a preview should surface.
        WaterContainer(id: 3, name: "Large flask", servingVolumeMl: 750, unit: "ml"),
    ]

    static let waterLog: [WaterLogEntry] = [
        WaterLogEntry(id: "w3", name: "Bottle", volumeMl: 500, time: "14:20"),
        WaterLogEntry(id: "w2", name: "Glass", volumeMl: 250, time: "11:05"),
        WaterLogEntry(id: "w1", name: "Large flask", volumeMl: 750, time: "08:40"),
    ]

    static let water = WaterSnapshot(
        day: today,
        consumedMl: 1500,
        log: waterLog
    )

    // MARK: - Nutrition

    /// Over the calorie goal on purpose, so the preview shows the signed value
    /// and the "Kcal over" caption rather than the happy path.
    static let nutrition = NutritionSnapshot(
        day: today,
        caloriesConsumed: 2154,
        caloriesBurned: 788,
        caloriesRemaining: -254,
        calorieProgress: 1,
        carbs: MacroGoal(consumed: 136, goal: 150, progress: 0.91),
        fat: MacroGoal(consumed: 66, goal: 60, progress: 1),
        protein: MacroGoal(consumed: 112, goal: 179, progress: 0.63)
    )

    // MARK: - Weight history

    /// A fortnight with a gap in it — a skipped day is normal and the chart
    /// has to look right with one.
    static var history: [HistoryPoint] {
        let weights: [Double?] = [
            82.4, 82.1, 82.3, nil, 81.9, 81.6, 81.8,
            81.4, 81.5, nil, 81.1, 80.9, 81.0, 80.7,
        ]
        return weights.enumerated().compactMap { offset, weight in
            guard let weight else { return nil }
            guard let date = Calendar.current.date(
                byAdding: .day,
                value: offset - (weights.count - 1),
                to: Date()
            ) else { return nil }
            return HistoryPoint(
                day: CheckInDate.formatter.string(from: date),
                weightKg: weight,
                bodyFatPercentage: 19.5 - Double(offset) * 0.05
            )
        }
    }

    // MARK: - Whole context

    static var context: WatchContext {
        WatchContext(
            today: today,
            todayWeightKg: 80.7,
            todayBodyFatPercentage: 18.8,
            lastWeightKg: 81.0,
            lastBodyFatPercentage: 18.9,
            lastEntryDate: today,
            history: history,
            ackedClientIds: [],
            failedClientIds: [],
            updatedAt: Date(),
            weightUnit: .kg,
            nutrition: nutrition,
            water: water,
            waterContainers: containers,
            waterGoalMl: 2500,
            waterDisplayUnit: "liter",
            generatedAt: Date()
        )
    }

    /// The state before the phone has ever synced — the other layout worth
    /// checking, since it's what a new install and a phone-free morning show.
    static var emptyContext: WatchContext { .empty }
}
#endif
