import ExpoModulesCore
import HealthKit
import Security
import WatchConnectivity

/// `WCSessionDelegate` extends `NSObjectProtocol`, which Swift only allows an
/// actual `NSObject` subclass to conform to — Expo's `Module` base class does
/// not qualify. So the delegate lives here and forwards to the module through
/// closures.
private class WatchSessionDelegateHandler: NSObject, WCSessionDelegate {
    var onReachabilityChange: ((Bool) -> Void)?
    /// A check-in captured on the watch, awaiting a server write.
    var onCheckIn: (([String: Any]) -> Void)?
    /// The watch asking for fresh seed values + history.
    var onContextRequest: (() -> Void)?
    /// A water container tap captured on the watch, awaiting a server write.
    var onWaterIntake: (([String: Any]) -> Void)?
    /// A request from the watch to delete one logged drink.
    var onWaterDelete: (([String: Any]) -> Void)?
    /// A scheduled dose marked taken on the watch, awaiting a server write.
    var onMedicationTaken: (([String: Any]) -> Void)?
    /// One set logged during an active workout on the watch.
    var onSetCompleted: (([String: Any]) -> Void)?
    /// The wearer un-logged a set on the watch.
    var onSetUncompleted: (([String: Any]) -> Void)?
    var onRestChanged: (([String: Any]) -> Void)?
    /// The wearer started a set's hold countdown or stopwatch on the watch.
    var onSetTimerStarted: (([String: Any]) -> Void)?
    var onSetTimerStopped: (([String: Any]) -> Void)?
    /// A batch of heart-rate samples for one exercise, captured on the watch.
    var onHeartRateBatch: (([String: Any]) -> Void)?
    /// The reading on the wrist now. Live messages only, never queued.
    var onLiveHeartRate: (([String: Any]) -> Void)?
    /// The wearer ended the workout on the watch.
    var onWorkoutStop: (([String: Any]) -> Void)?
    var onWorkoutDiscard: (([String: Any]) -> Void)?
    /// The wearer picked a saved workout on the watch. The phone starts it.
    var onWorkoutStartRequested: (([String: Any]) -> Void)?
    /// The wearer added or removed a set or exercise on the watch, or changed a
    /// set's type. The phone applies it to the live workout.
    var onWorkoutEdit: (([String: Any]) -> Void)?
    /// The wearer answered the update-this-workout question on the summary.
    var onPresetUpdateAnswer: (([String: Any]) -> Void)?
    var onRecordingControl: (([String: Any]) -> Void)?
    var onRecordingHeartRate: (([String: Any]) -> Void)?
    var onFastStartRequested: (([String: Any]) -> Void)?
    var onFastEndRequested: (([String: Any]) -> Void)?
    /// What a wrist-only run looks like right now. Live messages only.
    var onRunLive: (([String: Any]) -> Void)?
    /// A cue the watch wants said out loud by the phone (its headphones).
    var onRunCue: (([String: Any]) -> Void)?
    /// A walk or run recorded on the watch alone, sent when it finished.
    var onRunFinished: (([String: Any]) -> Void)?

    /// The newest `setTargets` update sent before the session finished
    /// activating. Apple only queues `transferUserInfo` on an activated
    /// session, and the phone treats an update as sent, so it is held here
    /// and queued on activation. Each update is a full snapshot, so only the
    /// latest one matters.
    private var heldSetTargets: [String: Any]?
    /// The newest `workoutPlanUpdate`, held the same way and for the same
    /// reason. Also a full snapshot, so only the latest matters; queued ahead
    /// of held targets on activation, since those may name its new sets.
    private var heldPlanUpdate: [String: Any]?
    private let heldLock = NSLock()

    /// Queues `payload` now if the session is activated, else holds it for
    /// `activationDidCompleteWith`.
    func transferSetTargets(_ payload: [String: Any]) {
        transferOrHold(payload, into: \.heldSetTargets)
    }

    /// As `transferSetTargets`, for a plan update.
    func transferPlanUpdate(_ payload: [String: Any]) {
        transferOrHold(payload, into: \.heldPlanUpdate)
    }

    private func transferOrHold(
        _ payload: [String: Any],
        into slot: ReferenceWritableKeyPath<WatchSessionDelegateHandler, [String: Any]?>
    ) {
        heldLock.lock()
        defer { heldLock.unlock() }
        guard WCSession.default.activationState == .activated else {
            self[keyPath: slot] = payload
            return
        }
        self[keyPath: slot] = nil
        WCSession.default.transferUserInfo(payload)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    private func route(_ payload: [String: Any]) {
        switch payload["type"] as? String {
        case "checkIn":
            onCheckIn?(payload)
        case "requestContext":
            onContextRequest?()
        case "waterIntake":
            onWaterIntake?(payload)
        case "waterDelete":
            onWaterDelete?(payload)
        case "medicationTaken":
            onMedicationTaken?(payload)
        case "setCompleted":
            onSetCompleted?(payload)
        case "setUncompleted":
            onSetUncompleted?(payload)
        case "restChanged":
            onRestChanged?(payload)
        case "setTimerStarted":
            onSetTimerStarted?(payload)
        case "setTimerStopped":
            onSetTimerStopped?(payload)
        case "heartRateBatch":
            onHeartRateBatch?(payload)
        case "liveHeartRate":
            onLiveHeartRate?(payload)
        case "workoutStop":
            onWorkoutStop?(payload)
        case "workoutDiscard":
            onWorkoutDiscard?(payload)
        case "workoutStartRequested":
            onWorkoutStartRequested?(payload)
        case "workoutEdit":
            onWorkoutEdit?(payload)
        case "presetUpdateAnswer":
            onPresetUpdateAnswer?(payload)
        case "recordingControl":
            onRecordingControl?(payload)
        case "recordingHeartRate":
            onRecordingHeartRate?(payload)
        case "fastStart":
            onFastStartRequested?(payload)
        case "fastEnd":
            onFastEndRequested?(payload)
        case "runLive":
            onRunLive?(payload)
        case "runCue":
            onRunCue?(payload)
        case "runFinished":
            onRunFinished?(payload)
        default:
            break
        }
    }

    // MARK: - WCSessionDelegate

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        if activationState == .activated {
            heldLock.lock()
            let plan = heldPlanUpdate
            let targets = heldSetTargets
            heldPlanUpdate = nil
            heldSetTargets = nil
            heldLock.unlock()
            if let plan { session.transferUserInfo(plan) }
            if let targets { session.transferUserInfo(targets) }
        }
        onReachabilityChange?(session.isReachable)
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        // Re-activate so switching between paired Watches keeps working.
        session.activate()
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        onReachabilityChange?(session.isReachable)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        route(message)
    }

