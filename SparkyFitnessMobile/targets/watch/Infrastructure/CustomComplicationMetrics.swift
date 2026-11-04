import Foundation

/// One number a custom complication can show, already in the wearer's units.
///
/// The widget extension can't read this app's own storage or `WatchContext`, so
/// everything it may need is copied here and written to shared App Group
/// storage by `ComplicationPublisher`. Field names are decoded by
/// `CustomComplication` in targets/watch-widget; `key` is the definition's
/// `source` (the phone's `COMPLICATION_SOURCES`, or `nutrient:<key>`).
struct CustomMetric: Codable, Equatable {
    let key: String
    /// The amount in `unit`. Fasting carries its times below instead.
    let value: Double
    /// The target in `unit`, when there is one.
    var goal: Double? = nil
    /// 0...1 toward the goal, worked out by the phone (or here for steps), so a
    /// gauge fills from the same figure the Goals page uses.
    var progress: Double? = nil
    var unit: String = ""
    var decimals: Int = 0
    /// The calendar day the amount describes; nil when it isn't day-scoped (a
    /// weight is the latest known, not today's). The widget hides a metric
    /// whose day is not today.
    var day: String? = nil
    /// Fasting only, in epoch ms. Both nil means "not fasting".
    var startedAt: Double? = nil
    var targetEndAt: Double? = nil
}

/// Builds the metrics the custom complication can show from what the phone has
/// sent, so a definition that names a source finds its number.
enum CustomComplicationMetrics {
    static func build(from context: WatchContext) -> [CustomMetric] {
        var metrics: [CustomMetric] = []

        if let nutrition = context.nutrition {
            let day = nutrition.day
            // No goal on the calories figure: the phone sends the progress and
            // the amount left, and a goal worked out here could drift from them.
            metrics.append(CustomMetric(
                key: "calories", value: nutrition.caloriesConsumed,
                progress: nutrition.calorieProgress, unit: "kcal", day: day
            ))
            metrics.append(CustomMetric(
                key: "caloriesRemaining", value: nutrition.caloriesRemaining,
                unit: "kcal", day: day
            ))
            metrics.append(CustomMetric(
                key: "caloriesBurned", value: nutrition.caloriesBurned,
                unit: "kcal", day: day
            ))
            metrics.append(macro("protein", nutrition.protein, day: day))
            metrics.append(macro("carbs", nutrition.carbs, day: day))
            metrics.append(macro("fat", nutrition.fat, day: day))

            for row in nutrition.rows ?? [] {
                metrics.append(CustomMetric(
                    key: "nutrient:\(row.key)", value: row.consumed,
                    goal: row.goal, progress: row.goal == nil ? nil : row.progress,
                    unit: row.unit, decimals: row.consumed < 10 ? 1 : 0, day: day
                ))
            }
        }

        if let water = context.water {
            let unit = context.waterDisplayUnit ?? "ml"
            let shown = displayWater(water.consumedMl, unit: unit)
            let goalMl = (context.waterGoalMl ?? 0) > 0 ? context.waterGoalMl : nil
            metrics.append(CustomMetric(
                key: "water", value: shown.value,
                goal: goalMl.map { displayWater($0, unit: unit).value },
                progress: context.waterProgress(ml: water.consumedMl),
                unit: shown.label, decimals: shown.decimals, day: water.day
            ))
        }

        if let steps = context.steps {
            let goal = Double(context.stepGoal ?? 10_000)
            metrics.append(CustomMetric(
                key: "steps", value: Double(steps.count),
                goal: goal > 0 ? goal : nil,
                progress: goal > 0 ? max(0, min(1, Double(steps.count) / goal)) : nil,
                unit: "steps", day: steps.day
            ))
        }

        if context.fastSynced == true {
            metrics.append(CustomMetric(
                key: "fasting", value: 0, unit: "h",
                startedAt: context.fast.map { $0.startedAt.timeIntervalSince1970 * 1000 },
                targetEndAt: context.fast?.targetEndAt.map { $0.timeIntervalSince1970 * 1000 }
            ))
        }

        if let kg = context.todayWeightKg ?? context.lastWeightKg {
            let unit = context.effectiveWeightUnit
            metrics.append(CustomMetric(
                key: "weight", value: unit.fromKg(kg), unit: unit.suffix, decimals: 1
            ))
        }

        if let bodyFat = context.todayBodyFatPercentage ?? context.lastBodyFatPercentage {
            metrics.append(CustomMetric(key: "bodyFat", value: bodyFat, unit: "%", decimals: 1))
        }

        return metrics
    }

    private static func macro(_ key: String, _ goal: MacroGoal, day: String) -> CustomMetric {
        CustomMetric(
            key: key, value: goal.consumed,
            goal: goal.hasGoal ? goal.goal : nil,
            progress: goal.hasGoal ? goal.progress : nil,
            unit: "g", day: day
        )
    }

    /// ml in the account's water unit, matching `formatWaterMl` (the Water page
    /// and phone use the same units and decimals).
    private static func displayWater(_ ml: Double, unit: String) -> (value: Double, label: String, decimals: Int) {
        switch unit {
        case "oz": return (ml / 29.5735, "oz", 1)
        case "liter": return (ml / 1000, "L", 2)
        default: return (ml, "ml", 0)
        }
    }
}
