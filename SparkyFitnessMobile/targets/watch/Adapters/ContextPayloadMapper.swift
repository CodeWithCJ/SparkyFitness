import Foundation

/// Turns the phone's WatchConnectivity dictionaries into domain values.
///
/// Everything that knows a wire key name lives here. `WatchSessionManager` is
/// left with session lifecycle and routing; the domain types stay unaware that
/// a dictionary was ever involved. Nothing in this file imports
/// WatchConnectivity — the input is a plain `[String: Any]`, which is also
/// what makes it the one part of the inbound path that could be unit-tested
/// without a paired device.
///
/// The counterpart for the other direction is `OutboundPayloads`.
enum ContextPayloadMapper {

    /// `"context"` or `"ack"`, the two kinds the phone sends.
    static func type(of payload: [String: Any]) -> String? {
        payload["type"] as? String
    }

    // MARK: - Context

    /// Assembles the full context.
    ///
    /// `previous` supplies the carry-forward values for a push that didn't
    /// include the container key at all: `CheckInStore.apply(context:)`
    /// replaces the stored context wholesale, so without a fallback such a
    /// push would erase a perfectly good container list and strand the Water
    /// page. See `waterContainers(from:)` for why nil and empty differ.
    static func context(
        from payload: [String: Any],
        previous: WatchContext
    ) -> WatchContext {
        WatchContext(
            today: payload["today"] as? String,
            todayWeightKg: payload["todayWeightKg"] as? Double,
            todayBodyFatPercentage: payload["todayBodyFatPercentage"] as? Double,
            lastWeightKg: payload["lastWeightKg"] as? Double,
            lastBodyFatPercentage: payload["lastBodyFatPercentage"] as? Double,
            lastEntryDate: payload["lastEntryDate"] as? String,
            history: history(from: payload),
            ackedClientIds: payload["ackedClientIds"] as? [String] ?? [],
            updatedAt: Date(),
            // nil (→ .kg via effectiveWeightUnit) when absent or unrecognized,
            // e.g. a phone build from before this field existed.
            weightUnit: (payload["weightUnit"] as? String).flatMap(WeightUnit.init(rawValue:)),
            nutrition: nutrition(from: payload),
            water: water(from: payload),
            waterContainers: waterContainers(from: payload) ?? previous.waterContainers,
            // Carried forward for the same reason containers are: these are
            // account settings, and a push that happens not to mention them
            // must not blank the bottle's scale.
            waterGoalMl: payload["waterGoalMl"] as? Double ?? previous.waterGoalMl,
            waterDisplayUnit: payload["waterDisplayUnit"] as? String ?? previous.waterDisplayUnit,
            // Milliseconds since the epoch on the phone's clock. Carried
            // forward is wrong here — a payload with no timestamp is exactly
            // the one we can't reason about, so it stays nil.
            generatedAt: (payload["pushedAt"] as? Double).map {
                Date(timeIntervalSince1970: $0 / 1000)
            }
        )
    }

    static func history(from payload: [String: Any]) -> [HistoryPoint] {
        (payload["history"] as? [[String: Any]] ?? []).compactMap { entry in
            guard
                let day = entry["day"] as? String,
                let weight = entry["weightKg"] as? Double
            else { return nil }
            return HistoryPoint(
                day: day,
                weightKg: weight,
                bodyFatPercentage: entry["bodyFatPercentage"] as? Double
            )
        }
    }

    /// Nil unless the phone sent all three calorie figures — a partial
    /// snapshot would render as a confident zero, and "not synced yet" is the
    /// honest answer instead.
    static func nutrition(from payload: [String: Any]) -> NutritionSnapshot? {
        func value(_ key: String) -> Double? { payload[key] as? Double }

        guard
            let consumed = value("caloriesConsumed"),
            let burned = value("caloriesBurned"),
            let remaining = value("caloriesRemaining")
        else { return nil }

        return NutritionSnapshot(
            day: day(from: payload),
            caloriesConsumed: consumed,
            caloriesBurned: burned,
            caloriesRemaining: remaining,
            calorieProgress: value("calorieGoalProgress") ?? 0,
            carbs: MacroGoal(
                consumed: value("carbsConsumed") ?? 0,
                goal: value("carbsGoal") ?? 0,
                progress: value("carbsGoalProgress") ?? 0
            ),
            fat: MacroGoal(
                consumed: value("fatConsumed") ?? 0,
                goal: value("fatGoal") ?? 0,
                progress: value("fatGoalProgress") ?? 0
            ),
            protein: MacroGoal(
                consumed: value("proteinConsumed") ?? 0,
                goal: value("proteinGoal") ?? 0,
                progress: value("proteinGoalProgress") ?? 0
            )
        )
    }