    func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        route(message)
        replyHandler([:])
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        route(userInfo)
    }
}

/// One heart-rate batch in the native queue, and the file that holds it.
private struct QueuedHeartRateBatch {
    var event: [String: Any]
    let fileName: String
    /// False until the file write succeeds. Before the first unlock after a
    /// reboot the file cannot be written; the batch is retried on the next
    /// queue access and is still in memory for JS until then.
    var stored: Bool
}

/// Phone-side bridge exposed to JS as `WatchConnectivity`.
///
/// The watch cannot reach the SparkyFitness server itself — authentication lives
/// here — so this module is the transport: it surfaces check-ins captured on the
/// watch to JS, which writes them via the normal measurements API, then relays
/// acknowledgements and fresh seed data back.
public class WatchConnectivityModule: Module {
    private let delegateHandler = WatchSessionDelegateHandler()
    /// Where development builds kept the queue, in UserDefaults and then the
    /// keychain. Those batches carry no owner, so they are deleted on load.
    private let legacyHeartRateQueueKey = "sparky.pendingHeartRateBatches"
    /// The server config JS last reported as active. Persisted so a batch
    /// that arrives on a cold start, before JS runs, is still stamped.
    private let telemetryOwnerKey = "sparky.watchTelemetryOwner"
    /// One batch a minute, so a week. Each batch is its own file, so a long
    /// backlog costs one small write per batch rather than a rewrite of the
    /// whole queue. The queue only grows while JS cannot store what it
    /// receives, and JS retries that, so reaching this means the phone could
    /// not save telemetry for a week. Evictions are counted and reported to
    /// the app log through `takeDroppedHeartRateBatchCount`.
    private let heartRateQueueBatchLimit = 10_080
    /// A normal batch is about 3 KB. This only stops one malformed payload.
    private let heartRateBatchByteLimit = 1_048_576
    private var telemetryOwnerId = ""
    private var heartRateQueue: [QueuedHeartRateBatch] = []
    /// False while some batch file could not be read yet (the phone has not
    /// been unlocked since boot). Reading is retried on each queue access.
    private var heartRateQueueLoaded = false
    private var heartRateQueueDirectoryReady = false
    private var droppedHeartRateBatches = 0
    /// The watch callback and this module's queue both touch `heartRateQueue`.
    /// One serial queue so a drain and an ack can't interleave.
    private let heartRateAccess = DispatchQueue(label: "sparky.watch.heartRateQueue")
    /// Wrist-only runs that arrived before JavaScript was listening. One file:
    /// a run is rare, unlike a heart-rate batch a minute.
    private var runQueue: [[String: Any]] = []
    /// False until the current `runQueue` has been written. A failed write is
    /// retried the next time JS asks for the queue.
    private var runQueueStored = true
    private var runQueueLoaded = false
    private let runQueueLimit = 50
    private let runAccess = DispatchQueue(label: "sparky.watch.runQueue")

    /// Opens the watch app for the workout the phone just started, the same
    /// way the system Workout app does. Without it the queued plan waits
    /// until the wearer opens the watch app by hand. watchOS only launches it
    /// while the watch is on the wrist, unlocked and paired; otherwise this
    /// quietly does nothing and the plan still arrives on the next open.
    private static func launchWatchApp(activity: String? = nil, indoor: Bool = false) {
        guard HKHealthStore.isHealthDataAvailable(),
              WCSession.isSupported(),
              WCSession.default.isPaired,
              WCSession.default.isWatchAppInstalled
        else { return }
        let configuration = HKWorkoutConfiguration()
        switch activity {
        case "walk", "walking":
            configuration.activityType = .walking
            configuration.locationType = indoor ? .indoor : .outdoor
        case "run", "running":
            configuration.activityType = .running
            configuration.locationType = indoor ? .indoor : .outdoor
        case "ride", "cycling":
            configuration.activityType = .cycling
            configuration.locationType = .outdoor
        default:
            configuration.activityType = .traditionalStrengthTraining
            configuration.locationType = .indoor
        }
        HKHealthStore().startWatchApp(with: configuration) { _, _ in }
    }

