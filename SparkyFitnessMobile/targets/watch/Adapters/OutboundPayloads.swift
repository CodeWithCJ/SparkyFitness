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
        static let medicationTaken = "medicationTaken"
        static let contextRequest = "requestContext"
        static let setCompleted = "setCompleted"
        static let setUncompleted = "setUncompleted"
        static let heartRateBatch = "heartRateBatch"
        static let liveHeartRate = "liveHeartRate"
        static let workoutStop = "workoutStop"
        static let workoutDiscard = "workoutDiscard"
        static let restChanged = "restChanged"
        static let setTimerStarted = "setTimerStarted"
        static let setTimerStopped = "setTimerStopped"
        static let workoutStartRequested = "workoutStartRequested"
        static let workoutEdit = "workoutEdit"
        static let presetUpdateAnswer = "presetUpdateAnswer"
        static let recordingControl = "recordingControl"
        static let recordingHeartRate = "recordingHeartRate"
        static let fastStart = "fastStart"
        static let fastEnd = "fastEnd"
        static let runFinished = "runFinished"
        static let runLive = "runLive"
        static let runCue = "runCue"
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

    /// One dose ticked as taken — the phone logs it the way its own dose row
    /// does — or, with `taken` false, un-ticked, which deletes that entry.
    static func medicationTaken(_ tap: MedicationTap) -> [String: Any] {
        [
            "type": Kind.medicationTaken,
            "clientId": tap.id,
            "entryDate": tap.entryDate,
            "medicationId": tap.medicationId,
            "scheduleId": tap.scheduleId,
            "taken": tap.taken,
        ]
    }

    /// The wearer started a fast from a preset (`presetId` is the phone's id,
    /// such as "16-8"). The phone starts it and sends the running fast back in
    /// the next context.
    static func fastStart(presetId: String, clientId: String) -> [String: Any] {
        ["type": Kind.fastStart, "presetId": presetId, "clientId": clientId]
    }

    /// The wearer ended the fast that is running.
    static func fastEnd(clientId: String) -> [String: Any] {
        ["type": Kind.fastEnd, "clientId": clientId]
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

    /// An add, delete or set-type change in the running workout. `clientId`
    /// lets the phone drop a copy delivered twice (live, then queued).
    static func workoutEdit(
        sessionId: String,
        clientId: String,
        action: WorkoutEditAction
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.workoutEdit,
            "sessionId": sessionId,
            "clientId": clientId,
        ]
        switch action {
        case .addSet(let exerciseEntryId):
            payload["action"] = "addSet"
            payload["exerciseEntryId"] = exerciseEntryId
        case .deleteSet(let setId):
            payload["action"] = "deleteSet"
            payload["setId"] = setId
        case .setSetType(let setId, let type):
            payload["action"] = "setSetType"
            payload["setId"] = setId
            payload["setType"] = type
        case .addExercise(let exerciseId):
            payload["action"] = "addExercise"
            payload["exerciseId"] = exerciseId
        case .deleteExercise(let exerciseEntryId):
            payload["action"] = "deleteExercise"
            payload["exerciseEntryId"] = exerciseEntryId
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

    /// The wearer un-logged a set on the watch. Queued like `setCompleted`
    /// so the phone un-logs it too; `clientId` lets it ignore a re-delivery.
    static func setUncompleted(clientId: String, sessionId: String, setId: String) -> [String: Any] {
        [
            "type": Kind.setUncompleted,
            "clientId": clientId,
            "sessionId": sessionId,
            "setId": setId,
        ]
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

    /// Pause, resume, finish or lap for the phone's GPS recording. `action` is
    /// one of "pause", "resume", "finish", "lap" (`WatchRecordingControlPayload`).
    /// `at` is when the wearer pressed it, in epoch ms: controls travel over the
    /// queued transport and can arrive late, and a lap belongs to the moment it
    /// was pressed, not the moment it was delivered.
    static func recordingControl(sessionId: String, action: String, at: Date = Date()) -> [String: Any] {
        [
            "type": Kind.recordingControl,
            "sessionId": sessionId,
            "action": action,
            "at": at.timeIntervalSince1970 * 1000,
        ]
    }

    /// Heart-rate readings taken during a phone GPS recording. `clientId`
    /// lets the phone drop a re-delivered copy of a queued batch.
    static func recordingHeartRate(
        sessionId: String,
        clientId: String,
        samples: [HeartRateSample]
    ) -> [String: Any] {
        [
            "type": Kind.recordingHeartRate,
            "sessionId": sessionId,
            "clientId": clientId,
            "samples": samples.map { ["t": $0.t, "bpm": $0.bpm] },
        ]
    }

    /// A spoken cue for the phone to say instead of the watch, so it comes out
    /// of the headphones paired to the phone. `id` comes back in the phone's
    /// `runCueAck`; without it the watch says the cue itself.
    static func runCue(id: String, text: String, interrupt: Bool) -> [String: Any] {
        [
            "type": Kind.runCue,
            "id": id,
            "text": text,
            "interrupt": interrupt,
        ]
    }

    /// What a wrist-only walk or run looks like right now, for the phone's live
    /// view. Sent only while the phone is reachable and never queued: the
    /// finished run (`runFinished`) is what reaches the diary, and a figure
    /// that arrives minutes late describes nothing.
    static func runLive(
        runId: String,
        kind: String,
        place: String,
        status: String,
        autoPaused: Bool,
        settings: WatchRunSettings,
        paceAlert: Bool,
        heartRateAlert: Bool,
        elapsed: TimeInterval,
        distanceMeters: Double,
        heartRate: Double?,
        energyKcal: Double,
        lapCount: Int,
        stepLabel: String?,
        stepRemaining: TimeInterval?,
        nextLabel: String?,
        requestId: String?
    ) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.runLive,
            "runId": runId,
            "kind": kind,
            "place": place,
            "status": status,
            "autoPaused": autoPaused,
            "autoPause": settings.autoPause,
            "voiceCues": settings.voiceCues,
            "paceAlert": paceAlert,
            "heartRateAlert": heartRateAlert,
            "elapsed": elapsed,
            "distanceMeters": distanceMeters,
            "energyKcal": energyKcal,
            "lapCount": lapCount,
            "sentAt": Date().timeIntervalSince1970 * 1000,
        ]
        if let heartRate { payload["heartRate"] = heartRate }
        if let stepLabel { payload["stepLabel"] = stepLabel }
        if let stepRemaining { payload["stepRemaining"] = stepRemaining }
        if let nextLabel { payload["nextLabel"] = nextLabel }
        if let requestId { payload["requestId"] = requestId }
        return payload
    }

    /// A walk or run recorded on the wrist alone, sent once when it finishes.
    /// The route and heart rate are thinned to what the connection can carry.
    static func runFinished(_ result: WatchRunResult) -> [String: Any] {
        var payload: [String: Any] = [
            "type": Kind.runFinished,
            "clientId": result.clientId,
            "kind": result.kind.rawValue,
            "place": result.place.rawValue,
            "startedAt": result.startedAt.timeIntervalSince1970 * 1000,
            "endedAt": result.endedAt.timeIntervalSince1970 * 1000,
            "activeSeconds": result.activeSeconds,
            "distanceMeters": result.metrics.distanceMeters,
            "activeEnergyKcal": result.metrics.activeEnergyKcal,
            "route": WatchRunResult.thin(result.route, to: 1500),
            "heartRate": WatchRunResult.thin(result.heartRate, to: 600),
            "laps": result.laps,
            "lapDistances": result.lapDistances,
            "distanceSeries": WatchRunResult.thin(result.distanceSeries, to: 300),
            "planCompleted": result.planCompleted,
            "distanceScale": result.distanceScale,
        ]
        if let estimated = result.estimatedDistanceMeters {
            payload["estimatedDistanceMeters"] = estimated
        }
        if let plan = result.plan {
            payload["planId"] = plan.id
            if let programId = plan.programId, let index = plan.programIndex {
                payload["programId"] = programId
                payload["programIndex"] = index
            }
        }
        return payload
    }

    /// The reading the wrist is showing right now. Only ever sent as a live
    /// message, never queued: a reading that arrives minutes late describes
    /// nothing, and the batch carries the same samples for the diary. For a
    /// phone GPS recording `sessionId` is the recording's id and
    /// `exerciseEntryId` is empty.
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