    /// Today's water totals. Containers are deliberately not part of this —
    /// they're configuration and outlive the day this snapshot describes.
    /// Nil when the phone didn't send today's total — which is how it says
    /// "I can't vouch for this day". The goal and unit are read separately in
    /// `context(from:previous:)`, because those survive the day this describes.
    static func water(from payload: [String: Any]) -> WaterSnapshot? {
        guard let consumedMl = payload["waterConsumedMl"] as? Double else { return nil }

        return WaterSnapshot(
            day: day(from: payload),
            consumedMl: consumedMl,
            log: waterLog(from: payload)
        )
    }

    static func waterLog(from payload: [String: Any]) -> [WaterLogEntry] {
        (payload["waterLog"] as? [[String: Any]] ?? []).compactMap { entry in
            guard
                let id = entry["id"] as? String,
                let name = entry["name"] as? String,
                let volumeMl = entry["volumeMl"] as? Double,
                let time = entry["time"] as? String
            else { return nil }
            return WaterLogEntry(id: id, name: name, volumeMl: volumeMl, time: time)
        }
    }

    /// Nil when this push didn't carry the container key at all.
    ///
    /// Nil and empty mean different things and callers rely on it: an absent
    /// key is an older phone build (or a payload that failed to include them)
    /// and must leave whatever the watch already has alone, while an empty
    /// array is the phone actively saying there are none configured. A single
    /// `?? []` here would quietly collapse the first case into the second and
    /// wipe a usable list.
    static func waterContainers(from payload: [String: Any]) -> [WaterContainer]? {
        guard let raw = payload["containers"] as? [[String: Any]] else { return nil }
        return raw.compactMap { entry in
            guard
                let id = entry["id"] as? Int,
                let name = entry["name"] as? String,
                let servingVolumeMl = entry["servingVolumeMl"] as? Double,
                let unit = entry["unit"] as? String
            else { return nil }
            return WaterContainer(id: id, name: name, servingVolumeMl: servingVolumeMl, unit: unit)
        }
    }

    // MARK: - Complications

    /// The raw goal fractions for the Daily Energy Goal complication.
    ///
    /// Read straight from the payload rather than off the assembled
    /// `NutritionSnapshot`, and non-optional with zeros for anything missing:
    /// the complication is fed in parallel with the app's own store, not
    /// derived from it, so a payload too partial to build a snapshot still
    /// publishes something rather than leaving the watch face stale.
    /// Nil unless the phone sent all four fractions.
    ///
    /// The same "partial is worse than absent" rule `nutrition(from:)` uses,
    /// and for the same reason: coercing an absent key to 0 made the
    /// complication assert an empty ring for today while the Goals page beside
    /// it said "not synced yet". Note that absent is now the normal shape for
    /// an unknown value — the phone's module strips nulls before the transfer,
    /// since one `NSNull` fails the whole push.
    ///
    /// A real 0 still comes through as a real 0: the phone sends that only
    /// when it has a summary and the summary has no goal set.
    static func goalProgress(from payload: [String: Any]) -> GoalProgress? {
        func value(_ key: String) -> Double? { payload[key] as? Double }

        guard
            let calories = value("calorieGoalProgress"),
            let protein = value("proteinGoalProgress"),
            let carbs = value("carbsGoalProgress"),
            let fat = value("fatGoalProgress")
        else { return nil }

        return GoalProgress(calories: calories, protein: protein, carbs: carbs, fat: fat)
    }

    // MARK: - Acks

    /// A server-write confirmation for one check-in.
    static func ack(from payload: [String: Any]) -> (clientId: String, ok: Bool)? {
        guard let clientId = payload["clientId"] as? String else { return nil }
        return (clientId, payload["ok"] as? Bool ?? false)
    }

    // MARK: - Helpers

    /// The calendar day a payload describes, falling back to the watch's own
    /// today when the phone didn't say.
    static func day(from payload: [String: Any]) -> String {
        payload["today"] as? String ?? CheckInDate.today()
    }
}