    public func definition() -> ModuleDefinition {
        Name("WatchConnectivity")

        Events(
            "onReachabilityChange",
            "onCheckIn",
            "onContextRequest",
            "onWaterIntake",
            "onWaterDelete",
            "onMedicationTaken",
            "onSetCompleted",
            "onSetUncompleted",
            "onRestChanged",
            "onSetTimerStarted",
            "onSetTimerStopped",
            "onHeartRateBatch",
            "onLiveHeartRate",
            "onWorkoutStop",
            "onWorkoutDiscard",
            "onWorkoutStartRequested",
            "onWorkoutEdit",
            "onPresetUpdateAnswer",
            "onRecordingControl",
            "onRecordingHeartRate",
            "onFastStartRequested",
            "onFastEndRequested",
            "onRunLive",
            "onRunCue",
            "onRunFinished"
        )

        OnCreate {
            self.heartRateAccess.sync {
                self.telemetryOwnerId =
                    UserDefaults.standard.string(forKey: self.telemetryOwnerKey) ?? ""
                self.prepareHeartRateQueue()
            }
            self.delegateHandler.onReachabilityChange = { [weak self] isReachable in
                self?.sendEvent("onReachabilityChange", ["isReachable": isReachable])
            }
            self.delegateHandler.onCheckIn = { [weak self] payload in
                self?.sendEvent("onCheckIn", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "weightKg": payload["weightKg"] as? Double ?? 0,
                    // Absent (rather than null) when the wearer skipped body fat,
                    // so the JS side can omit it from the upsert instead of
                    // erasing an existing value.
                    "bodyFatPercentage": payload["bodyFatPercentage"] as? Double,
                ])
            }
            self.delegateHandler.onContextRequest = { [weak self] in
                self?.sendEvent("onContextRequest", [:])
            }
            self.delegateHandler.onWaterIntake = { [weak self] payload in
                self?.sendEvent("onWaterIntake", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "containerId": payload["containerId"] as? Int ?? 0,
                ])
            }
            self.delegateHandler.onWaterDelete = { [weak self] payload in
                self?.sendEvent("onWaterDelete", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryId": payload["entryId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onMedicationTaken = { [weak self] payload in
                self?.sendEvent("onMedicationTaken", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "entryDate": payload["entryDate"] as? String ?? "",
                    "medicationId": payload["medicationId"] as? String ?? "",
                    "scheduleId": payload["scheduleId"] as? String ?? "",
                    "taken": payload["taken"] as? Bool ?? true,
                ])
            }
            self.delegateHandler.onSetCompleted = { [weak self] payload in
                self?.sendEvent("onSetCompleted", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "setId": payload["setId"] as? String ?? "",
                    // Absent (rather than null) when the watch had no value,
                    // so JS can omit the field from the set patch instead of
                    // clearing a planned one — same rule as body fat above.
                    "weightKg": payload["weightKg"] as? Double,
                    "reps": payload["reps"] as? Double,
                    "rpe": (payload["rpe"] as? NSNumber)?.doubleValue,
                    "duration": (payload["duration"] as? NSNumber)?.intValue,
                    "distanceKm": payload["distanceKm"] as? Double,
                    "completedAt": payload["completedAt"] as? String,
                ])
            }
            self.delegateHandler.onSetUncompleted = { [weak self] payload in
                self?.sendEvent("onSetUncompleted", [
                    "clientId": payload["clientId"] as? String ?? "",
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "setId": payload["setId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onSetTimerStarted = { [weak self] payload in
                guard let startedAt = (payload["startedAt"] as? NSNumber)?.doubleValue else {
                    return
                }
                var event: [String: Any] = [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "setId": payload["setId"] as? String ?? "",
                    "startedAt": startedAt,
                ]
                if let armedAt = (payload["armedAt"] as? NSNumber)?.doubleValue {
                    event["armedAt"] = armedAt
                }
                self?.sendEvent("onSetTimerStarted", event)
            }
            self.delegateHandler.onSetTimerStopped = { [weak self] payload in
                guard let seconds = (payload["seconds"] as? NSNumber)?.intValue,
                      let startedAt = (payload["startedAt"] as? NSNumber)?.doubleValue
                else {
                    return
                }
                self?.sendEvent("onSetTimerStopped", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "setId": payload["setId"] as? String ?? "",
                    "seconds": seconds,
                    "startedAt": startedAt,
                ])
            }
            self.delegateHandler.onFastStartRequested = { [weak self] payload in
                self?.sendEvent("onFastStartRequested", [
                    "presetId": payload["presetId"] as? String ?? "",
                    "clientId": payload["clientId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onFastEndRequested = { [weak self] payload in
                self?.sendEvent("onFastEndRequested", [
                    "clientId": payload["clientId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onRestChanged = { [weak self] payload in
                // Epoch ms as Doubles, like the phone's own rest deadline.
                // `endsAt` is absent when the rest was skipped on the watch.
                var event: [String: Any] = [
                    "sessionId": payload["sessionId"] as? String ?? "",
                ]
                if let previous = (payload["previousEndsAt"] as? NSNumber)?.doubleValue {
                    event["previousEndsAt"] = previous
                }
                if let endsAt = (payload["endsAt"] as? NSNumber)?.doubleValue {
                    event["endsAt"] = endsAt
                }
                self?.sendEvent("onRestChanged", event)
            }
            self.delegateHandler.onHeartRateBatch = { [weak self] payload in
                guard let self else { return }
                // Stamped and queued under one lock, so an owner change
                // cannot land between the two.
                let event = self.heartRateAccess.sync { () -> [String: Any] in
                    let event = self.heartRateEvent(from: payload)
                    self.rememberHeartRateBatch(event)
                    return event
                }
                self.sendEvent("onHeartRateBatch", event)
            }
            self.delegateHandler.onLiveHeartRate = { [weak self] payload in
                guard let bpm = (payload["bpm"] as? NSNumber)?.doubleValue,
                      let at = (payload["at"] as? NSNumber)?.doubleValue
                else { return }
                self?.sendEvent("onLiveHeartRate", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "exerciseEntryId": payload["exerciseEntryId"] as? String ?? "",
                    "bpm": bpm,
                    "at": at,
                ])
            }
            self.delegateHandler.onWorkoutStop = { [weak self] payload in
                self?.sendEvent("onWorkoutStop", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onWorkoutDiscard = { [weak self] payload in
                var event: [String: Any] = [
                    "sessionId": payload["sessionId"] as? String ?? "",
                ]
                if let armedAt = payload["armedAt"] as? Double {
                    event["armedAt"] = armedAt
                }
                self?.sendEvent("onWorkoutDiscard", event)
            }
            self.delegateHandler.onWorkoutStartRequested = { [weak self] payload in
                self?.sendEvent("onWorkoutStartRequested", [
                    "presetId": payload["presetId"] as? String ?? "",
                    "serverId": payload["serverId"] as? String ?? "",
                ])
            }
            self.delegateHandler.onWorkoutEdit = { [weak self] payload in
                var event: [String: Any] = [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "clientId": payload["clientId"] as? String ?? "",
                    "action": payload["action"] as? String ?? "",
                ]
                for key in ["exerciseEntryId", "setId", "exerciseId", "setType"] {
                    if let value = payload[key] as? String { event[key] = value }
                }
                self?.sendEvent("onWorkoutEdit", event)
            }
            self.delegateHandler.onPresetUpdateAnswer = { [weak self] payload in
                self?.sendEvent("onPresetUpdateAnswer", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "update": payload["update"] as? Bool ?? false,
                ])
            }
            self.delegateHandler.onRecordingControl = { [weak self] payload in
                var event: [String: Any] = [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "action": payload["action"] as? String ?? "",
                ]
                // When the wearer pressed it (epoch ms); a queued control can
                // arrive long after, and a lap belongs to the press.
                if let at = (payload["at"] as? NSNumber)?.doubleValue { event["at"] = at }
                self?.sendEvent("onRecordingControl", event)
            }
            self.delegateHandler.onRecordingHeartRate = { [weak self] payload in
                self?.sendEvent("onRecordingHeartRate", [
                    "sessionId": payload["sessionId"] as? String ?? "",
                    "clientId": payload["clientId"] as? String ?? "",
                    "samples": dictionaryArray(payload["samples"]),
                ])
            }
            self.delegateHandler.onRunLive = { [weak self] payload in
                var event: [String: Any] = [
                    "runId": payload["runId"] as? String ?? "",
                    "kind": payload["kind"] as? String ?? "",
                    "place": payload["place"] as? String ?? "",
                    "status": payload["status"] as? String ?? "",
                    "autoPaused": payload["autoPaused"] as? Bool ?? false,
                    "elapsed": (payload["elapsed"] as? NSNumber)?.doubleValue ?? 0,
                    "distanceMeters": (payload["distanceMeters"] as? NSNumber)?.doubleValue ?? 0,
                    "energyKcal": (payload["energyKcal"] as? NSNumber)?.doubleValue ?? 0,
                    "lapCount": (payload["lapCount"] as? NSNumber)?.intValue ?? 0,
                    "sentAt": (payload["sentAt"] as? NSNumber)?.doubleValue ?? 0,
                ]
                if let hr = (payload["heartRate"] as? NSNumber)?.doubleValue { event["heartRate"] = hr }
                if let label = payload["stepLabel"] as? String { event["stepLabel"] = label }
                if let left = (payload["stepRemaining"] as? NSNumber)?.doubleValue { event["stepRemaining"] = left }
                if let next = payload["nextLabel"] as? String { event["nextLabel"] = next }
                if let requestId = payload["requestId"] as? String { event["requestId"] = requestId }
                if let autoPause = payload["autoPause"] as? Bool { event["autoPause"] = autoPause }
                if let voiceCues = payload["voiceCues"] as? Bool { event["voiceCues"] = voiceCues }
                if let paceAlert = payload["paceAlert"] as? Bool { event["paceAlert"] = paceAlert }
                if let heartRateAlert = payload["heartRateAlert"] as? Bool { event["heartRateAlert"] = heartRateAlert }
                self?.sendEvent("onRunLive", event)
            }
            self.delegateHandler.onRunCue = { [weak self] payload in
                self?.sendEvent("onRunCue", [
                    "id": payload["id"] as? String ?? "",
                    "text": payload["text"] as? String ?? "",
                    "interrupt": payload["interrupt"] as? Bool ?? false,
                ])
            }
            self.delegateHandler.onRunFinished = { [weak self] payload in
                guard let self else { return }
                let event = self.normalizedRunEvent(payload)
                self.rememberFinishedRun(event)
                self.sendEvent("onRunFinished", event)
            }
            self.delegateHandler.activate()
        }

        Function("isSupported") { () -> Bool in
            WCSession.isSupported()
        }

        Function("isReachable") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isReachable
        }

        Function("isPaired") { () -> Bool in
            guard WCSession.isSupported() else { return false }
            return WCSession.default.isPaired
        }

        /// Pushes seed values, recent history and acknowledged client ids to the
        /// watch. Application context is latest-value-only and survives the watch
        /// app being asleep, which is exactly the semantics wanted here — a
        /// missed update is simply superseded by the next one.
        AsyncFunction("updateContext") { (context: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = context.compactMapValues(withoutNulls)
            payload["type"] = "context"
            try WCSession.default.updateApplicationContext(payload)
        }

        /// Immediate per-check-in acknowledgement for when the watch app is in
        /// the foreground. The authoritative ack still rides in the context, so
        /// this failing is harmless.
        AsyncFunction("sendAck") { (clientId: String, ok: Bool) -> Void in
            guard WCSession.isSupported(), WCSession.default.isReachable else { return }
            WCSession.default.sendMessage(
                ["type": "ack", "clientId": clientId, "ok": ok],
                replyHandler: nil,
                errorHandler: nil
            )
        }

        /// Arms the watch with the workout plan a live session was just
        /// started from. Deliberately NOT sent via `updateContext` above:
        /// application context is a single latest-value slot shared by the
        /// whole app, so a workout push would either be clobbered by the next
        /// nutrition/water context push or clobber it right back.
        ///
        /// `workoutStart` is queued so it stays ahead of later `intervalTiming`
        /// transfers, and also sent immediately when the watch is reachable.
        /// The watch drops a start for a session it has already ended, so the
        /// queued copy cannot restart a workout a faster `workoutStop` finished.
        AsyncFunction("startWorkout") { (plan: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = plan.compactMapValues(withoutNulls)
            payload["type"] = "workoutStart"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
            Self.launchWatchApp()
        }

        /// The live workout's plan again, after an exercise, superset or set
        /// was added, removed or regrouped on the phone. Same shape as
        /// `startWorkout` plus a `revision`; the watch swaps the plan in
        /// without restarting, and ignores a copy older than one it has.
        /// Queued and sent now if reachable, for the same reasons as a start.
        AsyncFunction("updateWorkoutPlan") { (plan: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = plan.compactMapValues(withoutNulls)
            payload["type"] = "workoutPlanUpdate"
            self.delegateHandler.transferPlanUpdate(payload)
        }

        /// Live stats for a GPS recording the phone is making, so the watch can
        /// show time, distance and pace and offer pause/finish. `durable` is
        /// set for a status change (start, pause, resume, finish) and also
        /// queues the message, so a watch out of range still learns of it; the
        /// ~3s distance refreshes are sent only while reachable, because a
        /// queued backlog of stale distances is worthless. Never uses
        /// application context: that single slot belongs to the check-in data.
        AsyncFunction("updateRecordingState") { (state: [String: Any], durable: Bool) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = state.compactMapValues(withoutNulls)
            payload["type"] = "recordingState"
            if durable {
                WCSession.default.transferUserInfo(payload)
            }
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
            if durable, payload["status"] as? String == "recording" {
                Self.launchWatchApp(activity: payload["activity"] as? String)
            }
        }

        /// Asks the watch to start a walk or run itself and opens its app, so
        /// the run is recorded with the watch's own sensors (steps, distance,
        /// heart rate). Queued so a watch out of range still hears it; the
        /// watch ignores a request that has gone stale.
        AsyncFunction("startRun") { (request: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = request.compactMapValues(withoutNulls)
            payload["type"] = "runStart"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
            Self.launchWatchApp(
                activity: payload["kind"] as? String,
                indoor: payload["place"] as? String == "indoor"
            )
        }

        /// Pause, resume, lap, finish or discard for the run going on the
        /// watch. Queued as well as sent live so a finish is not lost.
        AsyncFunction("sendRunControl") { (control: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = control.compactMapValues(withoutNulls)
            payload["type"] = "runControl"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
        }

        /// Confirms a cue the watch asked the phone to say, so the watch does
        /// not say it too. Live only: an ack that arrives late is useless.
        AsyncFunction("sendRunCueAck") { (id: String) -> Void in
            guard WCSession.isSupported(), WCSession.default.isReachable else { return }
            WCSession.default.sendMessage(["type": "runCueAck", "id": id], replyHandler: nil, errorHandler: nil)
        }

        /// Tells the watch the workout it was armed with is over, because it
        /// was finished (or discarded) on the phone. Without this the watch
        /// keeps an `HKWorkoutSession` running against a session the phone
        /// has already closed — a dead workout on screen and the sensor
        /// still sampling. Queued like `startWorkout` for the same reason: a
        /// watch out of range must still hear it eventually.
        AsyncFunction("stopWorkout") { (sessionId: String, stoppedAt: String, discarded: Bool?) -> Void in
            guard WCSession.isSupported() else { return }
            let payload: [String: Any] = [
                "type": "workoutStop",
                "sessionId": sessionId,
                "stoppedAt": stoppedAt,
                "discarded": discarded ?? false,
            ]
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                    WCSession.default.transferUserInfo(payload)
                }
            } else {
                WCSession.default.transferUserInfo(payload)
            }
        }

        /// Pause or resume the cap. Always queued, so a watch out of range
        /// still hears it, and sent immediately when reachable so the cap
        /// freezes without waiting for the queue. The watch keeps a snapshot
        /// that arrives before the plan and ignores an older revision.
        AsyncFunction("updateIntervalTiming") { (timing: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = timing
            payload["type"] = "intervalTiming"
            WCSession.default.transferUserInfo(payload)
            if WCSession.default.isReachable {
                WCSession.default.sendMessage(payload, replyHandler: nil, errorHandler: nil)
            }
        }

        /// Current weight/reps targets for the live session's sets. Queued and
        /// sent immediately like `updateIntervalTiming`; the watch keeps the
        /// highest revision, so a late queued copy cannot undo a newer one.
        AsyncFunction("updateSetTargets") { (update: [String: Any]) -> Void in
            guard WCSession.isSupported() else { return }
            var payload = update.compactMapValues(withoutNulls)
            payload["type"] = "setTargets"
            self.delegateHandler.transferSetTargets(payload)
        }

        /// The server config that owns batches queued from now on. Each batch
        /// is stamped when it arrives, so a batch already queued keeps the
        /// config that was active then. A batch that arrives while no config
        /// is active is not queued: nothing could prove which one owns it.
        AsyncFunction("setTelemetryOwner") { (ownerId: String) in
            self.heartRateAccess.sync {
                self.telemetryOwnerId = ownerId
                UserDefaults.standard.set(ownerId, forKey: self.telemetryOwnerKey)
            }
        }

        /// Batches that arrived before JavaScript was listening. JS drains
        /// these on startup and acks the ones it has stored. Async so the
        /// read is not on the JS thread; the queue lock is the actual guard.
        AsyncFunction("pendingHeartRateBatches") { () -> [[String: Any]] in
            self.heartRateAccess.sync { () -> [[String: Any]] in
                self.prepareHeartRateQueue()
                return self.heartRateQueue.map { $0.event }
            }
        }

        AsyncFunction("ackHeartRateBatches") { (clientIds: [String]) in
            let ids = Set(clientIds)
            self.heartRateAccess.sync {
                self.prepareHeartRateQueue()
                // A batch whose file cannot be deleted stays queued. The next
                // launch replays it, and JS acks it again once it is stored.
                self.heartRateQueue.removeAll { batch in
                    guard self.heartRateBatch(batch.event, matches: ids) else {
                        return false
                    }
                    return self.deleteHeartRateBatchFile(batch.fileName)
                }
            }
        }

        /// Runs that arrived before JavaScript was listening. JS drains these
        /// on startup and acks the ones it has stored.
        AsyncFunction("pendingWatchRuns") { () -> [[String: Any]] in
            self.runAccess.sync { () -> [[String: Any]] in
                self.loadRunQueue()
                if !self.runQueueStored {
                    self.runQueueStored = self.writeRunQueue()
                }
                return self.runQueue
            }
        }

        AsyncFunction("ackWatchRuns") { (clientIds: [String]) in
            let ids = Set(clientIds)
            self.runAccess.sync {
                self.loadRunQueue()
                let next = self.runQueue.filter { event in
                    guard let id = event["clientId"] as? String else { return true }
                    return !ids.contains(id)
                }
                // A failed rewrite leaves the old file, so the next launch
                // replays the run and JS acks it again once it is stored.
                if self.writeRunQueue(next) {
                    self.runQueue = next
                    self.runQueueStored = true
                }
            }
        }

        /// Batches evicted or refused since the last call, so JS can put the
        /// loss in the app log rather than only the device console.
        AsyncFunction("takeDroppedHeartRateBatchCount") { () -> Int in
            self.heartRateAccess.sync { () -> Int in
                let dropped = self.droppedHeartRateBatches
                self.droppedHeartRateBatches = 0
                return dropped
            }
        }
    }

    private func heartRateBatch(_ event: [String: Any], matches ids: Set<String>) -> Bool {
        if let clientId = event["clientId"] as? String, !clientId.isEmpty, ids.contains(clientId) {
            return true
        }
        if let queueId = event["queueId"] as? String, ids.contains(queueId) {
            return true
        }
        return false
    }

    /// Caller holds `heartRateAccess`. Reads batch files not read yet and
    /// retries writes that failed.
    private func prepareHeartRateQueue() {
        loadHeartRateQueue()
        storeUnsavedHeartRateBatches()
    }

    /// Caller holds `heartRateAccess`. The directory is excluded from
    /// backups, and its files are encrypted until the first unlock after a
    /// reboot.
    private func heartRateQueueDirectory() -> URL? {
        let fileManager = FileManager.default
        guard let base = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            return nil
        }
        var directory = base.appendingPathComponent("WatchHeartRateQueue", isDirectory: true)
        if heartRateQueueDirectoryReady {
            return directory
        }
        do {
            if !fileManager.fileExists(atPath: directory.path) {
                try fileManager.createDirectory(
                    at: directory,
                    withIntermediateDirectories: true,
                    attributes: [
                        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                    ]
                )
            }
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try directory.setResourceValues(values)
            heartRateQueueDirectoryReady = true
            return directory
        } catch {
            NSLog(
                "Watch heart-rate queue directory unavailable: %@",
                error.localizedDescription
            )
            return nil
        }
    }

    /// Caller holds `heartRateAccess`. A file that cannot be read yet stays
    /// on disk and is read on a later call. Writing a new batch never
    /// touches another batch's file, so an unreadable file is never
    /// overwritten.
    private func loadHeartRateQueue() {
        if heartRateQueueLoaded { return }
        guard let directory = heartRateQueueDirectory() else { return }
        migrateLegacyHeartRateQueue()
        let fileManager = FileManager.default
        guard let names = try? fileManager.contentsOfDirectory(atPath: directory.path) else {
            return
        }
        let known = Set(heartRateQueue.map { $0.fileName })
        var complete = true
        var loaded: [QueuedHeartRateBatch] = []
        for name in names where name.hasSuffix(".json") && !known.contains(name) {
            let url = directory.appendingPathComponent(name)
            guard let data = try? Data(contentsOf: url) else {
                complete = false
                continue
            }
            guard
                let event = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
                let ownerId = event["ownerId"] as? String,
                !ownerId.isEmpty
            else {
                // Unreadable JSON, or a batch from a development build that
                // queued without an owner. Neither can be replayed safely.
                try? fileManager.removeItem(at: url)
                droppedHeartRateBatches += 1
                continue
            }
            loaded.append(QueuedHeartRateBatch(event: event, fileName: name, stored: true))
        }
        heartRateQueue = (heartRateQueue + loaded).sorted { $0.fileName < $1.fileName }
        heartRateQueueLoaded = complete
        trimHeartRateQueue()
    }

    /// Caller holds `heartRateAccess`. Development builds kept the queue in
    /// one keychain item, and before that in UserDefaults. Those batches
    /// carry no owner, so they are deleted rather than moved.
    private func migrateLegacyHeartRateQueue() {
        UserDefaults.standard.removeObject(forKey: legacyHeartRateQueueKey)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "sparky.watchTelemetry",
            kSecAttrAccount as String: legacyHeartRateQueueKey,
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess, status != errSecItemNotFound {
            NSLog("Watch heart-rate legacy queue delete failed: %d", Int(status))
        }
    }

    /// Caller holds `heartRateAccess`.
    private func storeUnsavedHeartRateBatches() {
        guard heartRateQueue.contains(where: { !$0.stored }),
              let directory = heartRateQueueDirectory()
        else { return }
        for index in heartRateQueue.indices where !heartRateQueue[index].stored {
            heartRateQueue[index].stored = writeHeartRateBatch(heartRateQueue[index], in: directory)
        }
    }

    /// Caller holds `heartRateAccess`.
    private func writeHeartRateBatch(_ batch: QueuedHeartRateBatch, in directory: URL) -> Bool {
        guard
            JSONSerialization.isValidJSONObject(batch.event),
            let data = try? JSONSerialization.data(withJSONObject: batch.event)
        else {
            return false
        }
        do {
            try data.write(
                to: directory.appendingPathComponent(batch.fileName),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            return true
        } catch {
            NSLog("Watch heart-rate batch write failed: %@", error.localizedDescription)
            return false
        }
    }

    /// Caller holds `heartRateAccess`. True when the file is gone.
    private func deleteHeartRateBatchFile(_ fileName: String) -> Bool {
        guard let directory = heartRateQueueDirectory() else { return false }
        let url = directory.appendingPathComponent(fileName)
        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: url.path) { return true }
        do {
            try fileManager.removeItem(at: url)
            return true
        } catch {
            NSLog("Watch heart-rate batch delete failed: %@", error.localizedDescription)
            return false
        }
    }

    /// Sorts by arrival. Milliseconds stay 13 digits until the year 2286, so
    /// the names sort as strings.
    private func nextHeartRateFileName() -> String {
        let millis = Int64(Date().timeIntervalSince1970 * 1000)
        return "\(millis)-\(UUID().uuidString).json"
    }

    /// Caller holds `heartRateAccess`. Same shape `sendEvent` used to build
    /// inline. Optional numbers are omitted rather than stored as null so the
    /// queue survives JSON.
    private func heartRateEvent(from payload: [String: Any]) -> [String: Any] {
        var event: [String: Any] = [
            "clientId": payload["clientId"] as? String ?? "",
            "sessionId": payload["sessionId"] as? String ?? "",
            "exerciseEntryId": payload["exerciseEntryId"] as? String ?? "",
            // WatchConnectivity delivers nested dictionaries as NSArray of
            // NSDictionary. `as? [[String: Any]]` often fails on that and
            // would silently drop every sample.
            "samples": dictionaryArray(payload["samples"]),
        ]
        if let kcal = payload["activeEnergyKcal"] as? Double {
            event["activeEnergyKcal"] = kcal
        }
        if let minutes = payload["durationMinutes"] as? Double {
            event["durationMinutes"] = minutes
        }
        if !telemetryOwnerId.isEmpty {
            event["ownerId"] = telemetryOwnerId
        }
        return withQueueId(event)
    }

    /// Older watch builds omit `clientId`. A generated id lets the phone ack
    /// the queue entry without becoming the dedupe key JS uses for calories.
    private func withQueueId(_ event: [String: Any]) -> [String: Any] {
        var copy = event
        let clientId = copy["clientId"] as? String ?? ""
        if clientId.isEmpty, (copy["queueId"] as? String ?? "").isEmpty {
            copy["queueId"] = UUID().uuidString
        }
        return copy
    }

    /// Caller holds `heartRateAccess`.
    private func trimHeartRateQueue() {
        var dropped = 0
        while heartRateQueue.count > heartRateQueueBatchLimit {
            let oldest = heartRateQueue.removeFirst()
            _ = deleteHeartRateBatchFile(oldest.fileName)
            dropped += 1
        }
        if dropped > 0 {
            droppedHeartRateBatches += dropped
            NSLog(
                "Watch heart-rate queue over cap; dropped %d oldest batch(es)",
                dropped
            )
        }
    }

    /// Caller holds `heartRateAccess`.
    private func rememberHeartRateBatch(_ event: [String: Any]) {
        prepareHeartRateQueue()
        if let clientId = event["clientId"] as? String, !clientId.isEmpty,
           heartRateQueue.contains(where: { ($0.event["clientId"] as? String) == clientId }) {
            return
        }
        guard let ownerId = event["ownerId"] as? String, !ownerId.isEmpty else {
            droppedHeartRateBatches += 1
            NSLog("Watch heart-rate batch not queued: no server config is active")
            return
        }
        guard
            JSONSerialization.isValidJSONObject(event),
            let encoded = try? JSONSerialization.data(withJSONObject: event),
            encoded.count <= heartRateBatchByteLimit
        else {
            droppedHeartRateBatches += 1
            NSLog(
                "Watch heart-rate batch not queued: invalid or over %d bytes",
                heartRateBatchByteLimit
            )
            return
        }
        var batch = QueuedHeartRateBatch(
            event: event,
            fileName: nextHeartRateFileName(),
            stored: false
        )
        if let directory = heartRateQueueDirectory() {
            batch.stored = writeHeartRateBatch(batch, in: directory)
        }
        heartRateQueue.append(batch)
        trimHeartRateQueue()
    }

    /// The event JS and the native queue both store, so a cold start and a
    /// live event carry the same laps.
    private func normalizedRunEvent(_ payload: [String: Any]) -> [String: Any] {
        var event: [String: Any] = [
            "clientId": payload["clientId"] as? String ?? "",
            "kind": payload["kind"] as? String ?? "",
            "place": payload["place"] as? String ?? "",
            "startedAt": (payload["startedAt"] as? NSNumber)?.doubleValue ?? 0,
            "endedAt": (payload["endedAt"] as? NSNumber)?.doubleValue ?? 0,
            "activeSeconds": (payload["activeSeconds"] as? NSNumber)?.doubleValue ?? 0,
            "distanceMeters": (payload["distanceMeters"] as? NSNumber)?.doubleValue ?? 0,
            "activeEnergyKcal": (payload["activeEnergyKcal"] as? NSNumber)?.doubleValue ?? 0,
            "route": payload["route"] as? [[Double]] ?? [],
            "heartRate": payload["heartRate"] as? [[Double]] ?? [],
            "laps": numberList(payload["laps"]),
            "lapDistances": numberList(payload["lapDistances"]),
            "distanceSeries": payload["distanceSeries"] as? [[Double]] ?? [],
            "planId": payload["planId"] as? String ?? "",
            "programId": payload["programId"] as? String ?? "",
            "programIndex": (payload["programIndex"] as? NSNumber)?.intValue ?? -1,
            "planCompleted": payload["planCompleted"] as? Bool ?? false,
        ]
        // Indoor distance learning: the factor the watch applied, and what it
        // showed before a treadmill distance was entered on the wrist.
        if let scale = (payload["distanceScale"] as? NSNumber)?.doubleValue {
            event["distanceScale"] = scale
        }
        if let estimated = (payload["estimatedDistanceMeters"] as? NSNumber)?.doubleValue {
            event["estimatedDistanceMeters"] = estimated
        }
        return event
    }

    /// Caller holds `runAccess` only through `rememberFinishedRun`.
    private func rememberFinishedRun(_ event: [String: Any]) {
        let clientId = event["clientId"] as? String ?? ""
        guard !clientId.isEmpty else { return }
        runAccess.sync {
            loadRunQueue()
            if runQueue.contains(where: { ($0["clientId"] as? String) == clientId }) {
                return
            }
            runQueue.append(event)
            while runQueue.count > runQueueLimit {
                runQueue.removeFirst()
            }
            runQueueStored = writeRunQueue()
        }
    }

    /// Caller holds `runAccess`.
    private func loadRunQueue() {
        guard !runQueueLoaded else { return }
        runQueueLoaded = true
        guard let url = runQueueFile(),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data)
        else { return }
        let known = Set(runQueue.compactMap { $0["clientId"] as? String })
        for row in dictionaryArray(raw) {
            let id = row["clientId"] as? String ?? ""
            if id.isEmpty || known.contains(id) { continue }
            runQueue.append(row)
        }
    }

    /// Caller holds `runAccess`.
    @discardableResult
    private func writeRunQueue(_ rows: [[String: Any]]? = nil) -> Bool {
        let payload = rows ?? runQueue
        guard let url = runQueueFile(),
              JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload)
        else { return false }
        do {
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            NSLog("Watch run queue write failed: %@", error.localizedDescription)
            return false
        }
    }

    private func runQueueFile() -> URL? {
        let fileManager = FileManager.default
        guard let base = fileManager.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else { return nil }
        let directory = base.appendingPathComponent("WatchRunQueue", isDirectory: true)
        if !fileManager.fileExists(atPath: directory.path) {
            do {
                try fileManager.createDirectory(
                    at: directory,
                    withIntermediateDirectories: true,
                    attributes: [
                        .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                    ]
                )
            } catch {
                return nil
            }
        }
        return directory.appendingPathComponent("pending.json")
    }
}

/// Strips JS `null`s out of a payload bound for `updateApplicationContext`.
///
/// That API accepts property-list types only — data, string, number, date,
/// array, dictionary — and a single `NSNull` anywhere in the tree makes it
/// throw `WCErrorCodeInvalidParameter`. It fails the WHOLE push, not the
/// offending field, so one absent body-fat reading silently costs the watch
/// every other value in the same dictionary.
///
/// Nulls are load-bearing in this payload rather than accidental: the bridge
/// sends `null` for a figure it cannot vouch for, and `history[]` entries
/// carry `bodyFatPercentage: null` whenever a day has a weight but no body
/// fat. Dropping the key is lossless, because the watch reads every optional
/// field as `payload["key"] as? Double`, which cannot tell an absent key from
/// a null one. The carry-forward paths in `ContextPayloadMapper` rely on the
/// same equivalence.
private func withoutNulls(_ value: Any) -> Any? {
    if value is NSNull { return nil }
    if let dictionary = value as? [String: Any] {
        return dictionary.compactMapValues(withoutNulls)
    }
    if let array = value as? [Any] {
        return array.compactMap(withoutNulls)
    }
    return value
}

/// WatchConnectivity nested arrays arrive as `NSArray` of `NSDictionary`.
/// A direct `as? [[String: Any]]` frequently returns nil for that, which
/// would drop heart-rate samples while still forwarding energy.
private func dictionaryArray(_ value: Any?) -> [[String: Any]] {
    if let typed = value as? [[String: Any]] { return typed }
    guard let any = value as? [Any] else { return [] }
    return any.compactMap { $0 as? [String: Any] }
}

private func numberList(_ value: Any?) -> [Double] {
    if let numbers = value as? [NSNumber] { return numbers.map { $0.doubleValue } }
    if let numbers = value as? [Double] { return numbers }
    return []
}
