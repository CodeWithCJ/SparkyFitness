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
            failedClientIds: payload["failedClientIds"] as? [String] ?? [],
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
            },
            // Settings, so carried forward like the water goal: a push from a
            // phone build that doesn't send them must not flip them back on
            // or undo the page layout.
            hapticsEnabled: payload["hapticsEnabled"] as? Bool ?? previous.hapticsEnabled,
            restAlertsEnabled: payload["restAlertsEnabled"] as? Bool ?? previous.restAlertsEnabled,
            pageOrder: payload.keys.contains("pageOrder")
                ? stringArray(payload["pageOrder"])
                : previous.pageOrder,
            hiddenPages: payload.keys.contains("hiddenPages")
                ? stringArray(payload["hiddenPages"])
                : previous.hiddenPages,
            setInputStyle: payload["setInputStyle"] as? String ?? previous.setInputStyle,
            startableWorkouts: startableWorkouts(from: payload) ?? previous.startableWorkouts,
            scheduledWorkouts: scheduledWorkouts(from: payload) ?? previous.scheduledWorkouts,
            workoutServerId: payload.keys.contains("workoutServerId")
                ? payload["workoutServerId"] as? String
                : previous.workoutServerId,
            distanceUnit: payload["distanceUnit"] as? String ?? previous.distanceUnit,
            doubleTapEnabled: payload["doubleTapEnabled"] as? Bool ?? previous.doubleTapEnabled
        )
    }

    /// Nil when the phone did not mention the key, so an older push does not
    /// wipe a list the watch already has. An empty array is a real answer.
    static func startableWorkouts(from payload: [String: Any]) -> [StartableWorkout]? {
        guard let raw = payload["startableWorkouts"] else { return nil }
        let rows = dictionaryArray(raw) ?? []
        return rows.compactMap { row in
            guard
                let presetId = row["presetId"] as? String, !presetId.isEmpty,
                let name = row["name"] as? String, !name.isEmpty
            else { return nil }
            return StartableWorkout(presetId: presetId, name: name)
        }
    }

    /// Same rule as `startableWorkouts`: nil when the key is absent, so an
    /// older push keeps the list the watch has; empty is a real answer.
    static func scheduledWorkouts(from payload: [String: Any]) -> [ScheduledWorkout]? {
        guard let raw = payload["scheduledWorkouts"] else { return nil }
        let rows = dictionaryArray(raw) ?? []
        return rows.compactMap { row in
            guard
                let presetId = row["presetId"] as? String, !presetId.isEmpty,
                let name = row["name"] as? String, !name.isEmpty
            else { return nil }
            return ScheduledWorkout(
                presetId: presetId,
                name: name,
                planName: row["planName"] as? String ?? "",
                caption: row["caption"] as? String ?? ""
            )
        }
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
            ),
            rows: nutrientRows(from: payload)
        )
    }

    /// The Goals page rows the phone picked. Nil when the key is missing (an
    /// older phone build), so the page keeps its fixed macros; a row missing
    /// its key, label or amount is skipped rather than drawn as a zero.
    static func nutrientRows(from payload: [String: Any]) -> [NutrientRow]? {
        guard payload.keys.contains("goalNutrients"),
              let rows = dictionaryArray(payload["goalNutrients"])
        else { return nil }
        return rows.compactMap { row in
            guard
                let key = row["key"] as? String,
                let label = row["label"] as? String,
                let consumed = row["consumed"] as? Double
            else { return nil }
            return NutrientRow(
                key: key,
                label: label,
                unit: row["unit"] as? String ?? "",
                consumed: consumed,
                goal: (row["goal"] as? Double).flatMap { $0 > 0 ? $0 : nil },
                progress: row["progress"] as? Double ?? 0
            )
        }
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

    // MARK: - Workout

    /// The session a phone-sent `workoutStop` names, and when the phone sent
    /// it. Nil session for a malformed payload, which is dropped rather than
    /// ending whatever is running.
    static func workoutStop(
        from payload: [String: Any]
    ) -> (sessionId: String, stoppedAt: Date?, discarded: Bool)? {
        guard let sessionId = payload["sessionId"] as? String else { return nil }
        // Absent from an older phone build, which only ever finished.
        return (sessionId, isoDate(from: payload["stoppedAt"]), payload["discarded"] as? Bool ?? false)
    }

    static func isoDate(from value: Any?) -> Date? {
        guard let string = value as? String else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: string) ?? ISO8601DateFormatter().date(from: string)
    }

    /// The workout plan the phone armed the watch with. Nil when the payload
    /// is missing required fields — a malformed `workoutStart` is dropped
    /// rather than starting a session with holes in it.
    /// A mid-workout plan update: the same shape as `workoutStart`, plus a
    /// `revision` (JS ms timestamp, a Double for the same 32-bit reason as
    /// `setTargets`) so a duplicate or out-of-order copy is ignored.
    static func workoutPlanUpdate(from payload: [String: Any]) -> (plan: ActiveWorkoutPlan, revision: Double)? {
        guard let plan = workoutPlan(from: payload, allowEmpty: true),
              let revision = doubleValue(payload["revision"])
        else { return nil }
        return (plan, revision)
    }

    /// `allowEmpty` is only for a mid-workout update. A start with no
    /// exercises is still dropped. Deleting the last exercise keeps the phone
    /// session, so the watch must take the empty list instead of ignoring it.
    static func workoutPlan(from payload: [String: Any], allowEmpty: Bool = false) -> ActiveWorkoutPlan? {
        guard
            let sessionId = payload["sessionId"] as? String,
            let workoutName = payload["workoutName"] as? String,
            let rawExercises = dictionaryArray(payload["exercises"])
        else { return nil }

        let exercises: [PlannedExercise] = rawExercises.compactMap { raw in
            guard
                let exerciseEntryId = raw["exerciseEntryId"] as? String,
                let name = raw["name"] as? String,
                let rawSets = dictionaryArray(raw["sets"])
            else { return nil }

            let sets: [PlannedSet] = rawSets.compactMap { rawSet in
                guard let setId = rawSet["setId"] as? String else { return nil }
                return PlannedSet(
                    setId: setId,
                    targetReps: doubleValue(rawSet["targetReps"]),
                    targetWeightKg: doubleValue(rawSet["targetWeightKg"]),
                    restSeconds: intValue(rawSet["restSeconds"]) ?? 0,
                    setType: rawSet["setType"] as? String,
                    targetDurationSec: intValue(rawSet["targetDurationSec"]),
                    previousDurationSec: intValue(rawSet["previousDurationSec"]),
                    timed: rawSet["timed"] as? Bool,
                    carry: rawSet["carry"] as? Bool,
                    targetDistanceKm: doubleValue(rawSet["targetDistanceKm"]),
                    weighted: rawSet["weighted"] as? Bool
                )
            }
            return PlannedExercise(
                exerciseEntryId: exerciseEntryId,
                name: name,
                supersetRun: intValue(raw["supersetRun"]),
                bodyweight: raw["bodyweight"] as? Bool,
                sets: sets
            )
        }
        // An empty `exercises` array is the phone deleting the last one.
        // Exercises that failed to parse are not that, and stay a drop.
        guard !exercises.isEmpty || (allowEmpty && rawExercises.isEmpty) else { return nil }

        let setOrder = stringArray(payload["setOrder"])
        let startedAt = isoDate(from: payload["startedAt"])
        return ActiveWorkoutPlan(
            sessionId: sessionId,
            workoutName: workoutName,
            exercises: exercises,
            setOrder: setOrder,
            workoutFormat: payload["workoutFormat"] as? String,
            timeCapSeconds: intValue(payload["timeCapSeconds"]),
            startedAt: startedAt,
            armedAt: isoDate(from: payload["armedAt"]),
            capEndsAt: isoDate(from: payload["capEndsAt"]),
            fromPreset: payload["fromPreset"] as? Bool
        )
    }

    /// Absolute pause snapshot for the session. `revision` only moves forward.
    /// `excludedPauseMs` is time already resumed, not the open pause.
    static func intervalTiming(from payload: [String: Any]) -> (
        sessionId: String, revision: Int, pausedAt: Date?, excludedPauseSeconds: Int
    )? {
        guard
            let sessionId = payload["sessionId"] as? String,
            let revision = intValue(payload["revision"])
        else { return nil }
        let paused = (payload["paused"] as? Bool)
            ?? (payload["paused"] as? NSNumber)?.boolValue
            ?? false
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let pausedAt = paused
            ? (payload["pausedAt"] as? String).flatMap { formatter.date(from: $0) }
                ?? (payload["pausedAt"] as? String).flatMap { ISO8601DateFormatter().date(from: $0) }
                ?? Date()
            : nil
        let excludedMs = (payload["excludedPauseMs"] as? NSNumber)?.doubleValue ?? 0
        return (sessionId, revision, pausedAt, Int((excludedMs / 1000).rounded()))
    }

    /// Set timers running on the phone: set id to the moment it started.
    /// Epoch ms as Doubles. Empty when the phone sent none, which is also what
    /// an older phone build looks like.
    static func setTimers(from payload: [String: Any]) -> [String: Date] {
        guard let raw = payload["setTimers"] as? [String: Any] else { return [:] }
        var timers: [String: Date] = [:]
        for (setId, value) in raw {
            if let ms = doubleValue(value) {
                timers[setId] = Date(timeIntervalSince1970: ms / 1000)
            }
        }
        return timers
    }

    /// Current weight/reps targets for the live session's sets. `revision`
    /// is a JS millisecond timestamp, read as a Double: `Int` is 32-bit on
    /// arm64_32 watches and cannot hold it.
    static func setTargets(from payload: [String: Any]) -> (
        sessionId: String, revision: Double, targets: [String: SetValues],
        completedSetIds: Set<String>, rest: PhoneRest?,
        armedAt: Date?, prSetIds: Set<String>
    )? {
        guard
            let sessionId = payload["sessionId"] as? String,
            let revision = doubleValue(payload["revision"]),
            let rawTargets = dictionaryArray(payload["targets"])
        else { return nil }
        var targets: [String: SetValues] = [:]
        for raw in rawTargets {
            guard let setId = raw["setId"] as? String else { continue }
            targets[setId] = SetValues(
                weightKg: doubleValue(raw["targetWeightKg"]),
                reps: doubleValue(raw["targetReps"]),
                durationSec: intValue(raw["targetDurationSec"]),
                previousDurationSec: intValue(raw["previousDurationSec"]),
                distanceKm: doubleValue(raw["targetDistanceKm"])
            )
        }
        // Sets already logged on the phone. Absent from an older phone build.
        let completed = Set(stringArray(payload["completedSetIds"]))
        // The phone's rest. A running one carries an epoch-ms deadline, as a
        // Double for the same 32-bit reason as `revision`. Nil when the phone
        // did not say (an older build sends only `restEndsAt`, and only while
        // resting, so its silence cannot be read as "no rest").
        let rest: PhoneRest?
        let endsAt = doubleValue(payload["restEndsAt"]).map {
            Date(timeIntervalSince1970: $0 / 1000)
        }
        switch payload["restState"] as? String {
        case "resting":
            rest = endsAt.map {
                .resting(endsAt: $0, durationSeconds: intValue(payload["restDurationSeconds"]) ?? 0)
            }
        case "paused":
            rest = .paused
        case "ready":
            rest = .ready
        default:
            rest = endsAt.map {
                .resting(endsAt: $0, durationSeconds: intValue(payload["restDurationSeconds"]) ?? 0)
            }
        }
        // Which arm of the session this belongs to: the `armedAt` of the
        // `workoutStart` it follows, as epoch ms. Nil from an older phone.
        let armedAt = doubleValue(payload["armedAt"]).map {
            Date(timeIntervalSince1970: $0 / 1000)
        }
        // Logged sets the phone flagged as personal records. Absent from an
        // older phone build, which simply never celebrates.
        let prSetIds = Set(stringArray(payload["prSetIds"]))
        return (sessionId, revision, targets, completed, rest, armedAt, prSetIds)
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

    /// JS numbers arrive as NSNumber / Double / Int depending on the bridge.
    /// `as? Int` fails for a Double-boxed 90, which made every rest timer 0.
    private static func intValue(_ raw: Any?) -> Int? {
        if let i = raw as? Int { return i }
        if let d = raw as? Double { return Int(d) }
        if let n = raw as? NSNumber { return n.intValue }
        return nil
    }

    private static func doubleValue(_ raw: Any?) -> Double? {
        if let d = raw as? Double { return d }
        if let i = raw as? Int { return Double(i) }
        if let n = raw as? NSNumber { return n.doubleValue }
        return nil
    }

    /// Same NSArray bridging as heart-rate samples: JS `string[]` arrives as
    /// `NSArray` of `NSString`, and `as? [String]` can fail on that.
    private static func stringArray(_ raw: Any?) -> [String] {
        if let typed = raw as? [String] { return typed }
        guard let any = raw as? [Any] else { return [] }
        return any.compactMap { $0 as? String }
    }

    /// WatchConnectivity nested arrays arrive as `NSArray` of `NSDictionary`.
    /// A direct `as? [[String: Any]]` frequently returns nil for that, which
    /// would drop the whole workout (exercises) or an exercise (sets).
    private static func dictionaryArray(_ raw: Any?) -> [[String: Any]]? {
        if let typed = raw as? [[String: Any]] { return typed }
        guard let any = raw as? [Any] else { return nil }
        return any.compactMap { $0 as? [String: Any] }
    }
}
