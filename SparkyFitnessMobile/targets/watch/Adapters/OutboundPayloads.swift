import Foundation

/// Turns domain values into the dictionaries WatchConnectivity carries to the
/// phone.
///
/// These `payload` builders used to be computed properties on `CheckIn`,
/// `WaterTap` and `WaterDeleteRequest` themselves, which meant the domain
/// types knew their own wire format — a check-in had an opinion about the
/// string `"weightKg"`. Moving them here leaves those types as plain values
/// and puts every outbound key in one place, next to the `type` strings the
/// phone's router switches on.
///
/// The counterpart for the other direction is `ContextPayloadMapper`.
enum OutboundPayloads {

    /// Message types, matched by the phone's native module router
    /// (`WatchConnectivityModule.route`). Renaming one here without renaming
    /// it there means the phone silently ignores the message.
    private enum Kind {
        static let checkIn = "checkIn"
        static let waterIntake = "waterIntake"
        static let waterDelete = "waterDelete"
        static let contextRequest = "requestContext"
        static let setCompleted = "setCompleted"
        static let heartRateBatch = "heartRateBatch"
        static let liveHeartRate = "liveHeartRate"
        static let workoutStop = "workoutStop"
        static let workoutDiscard = "workoutDiscard"
        static let restChanged = "restChanged"
        static let setTimerStarted = "setTimerStarted"
        static let setTimerStopped = "setTimerStopped"
        static let workoutStartRequested = "workoutStartRequested"
        static let presetUpdateAnswer = "presetUpdateAnswer"
    }

    /// A morning check-in awaiting a server write.
    ///
    /// `bodyFatPercentage` is OMITTED rather than sent as null when the wearer
    /// skipped it: the server upserts by date, so a null would erase whatever
    /// body-fat value the day already had instead of leaving it alone.
    static func checkIn(_ checkIn: CheckIn) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.checkIn,
            "clientId": checkIn.id,
            "entryDate": checkIn.entryDate,
            "weightKg": checkIn.weightKg,
        ]
        if let bodyFat = checkIn.bodyFatPercentage {
            payload["bodyFatPercentage"] = bodyFat
        }
        return payload
    }

    /// One tap on a container square — the phone turns this into one serving
    /// of `containerId`, the same amount its own +/- button would add.
    static func waterTap(_ tap: WaterTap) -> [String: Any] {
        [
            "type": Kind.waterIntake,
            "clientId": tap.id,
            "entryDate": tap.entryDate,
            "containerId": tap.containerId,
        ]
    }

    /// A request to delete one logged drink by its server row id.
    static func waterDelete(_ request: WaterDeleteRequest) -> [String: Any] {
        [
            "type": Kind.waterDelete,
            "clientId": request.id,
            "entryId": request.entryId,
        ]
    }

    /// Asks the phone to push a fresh context. Carries no data of its own.
    static let contextRequest: [String: Any] = ["type": Kind.contextRequest]

    /// The wearer tapped a saved workout. The phone creates the session and
    /// arms the watch the same way its own start button does. `serverId` is
    /// the phone that built the list, so a tap queued across an account
    /// switch is refused.
    static func workoutStartRequest(presetId: String, serverId: String?) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.workoutStartRequested,
            "presetId": presetId,
        ]
        if let serverId, !serverId.isEmpty {
            payload["serverId"] = serverId
        }
        return payload
    }

    /// The wearer's answer to "update this workout?" on the summary. The phone
    /// owns the server write, so it applies (or drops) the change. `sessionId`
    /// pairs the answer with the workout the question was about.
    static func presetUpdateAnswer(sessionId: String, update: Bool) -> [String: Any] {
        [
            "type": Kind.presetUpdateAnswer,
            "sessionId": sessionId,
            "update": update,
        ]
    }

    /// One set logged during an active workout, with whatever the wearer
    /// actually did. Delivery must not be lost — unlike a heart-rate sample,
    /// a dropped set is a hole in the diary the wearer would have no way to
    /// notice — so this is sent via `WatchSessionManager.transfer(_:)`'s
    /// queued path, not `sendMessage` directly.
    ///
    /// `weightKg` and `reps` are OMITTED rather than sent as null when the
    /// watch has no value for them, the same rule `checkIn` follows above:
    /// the phone patches the set with what arrives, so a null would clear a
    /// planned value instead of leaving it be.
    static func setCompleted(_ completedSet: CompletedSet) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.setCompleted,
            "clientId": completedSet.clientId,
            "sessionId": completedSet.sessionId,
            "setId": completedSet.setId,
        ]
        if let weightKg = completedSet.weightKg {
            payload["weightKg"] = weightKg
        }
        if let reps = completedSet.reps {
            payload["reps"] = reps
        }
        if let duration = completedSet.duration {
            payload["duration"] = duration
        }
        if let distanceKm = completedSet.distanceKm {
            payload["distanceKm"] = distanceKm
        }
        if let rpe = completedSet.rpe {
            payload["rpe"] = rpe
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        payload["completedAt"] = formatter.string(from: completedSet.completedAt)
        return payload
    }

    /// A batch of heart-rate samples for one exercise. Queued like a completed
    /// set: these readings ARE the feature, and a phone out of range during a
    /// workout is normal rather than exceptional, so a dropped batch is a hole
    /// in the record rather than a cosmetic gap.
    static func heartRateBatch(_ batch: HeartRateBatch) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.heartRateBatch,
            "clientId": batch.clientId,
            "sessionId": batch.sessionId,
            "exerciseEntryId": batch.exerciseEntryId,
            "samples": batch.samples.map { ["t": $0.t, "bpm": $0.bpm] },
        ]
        // Include 0: a measured zero must replace the diary estimate.
        // Dropping it here made HR-only batches post without calories, so
        // the server kept calories_burned from duration/sets. Nil still
        // means this batch has no energy reading at all.
        if let kcal = batch.activeEnergyKcal {
            payload["activeEnergyKcal"] = kcal
        }
        if let minutes = batch.durationMinutes, minutes > 0 {
            payload["durationMinutes"] = minutes
        }
        return payload
    }

    /// The reading the wrist is showing right now. Only ever sent as a live
    /// message, never queued: a reading that arrives minutes late describes
    /// nothing, and the batch carries the same samples for the diary.
    static func liveHeartRate(
        sessionId: String,
        exerciseEntryId: String,
        bpm: Double,
        at: Date
    ) -> [String: Any] {
        [
            "type": Kind.liveHeartRate,
            "sessionId": sessionId,
            "exerciseEntryId": exerciseEntryId,
            "bpm": bpm,
            "at": at.timeIntervalSince1970 * 1000,
        ]
    }

    /// The wearer ended the workout on the watch. Queued like `setCompleted`:
    /// this is what tells the phone to flush buffered heart rate against the
    /// session's exercise entries, and a phone that misses it entirely would
    /// leave that heart rate stranded on the watch forever.
    static func workoutStop(_ signal: WorkoutStopSignal) -> [String: Any] {
        [
            "type": Kind.workoutStop,
            "sessionId": signal.sessionId,
        ]
    }

    /// The wearer discarded the workout on the watch. Queued like
    /// `workoutStop`: a phone that never hears it would keep a live session
    /// the wrist already abandoned. Unlike a stop, no heart rate follows it.
    static func workoutDiscard(sessionId: String, armedAt: Date?) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.workoutDiscard,
            "sessionId": sessionId,
        ]
        if let armedAt {
            payload["armedAt"] = armedAt.timeIntervalSince1970 * 1000
        }
        return payload
    }

    /// The wearer started a set's hold countdown or stopwatch on the watch.
    /// `startedAt` is epoch ms; the phone starts its own stopwatch from it so
    /// both show the same clock.
    /// `armedAt` is the arm of the plan the timer belongs to, so the phone can
    /// refuse a queued start from an earlier arm of the same session.
    static func setTimerStarted(
        sessionId: String, setId: String, startedAt: Date, armedAt: Date? = nil
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.setTimerStarted,
            "sessionId": sessionId,
            "setId": setId,
            "startedAt": startedAt.timeIntervalSince1970 * 1000,
        ]
        if let armedAt { payload["armedAt"] = armedAt.timeIntervalSince1970 * 1000 }
        return payload
    }

    /// The wearer stopped a set's stopwatch on the watch. `seconds` is how long
    /// it ran; `startedAt` is that run's start so a stop queued behind a newer
    /// run is not applied to it.
    static func setTimerStopped(
        sessionId: String, setId: String, seconds: Int, startedAt: Date
    ) -> [String: Any] {
        [
            "type": Kind.setTimerStopped,
            "sessionId": sessionId,
            "setId": setId,
            "seconds": seconds,
            "startedAt": startedAt.timeIntervalSince1970 * 1000,
        ]
    }

    /// The wearer skipped or moved the rest on the watch. Both deadlines are
    /// epoch ms, the same form the phone sends its own rest in: the phone only
    /// applies this to a rest still ending at `previousEndsAt`, so a copy that
    /// arrives twice, or late after that rest is over, changes nothing.
    /// `endsAt` is omitted when the rest was skipped.
    static func restChanged(sessionId: String, previousEndsAt: Date, endsAt: Date?) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.restChanged,
            "sessionId": sessionId,
            "previousEndsAt": previousEndsAt.timeIntervalSince1970 * 1000,
        ]
        if let endsAt {
            payload["endsAt"] = endsAt.timeIntervalSince1970 * 1000
        }
        return payload
    }
}
