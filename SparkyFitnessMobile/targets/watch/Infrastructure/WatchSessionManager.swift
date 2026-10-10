import Foundation
import WatchConnectivity
import Combine

/// Watch-side WatchConnectivity wrapper: session lifecycle, the outbound
/// sends, and routing whatever arrives.
///
/// Deliberately does NOT know any wire keys. Inbound dictionaries are turned
/// into domain values by `ContextPayloadMapper`, outbound ones are built by
/// `OutboundPayloads`, and the complications are fed through
/// `ComplicationPublisher`. What's left here is the part that genuinely needs
/// `WCSession`, which is why this file went from four jobs to one.
///
/// Deliberately prefers `transferUserInfo` over `sendMessage` for check-ins:
/// the phone is realistically in another room, `sendMessage` fails outright when
/// unreachable, and a queued transfer is delivered by the system later. Losing a
/// morning's weight because the phone was charging in the bedroom would defeat
/// the whole point of the app.
@MainActor
final class WatchSessionManager: NSObject, ObservableObject {
    static let shared = WatchSessionManager()

    @Published private(set) var isReachable: Bool = false

    private let store = CheckInStore.shared
    private let workoutStore = WorkoutSessionStore.shared
    private let workoutHealthKit = WorkoutHealthKitController.shared
    /// Reads back the instants `WorkoutHealthKitController` formats with its
    /// own default `ISO8601DateFormatter`, to record how far HR was sent.
    private let instantParser = ISO8601DateFormatter()
    /// Cumulative active energy already reported to the phone, so each batch
    /// can carry only what was burned since the last one. Reset whenever a
    /// workout starts — `WorkoutSessionStore.activeEnergyKcal` restarts from
    /// nothing too, and a stale high-water mark would swallow the first
    /// batches of the new workout.
    private var reportedEnergyKcal: Double = 0

    /// True while a queued context request is still waiting to be answered.
    ///
    /// `transferUserInfo` queues rather than drops, so without this every
    /// phone-free glance at the watch would leave another request behind, and
    /// the phone would answer the lot in one burst the next time it woke.
    private var hasQueuedContextRequest = false
    /// True from the moment a HealthKit stop is asked for until its tail has
    /// been sent and the plan cleared. A second finish or a new plan that
    /// arrives in that window is held, not run against a session that `stop`
    /// has already nilled.
    private var collectionInFlight = false
    /// Newest plan that arrived while a finish was in flight. Started only
    /// after the old tail has been tagged with the old session.
    private var pendingPlan: ActiveWorkoutPlan?
    /// Revision of the plan update folded into a held start, per session,
    /// so an older copy can't replace it and the running plan starts from it.
    private var pendingPlanRevisions: [String: Double] = [:]
    /// Pause snapshots that arrived before `beginPlan` started that session.
    private var pendingIntervalTiming: [(
        sessionId: String, revision: Int, pausedAt: Date?, excludedPauseSeconds: Int
    )] = []
    /// Newest set targets for a session whose plan has not started yet,
    /// applied by `beginPlan`. One per session: each update is a full list.
    private var pendingSetTargets: [String: (
        revision: Double, targets: [String: SetValues], completedSetIds: Set<String>,
        rest: PhoneRest?, armedAt: Date?, setTimers: [String: Date]?
    )] = [:]
    /// When each session was stopped, on the phone's clock when the phone
    /// sent it. A start whose `armedAt` is at or before that is the queued
    /// copy. A later arm of the same session id is a new workout.
    private var endedAtBySession: [String: Date] = [:]
    private static let endedSessionsKey = "sparky.watch.endedWorkoutSessions"
    private static let endedSessionLimit = 20
    /// A finish asked to tell the phone while another stop was already running.
    private var pendingSendStop = false
    /// Snapshot recovery and a `workoutStart` that arrives first both talk to
    /// HealthKit. The start waits until this is `.finished`, or its session
    /// can end up being the one recovery just reattached.
    private enum HkRecovery {
        case notStarted
        case running
        case finished
    }
    private var hkRecovery: HkRecovery = .notStarted

    private override init() {
        super.init()
        endedAtBySession = Self.loadEndedSessions()
        if !WCSession.isSupported() {
            hkRecovery = .finished
        }
        activate()
    }

    /// Remembers a stop. A later value wins so a second stop of a re-armed
    /// session does not keep the earlier threshold.
    private func rememberEnded(_ sessionId: String, at endedAt: Date) {
        let kept = max(endedAtBySession[sessionId] ?? .distantPast, endedAt)
        endedAtBySession[sessionId] = kept
        let newest = endedAtBySession.sorted { $0.value < $1.value }
        if newest.count > Self.endedSessionLimit {
            for entry in newest.prefix(newest.count - Self.endedSessionLimit) {
                endedAtBySession.removeValue(forKey: entry.key)
            }
        }
        let raw = endedAtBySession.mapValues { $0.timeIntervalSince1970 }
        if let data = try? JSONEncoder().encode(raw) {
            UserDefaults.standard.set(data, forKey: Self.endedSessionsKey)
        }
    }

    private static func loadEndedSessions() -> [String: Date] {
        let defaults = UserDefaults.standard
        if let data = defaults.data(forKey: endedSessionsKey),
           let raw = try? JSONDecoder().decode([String: TimeInterval].self, from: data) {
            return raw.mapValues { Date(timeIntervalSince1970: $0) }
        }
        // The previous build stored ids and rejected every future start.
        // Stamp them ended as of this launch so a queued copy is still
        // dropped and a later re-arm is not.
        guard let ids = defaults.stringArray(forKey: endedSessionsKey) else { return [:] }
        let now = Date()
        var migrated: [String: Date] = [:]
        for id in ids {
            migrated[id] = now
        }
        return migrated
    }

    /// True when this start is the queued copy of an arm that already stopped.
    private func startIsStale(_ plan: ActiveWorkoutPlan) -> Bool {
        guard let endedAt = endedAtBySession[plan.sessionId] else { return false }
        return (plan.armedAt ?? .distantPast) <= endedAt
    }

    private func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    /// Sends made before `WCSession` finished activating.
    ///
    /// `activate()` returns immediately and the session only becomes usable
    /// when the delegate callback lands, so there is a window at launch where
    /// `transferUserInfo` is a programmer error rather than a queued send —
    /// WatchConnectivity raises instead of holding it. The window is short but
    /// it is exactly the one a complication tap lands in: the app cold-starts
    /// straight onto the Water page and a square is one tap away.
    ///
    /// In memory rather than persisted, deliberately. Activation completes
    /// moments after launch, and a tap lost with the process is reconciled
    /// anyway: the optimistic bump in `CheckInStore.pendingWaterTaps` clears
    /// on the next context push carrying today's water, so the bottle settles
    /// back to the truth rather than lying indefinitely.
    private var deferredTransfers: [[String: Any]] = []

    private var isActivated: Bool {
        WCSession.isSupported() && WCSession.default.activationState == .activated
    }

    /// The single door every queued send goes through.
    ///
    /// Water taps and deletes need the deferral: neither has an ack path or a
    /// replayable backing list, so dropping one silently is indistinguishable
    /// to the wearer from the app being broken. Check-ins would survive
    /// without it — they sit in `CheckInStore.pending` until `retryPending()`
    /// — but routing them through here too keeps one rule instead of two.
    private func transfer(_ payload: [String: Any]) {
        guard WCSession.isSupported() else { return }
        guard isActivated else {
            deferredTransfers.append(payload)
            return
        }
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(payload, replyHandler: nil) { _ in
                WCSession.default.transferUserInfo(payload)
            }
        } else {
            WCSession.default.transferUserInfo(payload)
        }
    }

    private func flushDeferredTransfers() {
        guard isActivated, !deferredTransfers.isEmpty else { return }
        let queued = deferredTransfers
        deferredTransfers.removeAll()
        for payload in queued {
            transfer(payload)
        }
    }

    /// How often the phone is told the current reading. The phone's chip
    /// should move with the wrist, but a message per sample would keep the
    /// radio busy for a number that changes by a beat or two.
    private static let liveHeartRateInterval: TimeInterval = 3
    private static let liveHeartRateMaxAge: TimeInterval = 5
    private var lastLiveHeartRateAt: Date?

    /// Tells the phone the current reading, only while it can be reached. A
    /// live message that cannot be delivered now is dropped on purpose; the
    /// batch every minute is what carries the readings for the diary.
    ///
    /// `measuredAt` is when HealthKit took the reading. A reading older than
    /// `liveHeartRateMaxAge` (a backlog replay after a recovery, or a callback
    /// that outlived the exercise it was measured in) is not "live" and would
    /// be labelled with whatever exercise is on screen now, so it is skipped.
    private func sendLiveHeartRate(_ bpm: Double, measuredAt: Date) {
        guard Date().timeIntervalSince(measuredAt) <= Self.liveHeartRateMaxAge else { return }
        guard WCSession.isSupported(), isActivated, WCSession.default.isReachable,
              bpm > 0,
              let sessionId = workoutStore.plan?.sessionId,
              let exerciseEntryId = workoutStore.currentStep?.exerciseEntryId
                ?? workoutStore.steps.last?.exerciseEntryId
        else { return }
        let now = Date()
        if let last = lastLiveHeartRateAt, now.timeIntervalSince(last) < Self.liveHeartRateInterval {
            return
        }
        lastLiveHeartRateAt = now
        WCSession.default.sendMessage(
            OutboundPayloads.liveHeartRate(
                sessionId: sessionId,
                exerciseEntryId: exerciseEntryId,
                bpm: bpm,
                at: measuredAt
            ),
            replyHandler: nil,
            errorHandler: nil
        )
    }

    /// Hands a check-in to the system for delivery. Returns the state to show:
    /// `.queued` always, because even a reachable phone hasn't written to the
    /// server yet — the ack flips it to `.saved`.
    func send(_ checkIn: CheckIn) -> SyncState {
        guard WCSession.isSupported() else { return .failed }
        transfer(OutboundPayloads.checkIn(checkIn))
        // Still `.queued` even when the transfer was deferred: the check-in is
        // in `CheckInStore.pending` either way, and the ack is the only thing
        // that moves it to `.saved`.
        return .queued
    }

    /// Asks the phone to start one saved workout. Queued like a check-in: the
    /// phone is often in a bag, and a tap that vanishes is the bug.
    func requestWorkoutStart(presetId: String, serverId: String?) {
        guard WCSession.isSupported() else { return }
        transfer(OutboundPayloads.workoutStartRequest(presetId: presetId, serverId: serverId))
    }

    /// Tells the phone whether to write a finished workout's changes into its
    /// saved workout. Queued like a tap on the picker: the phone is often in a
    /// bag, and an answer that vanishes leaves the question open on the phone.
    func sendPresetUpdateAnswer(sessionId: String, update: Bool) {
        guard WCSession.isSupported() else { return }
        transfer(OutboundPayloads.presetUpdateAnswer(sessionId: sessionId, update: update))
    }

    /// Re-queues everything still unconfirmed. Used by the retry affordance and
    /// on app launch, since a transfer can be lost if the app was force-quit.
    func retryPending() {
        // Skipped rather than deferred while activating: the activation
        // callback calls this itself, so deferring here would queue every
        // pending check-in twice.
        guard isActivated else { return }
        for checkIn in store.retryable {
            transfer(OutboundPayloads.checkIn(checkIn))
        }
    }

    /// Logs one full serving of `containerId` against today, straight to the
    /// server — there is no local-only increment. Uses the same queued
    /// delivery as a check-in (`send(_:)`) and for the same reason: the
    /// wearer is realistically drinking from wherever the phone isn't.
    ///
    /// Acknowledged like a check-in: the phone reports each tap by `clientId`,
    /// immediately when reachable and again in every context push, so the
    /// Water page can show the tap as queued, then saved, then failed. It used
    /// to be fire-and-forget, which meant a tap that never landed looked
    /// exactly like one that did.
    /// `clientId` comes from `CheckInStore.recordWaterTap` rather than being
    /// generated here: the store's copy of the tap and the phone's
    /// acknowledgement have to be talking about the same id, and two `UUID()`
    /// calls never are.
    func sendWaterTap(containerId: Int, clientId: String) {
        guard WCSession.isSupported() else { return }
        let tap = WaterTap(
            id: clientId,
            entryDate: CheckInDate.today(),
            containerId: containerId
        )
        transfer(OutboundPayloads.waterTap(tap))
    }

    /// Re-sends every tap still waiting on the phone, under its original id.
    ///
    /// The counterpart to `retryPending()` for check-ins, and the thing whose
    /// absence left a tap stuck: a `.queued` tap was only ever sent once. If
    /// that one transfer was lost — the watch app was killed before the
    /// session activated and the in-memory outbox died with it, or it arrived
    /// at a phone whose JS layer hadn't booted yet, so nothing was listening —
    /// there was no path that ever sent it again. The store's copy persisted,
    /// so the line stayed on the bottle for a tap the phone had never heard of.
    ///
    /// Safe to call often: the id is unchanged, so a tap that did land is
    /// recognised by the phone's dedupe set and re-acknowledged rather than
    /// written twice.
    func resendQueuedWaterTaps() {
        guard isActivated else { return }
        for tap in store.pendingWaterTaps where tap.state == .queued {
            sendWaterTap(containerId: tap.containerId, clientId: tap.id)
        }
    }

    /// Re-sends every tap the phone reported as failed, under its original id.
    /// Reusing the id is what keeps a retry from double-counting if the first
    /// attempt actually landed — the phone's own dedupe set recognises it.
    func retryFailedWaterTaps() {
        for tap in store.retryableWaterTaps {
            store.markWaterTap(tap.id, .queued)
            sendWaterTap(containerId: tap.containerId, clientId: tap.id)
        }
    }

    /// Asks the phone to delete one logged drink. Same fire-and-reconcile
    /// contract as `sendWaterTap`: no ack comes back, the water log view has
    /// already hidden the row, and the next context push either confirms that
    /// (row gone) or restores it (delete failed).
    /// `clientId` comes from `CheckInStore.recordWaterDelete`, for the same
    /// reason a tap's does: the store's record and the phone's acknowledgement
    /// have to name the same thing.
    func sendWaterDelete(entryId: String, clientId: String) {
        guard WCSession.isSupported() else { return }
        let request = WaterDeleteRequest(id: clientId, entryId: entryId)
        transfer(OutboundPayloads.waterDelete(request))
    }

    /// Re-sends every delete still waiting, under its original id. The
    /// counterpart to `resendQueuedWaterTaps()` — deleting the same row twice
    /// is harmless anyway, but the id means the phone recognises the repeat
    /// and re-acknowledges rather than erroring on a row that's already gone.
    func resendQueuedWaterDeletes() {
        guard isActivated else { return }
        for request in store.queuedWaterDeletes {
            sendWaterDelete(entryId: request.entryId, clientId: request.id)
        }
    }

    /// Re-publishes both complications' shared-storage snapshots from the
    /// context the watch already holds.
    ///
    /// Without this, a complication's data depended entirely on a *fresh*
    /// context arriving from the phone, because `handle(context:)` was the
    /// only thing that ever wrote to the App Group. The app's own pages don't
    /// have that dependency — `CheckInStore` persists the context and
    /// restores it at launch — so the Water page could sit there reading 40%
    /// from disk while the complication showed 0%, having never been written
    /// at all. That happens on any launch where the phone app isn't in the
    /// foreground: `requestContext()` bails on `isReachable` and no push
    /// comes.
    ///
    /// Stale contexts are skipped rather than republished: the publisher
    /// stamps every snapshot with today's date, so writing yesterday's numbers
    /// would relabel them as today's. Leaving the old snapshot in place lets
    /// the widgets' own date checks fall back to empty, which is the honest
    /// answer.
    ///
    /// This is the one path that feeds the complications from the store rather
    /// than from a payload — see `handle(context:)` for the normal one.
    func refreshComplications() {
        let context = store.context

        // The `isToday` checks are now belt to the publisher's braces — it
        // rejects a non-today `day` itself. Kept because they also skip the
        // pointless work of building a snapshot that would be discarded.
        if let nutrition = context.nutrition, nutrition.isToday {
            ComplicationPublisher.publish(
                goals: GoalProgress(
                    calories: nutrition.calorieProgress,
                    protein: nutrition.protein.progress,
                    carbs: nutrition.carbs.progress,
                    fat: nutrition.fat.progress
                ),
                for: nutrition.day
            )
        }

        if let water = context.water, water.isToday {
            ComplicationPublisher.publish(
                waterProgress: context.waterProgress(ml: water.consumedMl) ?? 0,
                for: water.day
            )
        }
    }

    /// Adopts the application context WatchConnectivity is already holding.
    ///
    /// `didReceiveApplicationContext` fires only for *new* updates, so the
    /// most recent context the phone set — sitting in
    /// `receivedApplicationContext` the whole time — was never read. That
    /// left a gap with no way out of it: a fresh install (every rebuild from
    /// Xcode is one) starts with empty storage, the phone has nothing new to
    /// say so says nothing, and opening the phone app re-pushes a dictionary
    /// identical to the one already set, which the system declines to
    /// redeliver. The watch would sit there with no containers indefinitely
    /// while the data it needed was one property access away.
    ///
    /// Safe to call repeatedly: it routes through the same handler a live
    /// push does, and an unchanged context simply re-applies the same values.
    func adoptReceivedContext() {
        guard WCSession.isSupported() else { return }
        let received = WCSession.default.receivedApplicationContext
        guard !received.isEmpty else { return }
        route(received)
    }

    /// Asks the phone for a fresh context (seed values + history).
    ///
    /// Two transports, because the interesting case is the one where the phone
    /// isn't there: `sendMessage` reaches a phone whose app is running right
    /// now and fails outright otherwise, so on its own it made every glance
    /// with the phone in another room a silent no-op. `transferUserInfo`
    /// queues instead, and the system delivers it whenever the phone next
    /// wakes — the same guarantee check-ins already rely on.
    ///
    /// At most one queued request is outstanding: the phone's answer clears the
    /// flag in `handle(context:)`.
    func requestContext() {
        guard WCSession.isSupported() else { return }

        if WCSession.default.isReachable {
            WCSession.default.sendMessage(
                OutboundPayloads.contextRequest,
                replyHandler: nil,
                errorHandler: nil
            )
            return
        }

        guard !hasQueuedContextRequest else { return }
        hasQueuedContextRequest = true
        transfer(OutboundPayloads.contextRequest)
    }

    /// Applies an inbound context: into the app's own store, and — separately
    /// — out to the complications.
    ///
    /// The two sinks are siblings fed from the same payload, not a chain. The
    /// complication runs in another process and cannot read this app's
    /// storage, so the numbers genuinely go out twice. That independence is
    /// also why they can disagree, which is what `refreshComplications()`
    /// above exists to repair.
    private func handle(context payload: [String: Any]) {
        // Whatever this is a reply to, the phone has now spoken — so a fresh
        // queued request is allowed again.
        hasQueuedContextRequest = false

        let incoming = ContextPayloadMapper.context(from: payload, previous: store.context)
        store.apply(context: incoming)

        // The day this payload is ABOUT — not necessarily today. Anything
        // routed through here may be a replay of the cached context by
        // `adoptReceivedContext()`, which on the first launch of a morning is
        // still yesterday's. Passing the day is what lets the publisher tell
        // a genuinely fresh push from a rerun of an old one.
        let day = ContextPayloadMapper.day(from: payload)

        // Skipped, not published as zeros, when the phone couldn't vouch for
        // today's numbers. Whatever snapshot is already in shared storage stays
        // — and the widget's own date check turns a stale one into an empty
        // face, which is the honest answer.
        if let goals = ContextPayloadMapper.goalProgress(from: payload) {
            ComplicationPublisher.publish(goals: goals, for: day)
        }
        // Derived from the parsed snapshot rather than a dedicated payload
        // field: the two water figures already travel for the Water page's
        // bottle, and a third field carrying their ratio would be a second
        // version of the same truth to keep in step.
        if let water = incoming.water {
            ComplicationPublisher.publish(
                waterProgress: incoming.waterProgress(ml: water.consumedMl) ?? 0,
                for: day
            )
        }
    }

    /// Marks one check-in saved or failed once the phone reports the server
    /// write. Ignores an ack for a check-in this watch no longer tracks — a
    /// re-delivered transfer for something already reconciled.
    private func handle(ack payload: [String: Any]) {
        guard let ack = ContextPayloadMapper.ack(from: payload) else { return }

        // Check-ins and water taps draw their client ids from the same UUID
        // space, so one ack message serves both — whichever recognises the id
        // acts on it, and neither can mistake the other's.
        if let checkIn = store.retryable.first(where: { $0.id == ack.clientId })
            ?? (store.lastCaptured?.id == ack.clientId ? store.lastCaptured : nil) {
            store.markState(ack.ok ? .saved : .failed, for: checkIn)
            return
        }
        let state: SyncState = ack.ok ? .saved : .failed
        store.markWaterTap(ack.clientId, state)
        store.markWaterDelete(ack.clientId, state)
    }

    /// The single entry point for everything inbound, whichever transport
    /// delivered it — a live push, a queued message, or the locally cached
    /// context read by `adoptReceivedContext()`.
    private func route(_ payload: [String: Any]) {
        switch ContextPayloadMapper.type(of: payload) {
        case "context": handle(context: payload)
        case "ack": handle(ack: payload)
        case "workoutStart": handle(workoutStart: payload)
        case "workoutStop": handle(workoutStopFromPhone: payload)
        case "intervalTiming": handle(intervalTiming: payload)
        case "setTargets": handle(setTargets: payload)
        case "workoutPlanUpdate": handle(workoutPlanUpdate: payload)
        default: break
        }
    }

    // MARK: - Workout

    /// Starts (or restarts, superseding whatever was running) the workout the
    /// phone just armed the watch with. Requests HealthKit authorization every
    /// time rather than caching the result: the wearer can grant or revoke it
    /// from Settings between workouts, and a stale "already granted" would
    /// silently run with no heart rate.
    private func handle(workoutStart payload: [String: Any]) {
        guard let plan = ContextPayloadMapper.workoutPlan(from: payload) else { return }
        // A stop can be delivered before the queued copy of this start. That
        // copy must not start a workout the phone or the wearer already ended.
        if startIsStale(plan) { return }
        // A redelivered `workoutStart` for the session already running must
        // not stop HealthKit and restart the plan from set 1.
        if workoutStore.plan?.sessionId == plan.sessionId { return }

        // Recovery may still be reattaching the previous HealthKit session.
        // Queue the plan and let that finish (and stop the old session)
        // before this one starts, or `start` no-ops onto the old workout.
        if hkRecovery != .finished {
            pendingPlan = plan
            collectionInFlight = true
            return
        }

        if collectionInFlight {
            pendingPlan = plan
            return
        }
        if workoutStore.plan == nil {
            // Nothing to tag, but a leftover HealthKit session still has to
            // end before the new one starts.
            collectionInFlight = true
            pendingPlan = plan
            workoutHealthKit.stop { [weak self] _, _ in
                Task { @MainActor in
                    guard let self else { return }
                    let next = self.pendingPlan
                    self.pendingPlan = nil
                    self.pendingSendStop = false
                    self.collectionInFlight = false
                    if let next {
                        self.beginPlan(next)
                    }
                }
            }
            return
        }
        pendingPlan = plan
        finishCollection(sendStop: false)
    }

    /// Arms a plan that is not replacing a live one. Authorization is asked
    /// every time: the wearer can change it in Settings between workouts.
    private func beginPlan(_ plan: ActiveWorkoutPlan) {
        guard !startIsStale(plan) else { return }
        workoutStore.start(
            with: plan,
            planRevision: pendingPlanRevisions.removeValue(forKey: plan.sessionId) ?? 0
        )
        // Only this session's snapshots. Another plan's pause may already be
        // queued and has to survive until that plan starts.
        replayIntervalTiming(sessionId: plan.sessionId)
        if let pending = pendingSetTargets[plan.sessionId],
           Self.sameArm(pending.armedAt, plan.armedAt) {
            workoutStore.applyTargets(
                sessionId: plan.sessionId,
                revision: pending.revision,
                targets: pending.targets,
                completedSetIds: pending.completedSetIds,
                phoneRest: pending.rest,
                setTimers: pending.setTimers
            )
        }
        // Only this session's: another plan's targets may already be held
        // and have to survive until that plan starts, like interval timing.
        pendingSetTargets[plan.sessionId] = nil
        reportedEnergyKcal = 0
        bindHealthKitCallbacks()
        workoutHealthKit.requestAuthorization { [weak self] _ in
            guard let self else { return }
            guard let current = self.workoutStore.plan,
                  current.sessionId == plan.sessionId,
                  Self.sameArm(current.armedAt, plan.armedAt) else { return }
            self.workoutHealthKit.start(
                sessionId: plan.sessionId,
                workoutName: plan.workoutName
            )
        }
    }

    /// The HealthKit controller outlives a jetsam'd SwiftUI tree; the
    /// closures do not. Rebind after recover so samples keep flowing.
    private func bindHealthKitCallbacks() {
        // Neither closure runs on the main actor by virtue of running on the
        // main thread — `WorkoutHealthKitController` dispatches them there,
        // but that alone doesn't satisfy Swift's isolation checking for the
        // `@MainActor` types on the other end, so each hops explicitly, the
        // same pattern `WCSessionDelegate`'s callbacks use above.
        workoutHealthKit.onHeartRate = { [weak self, weak workoutStore] bpm, measuredAt in
            Task { @MainActor in
                workoutStore?.recordHeartRate(bpm: bpm, measuredAt: measuredAt)
                self?.sendLiveHeartRate(bpm, measuredAt: measuredAt)
            }
        }
        workoutHealthKit.onBatchReady = { [weak self] samples in
            Task { @MainActor in
                self?.sendHeartRateBatchForCurrentExercise(samples)
            }
        }
        workoutHealthKit.onActiveEnergy = { [weak workoutStore] kcal in
            Task { @MainActor in
                workoutStore?.recordActiveEnergy(kcal: kcal)
            }
        }
        // Close out the exercise being left before the cursor moves, so its
        // readings and energy are not credited to whatever comes next when
        // the minute timer (or the final drain) fires. Both sides are main
        // actor, so this runs synchronously ahead of the move.
        // Skip and ±15s pressed here reach the phone's rest too.
        workoutStore.onRestChangedHere = { [weak self] previousEndsAt, endsAt in
            guard let self, let sessionId = self.workoutStore.plan?.sessionId else { return }
            self.transfer(OutboundPayloads.restChanged(
                sessionId: sessionId,
                previousEndsAt: previousEndsAt,
                endsAt: endsAt
            ))
        }
        // A hold countdown or stopwatch started here starts the phone's too.
        workoutStore.onSetTimerStartedHere = { [weak self] setId, startedAt in
            guard let self, let sessionId = self.workoutStore.plan?.sessionId else { return }
            self.transfer(OutboundPayloads.setTimerStarted(
                sessionId: sessionId,
                setId: setId,
                startedAt: startedAt,
                armedAt: self.workoutStore.plan?.armedAt
            ))
        }
        workoutStore.onSetTimerStoppedHere = { [weak self] setId, startedAt, seconds in
            guard let self, let sessionId = self.workoutStore.plan?.sessionId else { return }
            self.transfer(OutboundPayloads.setTimerStopped(
                sessionId: sessionId,
                setId: setId,
                seconds: seconds,
                startedAt: startedAt
            ))
        }
        workoutStore.onExerciseWillChange = { [weak self] outgoingExerciseEntryId in
            guard let self else { return }
            let minutes = self.workoutStore.closeExerciseWindow(outgoingExerciseEntryId)
            self.sendHeartRateBatch(
                self.workoutHealthKit.drainPending(),
                exerciseEntryId: outgoingExerciseEntryId,
                durationMinutes: minutes
            )
        }
    }

    /// Picks an HKWorkoutSession back up after jetsam, or starts a fresh one
    /// against the persisted plan if the system let the recovered session go.
    /// A start or finish that is already pending is newer than the snapshot,
    /// so the snapshot is not restored; the leftover session is still ended
    /// before that pending plan is armed.
    private func recoverLiveWorkoutIfNeeded() {
        retryPendingTails()
        hkRecovery = .running
        // A finish that was cut off is completed before anything else. It is
        // older than any queued plan, and resuming it would restart a workout
        // the wearer already ended.
        if workoutStore.plan == nil,
           let snapshot = workoutStore.storedSnapshot(),
           let finishing = snapshot.finishing {
            completeInterruptedFinish(snapshot, finishing: finishing)
            return
        }
        if collectionInFlight || pendingPlan != nil {
            stopLeftoverSessionThenResume()
            return
        }
        if workoutStore.plan != nil {
            hkRecovery = .finished
            return
        }
        guard let snapshot = workoutStore.restoreSnapshot() else {
            stopLeftoverSessionThenResume()
            return
        }
        reportedEnergyKcal = snapshot.reportedEnergyKcal
        bindHealthKitCallbacks()
        workoutHealthKit.recoverIfNeeded(
            heartRateSentThrough: snapshot.heartRateSentThrough
        ) { [weak self] recovered in
            Task { @MainActor in
                guard let self else { return }
                if self.collectionInFlight || self.pendingPlan != nil {
                    self.abandonRecoveredSessionThenResume()
                    return
                }
                self.hkRecovery = .finished
                if recovered { return }
                self.workoutHealthKit.requestAuthorization { _ in
                    self.workoutHealthKit.start(sessionId: snapshot.plan.sessionId, workoutName: snapshot.plan.workoutName)
                }
            }
        }
    }

    /// The process stopped after a finish began but before its tail and stop
    /// signal were queued. Ends any session HealthKit still has running, reads
    /// the readings the phone has not seen back from the saved workout, sends
    /// them with the exercise's duration, then clears the snapshot and arms
    /// whatever plan waited. Resending is harmless: only readings past
    /// `heartRateSentThrough`, and the server keeps the longer duration.
    ///
    /// When HealthKit saved no workout for this session, only the duration and
    /// stop go out. Other readings from the same stretch of time are not
    /// guessed onto the exercise.
    private func completeInterruptedFinish(
        _ snapshot: WorkoutSessionStore.Snapshot,
        finishing: WorkoutSessionStore.Finishing
    ) {
        let sessionId = snapshot.plan.sessionId
        let complete: ([HeartRateSample]) -> Void = { [weak self] samples in
            guard let self else { return }
            self.sendDetachedBatch(
                samples,
                sessionId: sessionId,
                exerciseEntryId: finishing.exerciseEntryId,
                durationMinutes: finishing.minutes
            )
            if finishing.sendStop {
                self.transfer(
                    OutboundPayloads.workoutStop(WorkoutStopSignal(sessionId: sessionId))
                )
            }
            self.workoutStore.clearSnapshot()
            self.hkRecovery = .finished
            self.resumeQueuedPlan()
        }
        workoutHealthKit.recoverIfNeeded(
            heartRateSentThrough: snapshot.heartRateSentThrough
        ) { [weak self] recovered in
            Task { @MainActor in
                guard let self else { return }
                if recovered {
                    // Killed before HealthKit was told to end: the session
                    // is still live, so stop it the normal way.
                    // No `onBuffered`: the buffer and the tail arrive together.
                    self.workoutHealthKit.stop(onLateTail: { [weak self] samples in
                        MainActor.assumeIsolated {
                            self?.deliverLateTail(
                                samples,
                                sessionId: sessionId,
                                exerciseEntryId: finishing.exerciseEntryId
                            )
                        }
                    }) { [weak self] samples, timedOut in
                        MainActor.assumeIsolated {
                            if timedOut {
                                self?.parkLateTail(
                                    sessionId: sessionId,
                                    exerciseEntryId: finishing.exerciseEntryId,
                                    sentThrough: snapshot.heartRateSentThrough
                                )
                            }
                            complete(samples)
                        }
                    }
                    return
                }
                self.workoutHealthKit.readSavedHeartRate(
                    sessionId: sessionId,
                    sentThrough: snapshot.heartRateSentThrough
                ) { samples in
                    Task { @MainActor in complete(samples ?? []) }
                }
            }
        }
    }

    /// Queues a batch for a workout that is no longer the live plan, so it
    /// cannot read its ids or energy from `workoutStore`. Energy is left out:
    /// the running total it would be a delta against is gone.
    private func sendDetachedBatch(
        _ samples: [HeartRateSample],
        sessionId: String,
        exerciseEntryId: String,
        durationMinutes: Double? = nil
    ) {
        let minutes = (durationMinutes ?? 0) > 0 ? durationMinutes : nil
        guard !samples.isEmpty || minutes != nil else { return }
        transfer(
            OutboundPayloads.heartRateBatch(
                HeartRateBatch(
                    clientId: UUID().uuidString,
                    sessionId: sessionId,
                    exerciseEntryId: exerciseEntryId,
                    samples: samples,
                    activeEnergyKcal: nil,
                    durationMinutes: minutes
                )
            )
        )
    }

    /// The finish timed out before HealthKit's saved tail was read. Records
    /// what is still owed so it goes out when `onLateTail` fires, or on the
    /// next launch if this process does not live that long.
    private func parkLateTail(
        sessionId: String,
        exerciseEntryId: String,
        sentThrough: Date? = nil
    ) {
        workoutStore.addPendingTail(
            WorkoutSessionStore.PendingTail(
                sessionId: sessionId,
                exerciseEntryId: exerciseEntryId,
                sentThrough: sentThrough ?? workoutStore.heartRateSentThrough,
                createdAt: Date()
            )
        )
    }

    /// A tail that arrived after its finish timed out.
    private func deliverLateTail(
        _ samples: [HeartRateSample],
        sessionId: String,
        exerciseEntryId: String
    ) {
        sendDetachedBatch(samples, sessionId: sessionId, exerciseEntryId: exerciseEntryId)
        workoutStore.removePendingTail(sessionId: sessionId)
    }

    /// Tails parked by a finish that timed out, in a process that ended before
    /// HealthKit handed them over. Read back from the saved workout. One that
    /// HealthKit still has no workout for is kept for a later launch, up to a
    /// day, in case the save is still pending.
    private func retryPendingTails() {
        for tail in workoutStore.pendingTails() {
            workoutHealthKit.readSavedHeartRate(
                sessionId: tail.sessionId,
                sentThrough: tail.sentThrough
            ) { [weak self] samples in
                Task { @MainActor in
                    guard let self else { return }
                    if let samples {
                        self.deliverLateTail(
                            samples,
                            sessionId: tail.sessionId,
                            exerciseEntryId: tail.exerciseEntryId
                        )
                    } else if Date().timeIntervalSince(tail.createdAt) > Self.pendingTailMaxAge {
                        self.workoutStore.removePendingTail(sessionId: tail.sessionId)
                    }
                }
            }
        }
    }

    private static let pendingTailMaxAge: TimeInterval = 24 * 60 * 60

    /// Ends a HealthKit session we are not going to keep, then arms whatever
    /// plan was queued while recovery ran.
    private func stopLeftoverSessionThenResume() {
        workoutHealthKit.recoverIfNeeded { [weak self] recovered in
            Task { @MainActor in
                guard let self else { return }
                let finish = {
                    self.hkRecovery = .finished
                    self.resumeQueuedPlan()
                }
                if recovered {
                    self.workoutHealthKit.stop { _, _ in
                        Task { @MainActor in finish() }
                    }
                } else {
                    finish()
                }
            }
        }
    }

    /// A new plan arrived after the snapshot was restored but before the old
    /// session was safe to replace. Send the old tail, then drop it.
    private func abandonRecoveredSessionThenResume() {
        let closing = workoutStore.closeCurrentExerciseWindow()
        let abandonedSessionId = workoutStore.plan?.sessionId
        if let closing {
            workoutStore.markFinishing(
                WorkoutSessionStore.Finishing(
                    exerciseEntryId: closing.id,
                    minutes: closing.minutes,
                    sendStop: false,
                    requestedAt: Date()
                )
            )
        }
        workoutHealthKit.stop(onBuffered: { [weak self] samples in
            MainActor.assumeIsolated {
                guard let self, let closing else { return }
                self.sendHeartRateBatch(
                    samples,
                    exerciseEntryId: closing.id,
                    durationMinutes: closing.minutes
                )
            }
        }, onLateTail: { [weak self] samples in
            MainActor.assumeIsolated {
                guard let self, let closing, let abandonedSessionId else { return }
                self.deliverLateTail(
                    samples,
                    sessionId: abandonedSessionId,
                    exerciseEntryId: closing.id
                )
            }
        }) { [weak self] samples, timedOut in
            MainActor.assumeIsolated {
                guard let self else { return }
                if let closing {
                    self.sendHeartRateBatch(samples, exerciseEntryId: closing.id)
                    if timedOut, let abandonedSessionId {
                        self.parkLateTail(sessionId: abandonedSessionId, exerciseEntryId: closing.id)
                    }
                }
                self.workoutStore.reset()
                self.hkRecovery = .finished
                self.resumeQueuedPlan()
            }
        }
    }

    /// Starts the plan that waited out recovery. A phone stop that cleared it
    /// while we waited leaves the watch idle.
    private func resumeQueuedPlan() {
        guard hkRecovery == .finished, collectionInFlight else { return }
        let next = pendingPlan
        pendingPlan = nil
        pendingSendStop = false
        collectionInFlight = false
        if let next {
            beginPlan(next)
        }
    }

    /// The phone paused or resumed an interval. The snapshot is absolute and
    /// numbered, so a resume that beats its queued pause still wins. A
    /// snapshot that arrives before its plan is kept and applied in
    /// `beginPlan` — dropping it here left the watch on a stale cap.
    private func handle(intervalTiming payload: [String: Any]) {
        guard let timing = ContextPayloadMapper.intervalTiming(from: payload) else { return }
        if endedAtBySession[timing.sessionId] != nil,
           workoutStore.plan?.sessionId != timing.sessionId,
           pendingPlan?.sessionId != timing.sessionId {
            return
        }
        if workoutStore.plan?.sessionId == timing.sessionId {
            workoutStore.applyIntervalTiming(
                sessionId: timing.sessionId,
                revision: timing.revision,
                pausedAt: timing.pausedAt,
                excludedPauseSeconds: timing.excludedPauseSeconds
            )
            return
        }
        pendingIntervalTiming.append(timing)
    }

    /// The phone's current targets for every set, and the sets it has
    /// logged. Applied now when that
    /// session is running, otherwise held until its plan starts: the phone
    /// can send these before a queued `workoutStart` has been delivered.
    private func handle(setTargets payload: [String: Any]) {
        guard let update = ContextPayloadMapper.setTargets(from: payload) else { return }
        if let plan = workoutStore.plan, plan.sessionId == update.sessionId {
            // A saved session can be armed again under the same id; a queued
            // update from the earlier arm must not land on this one.
            guard Self.sameArm(update.armedAt, plan.armedAt) else { return }
            workoutStore.applyTargets(
                sessionId: update.sessionId,
                revision: update.revision,
                targets: update.targets,
                completedSetIds: update.completedSetIds,
                phoneRest: update.rest,
                setTimers: ContextPayloadMapper.setTimers(from: payload)
            )
            return
        }
        // Held until its plan starts. Only an update from an arm at or before
        // the session's last stop is dead; a later arm's plan may still be
        // queued behind it.
        if let endedAt = endedAtBySession[update.sessionId],
           pendingPlan?.sessionId != update.sessionId,
           update.armedAt.map({ $0 <= endedAt }) ?? true {
            return
        }
        if let held = pendingSetTargets[update.sessionId], held.revision >= update.revision {
            return
        }
        pendingSetTargets[update.sessionId] = (
            update.revision, update.targets, update.completedSetIds, update.rest,
            update.armedAt, ContextPayloadMapper.setTimers(from: payload)
        )
    }

    /// The phone added, removed or regrouped exercises or sets mid-workout.
    /// Applied to the running plan of the same arm; a start still being held
    /// (HealthKit busy, recovery in flight) takes the newer plan instead.
    /// Anything else, including a later arm or a finished session, is ignored.
    private func handle(workoutPlanUpdate payload: [String: Any]) {
        guard let update = ContextPayloadMapper.workoutPlanUpdate(from: payload) else { return }
        let plan = update.plan
        if let current = workoutStore.plan, current.sessionId == plan.sessionId {
            guard Self.sameArm(plan.armedAt, current.armedAt) else { return }
            workoutStore.updatePlan(plan, revision: update.revision)
            return
        }
        if let held = pendingPlan, held.sessionId == plan.sessionId,
           Self.sameArm(plan.armedAt, held.armedAt),
           update.revision > pendingPlanRevisions[plan.sessionId, default: 0] {
            pendingPlan = plan
            pendingPlanRevisions[plan.sessionId] = update.revision
        }
    }

    /// Whether an update belongs to the plan's arm. Either side missing the
    /// stamp (an older phone) is treated as a match, as before this existed.
    /// ISO strings keep milliseconds, so a small tolerance absorbs rounding.
    private static func sameArm(_ update: Date?, _ plan: Date?) -> Bool {
        guard let update, let plan else { return true }
        return abs(update.timeIntervalSince(plan)) < 0.01
    }

    private func replayIntervalTiming(sessionId: String) {
        let queued = pendingIntervalTiming.filter { $0.sessionId == sessionId }
        pendingIntervalTiming.removeAll { $0.sessionId == sessionId }
        for timing in queued {
            workoutStore.applyIntervalTiming(
                sessionId: timing.sessionId,
                revision: timing.revision,
                pausedAt: timing.pausedAt,
                excludedPauseSeconds: timing.excludedPauseSeconds
            )
        }
    }

    /// The wearer finished the workout on the PHONE. Tears down the same way
    /// `endWorkout` does but sends nothing back — the phone is the one that
    /// told us, and it flushes its own heart-rate buffer when it ends a
    /// session, so echoing `workoutStop` at it would be a second flush of an
    /// already-emptied buffer.
    ///
    /// A stop for a session we are not running does not tear anything down —
    /// a queued stop must not cancel the next workout — but it is remembered,
    /// so a start for that session still in the queue cannot revive it.
    private func handle(workoutStopFromPhone payload: [String: Any]) {
        guard let stop = ContextPayloadMapper.workoutStop(from: payload) else {
            return
        }
        var endedAt = stop.stoppedAt ?? Date()
        if workoutStore.plan?.sessionId == stop.sessionId, let armedAt = workoutStore.plan?.armedAt {
            endedAt = max(endedAt, armedAt)
        }
        if pendingPlan?.sessionId == stop.sessionId, let armedAt = pendingPlan?.armedAt {
            endedAt = max(endedAt, armedAt)
        }
        rememberEnded(stop.sessionId, at: endedAt)
        pendingIntervalTiming.removeAll { $0.sessionId == stop.sessionId }
        if let held = pendingSetTargets[stop.sessionId],
           held.armedAt.map({ $0 <= endedAt }) ?? true {
            pendingSetTargets[stop.sessionId] = nil
        }
        if pendingPlan?.sessionId == stop.sessionId {
            pendingPlan = nil
            return
        }
        guard workoutStore.plan?.sessionId == stop.sessionId else { return }
        // Thrown away on the phone: end the session without writing it to
        // Health and without a summary. Nothing is sent back, the phone
        // already dropped it. A finish already running cannot be taken back.
        if stop.discarded, !collectionInFlight {
            dropRunningWorkout(notifyPhone: false)
            return
        }
        requestFinish(sendStop: false)
    }

    /// Sends one completed set, carrying whatever the wearer typed. Queued
    /// like a check-in — a hole in the diary from a dropped delivery is not an
    /// acceptable loss, unlike a stretch of missing heart rate.
    ///
    /// Returns whether Watch Connectivity accepted the payload. `false` before
    /// the session activates: with `requireDurable` the payload is not parked
    /// in memory, so the caller can keep its own persisted copy and retry.
    @discardableResult
    func sendSetCompleted(
        _ step: WorkoutStep,
        values: SetValues,
        rpe: Double? = nil,
        completedAt: Date = Date(),
        durationSeconds: Int? = nil,
        useCapturedDuration: Bool = false,
        requireDurable: Bool = false
    ) -> Bool {
        guard let sessionId = workoutStore.plan?.sessionId else { return false }
        if requireDurable, !isActivated { return false }
        let completed = CompletedSet(
            clientId: UUID().uuidString,
            sessionId: sessionId,
            setId: step.plannedSet.setId,
            weightKg: values.weightKg,
            reps: values.reps,
            duration: useCapturedDuration
                ? durationSeconds
                : workoutStore.holdLoggedSeconds(for: step.plannedSet.setId),
            distanceKm: step.plannedSet.carry == true ? values.distanceKm : nil,
            rpe: rpe,
            completedAt: completedAt
        )
        transfer(OutboundPayloads.setCompleted(completed))
        return isActivated
    }

    /// Sends a Save or Skip that was stored because the session was not
    /// active yet. No-op until activation, and until the wearer has chosen.
    func retryPendingSetCompletion() {
        guard isActivated,
              let pending = workoutStore.pendingSetCompletion,
              pending.readyToSend,
              let step = workoutStore.steps.first(where: {
                  $0.plannedSet.setId == pending.setId
              })
        else { return }
        let sent = sendSetCompleted(
            step,
            values: pending.values,
            rpe: pending.rpe,
            completedAt: pending.completedAt,
            durationSeconds: pending.durationSeconds,
            useCapturedDuration: true,
            requireDurable: true
        )
        if sent { workoutStore.clearPendingSetCompletion() }
    }

    /// Sends one heart-rate batch for whichever exercise is current right now.
    ///
    /// Queued like a completed set, NOT reachability-gated. A phone in a gym
    /// bag two rooms away is the normal case, not the exception, and dropping
    /// batches whenever it drifts out of range loses exactly the data this
    /// feature exists to capture. The flush interval is a minute
    /// (`WorkoutHealthKitController.batchInterval`) to keep the queue sane.
    ///
    /// Tagged with the exercise on screen, which is right because every
    /// exercise change already sent what came before it
    /// (`onExerciseWillChange`) — whatever is buffered now was measured during
    /// the current exercise.
    private func sendHeartRateBatchForCurrentExercise(
        _ samples: [HeartRateSample],
        durationMinutes: Double? = nil
    ) {
        // After the last set, `currentStep` is nil so the UI can show
        // complete. The final drain still belongs to that last exercise.
        let exerciseEntryId =
            workoutStore.currentStep?.exerciseEntryId
            ?? workoutStore.steps.last?.exerciseEntryId
        guard let exerciseEntryId else { return }
        sendHeartRateBatch(
            samples,
            exerciseEntryId: exerciseEntryId,
            durationMinutes: durationMinutes
        )
    }

    private func sendHeartRateBatch(
        _ samples: [HeartRateSample],
        exerciseEntryId: String,
        durationMinutes: Double? = nil
    ) {
        guard let sessionId = workoutStore.plan?.sessionId else { return }
        // `max(0, ...)` because the running total should only ever climb, but
        // a HealthKit session that restarts mid-workout would reset it, and a
        // negative delta would subtract calories the wearer really burned.
        // Nil until HealthKit has delivered a reading, so a first HR batch
        // does not post a fake measured zero before any energy exists.
        let energyDelta: Double?
        if let cumulative = workoutStore.activeEnergyKcal {
            energyDelta = max(0, cumulative - reportedEnergyKcal)
            reportedEnergyKcal = cumulative
        } else {
            energyDelta = nil
        }
        // The one place that can see both halves of a batch, and so the only
        // place that can tell an empty one from an energy-only one. Callers
        // hand over whatever the buffer held, including nothing.
        guard !samples.isEmpty || (energyDelta ?? 0) > 0 || (durationMinutes ?? 0) > 0 else {
            return
        }
        workoutStore.persistSnapshot(
            reportedEnergyKcal: reportedEnergyKcal,
            heartRateSentThrough: samples.compactMap { instantParser.date(from: $0.t) }.max()
        )
        let batch = HeartRateBatch(
            clientId: UUID().uuidString,
            sessionId: sessionId,
            exerciseEntryId: exerciseEntryId,
            samples: samples,
            activeEnergyKcal: energyDelta,
            durationMinutes: (durationMinutes ?? 0) > 0 ? durationMinutes : nil
        )
        transfer(OutboundPayloads.heartRateBatch(batch))
    }

    /// Ends the workout. The stop signal waits until HealthKit has finished
    /// the workout and the tail has been queued. See `finishCollection`.
    func endWorkout() {
        requestFinish(sendStop: true)
    }

    /// Abandons the workout. Nothing is saved to Health and no heart rate is
    /// sent; the phone is told which session to drop, and clears it without
    /// saving. Ignored while a finish is already running, which has the
    /// session's tail in flight and cannot be taken back.
    func discardWorkout() {
        dropRunningWorkout(notifyPhone: true)
    }

    /// Ends the running workout without saving it. `notifyPhone` is false when
    /// the phone is the one that discarded it.
    private func dropRunningWorkout(notifyPhone: Bool) {
        guard !collectionInFlight, let sessionId = workoutStore.plan?.sessionId else {
            return
        }
        rememberEnded(sessionId, at: workoutStore.plan?.armedAt ?? Date())
        workoutHealthKit.discard()
        if notifyPhone {
            transfer(
                OutboundPayloads.workoutDiscard(
                    sessionId: sessionId,
                    armedAt: workoutStore.plan?.armedAt
                )
            )
        }
        let next = pendingPlan
        pendingPlan = nil
        pendingSendStop = false
        workoutStore.reset()
        if let next {
            beginPlan(next)
        }
    }

    /// A second finish or a plan change while `stop` is already running is
    /// remembered and applied after the first tail is sent. Running it now
    /// would reset the plan, or replace it, before that batch could read the
    /// session id it belongs to.
    private func requestFinish(sendStop: Bool) {
        if collectionInFlight {
            if sendStop {
                pendingSendStop = true
                if var finishing = workoutStore.finishing, !finishing.sendStop {
                    finishing.sendStop = true
                    workoutStore.markFinishing(finishing)
                }
            }
            return
        }
        finishCollection(sendStop: sendStop)
    }

    /// Stops HealthKit, sends the tail and the exercise's wall-clock duration,
    /// then clears local state. `sendStop` is false when the phone already
    /// ended the workout and is only waiting on the watch's last samples.
    ///
    /// What HealthKit had already handed over is queued before anything waits
    /// on the saved workout: `transferUserInfo` survives this process being
    /// suspended or killed, a local buffer does not. The finish is recorded in
    /// the snapshot first, so a relaunch that finds it reads the rest back
    /// from Health (`completeInterruptedFinish`) instead of losing it.
    private func finishCollection(sendStop: Bool) {
        collectionInFlight = true
        let closing = workoutStore.closeCurrentExerciseWindow()
        let stopSessionId = workoutStore.plan?.sessionId
        if let stopSessionId {
            rememberEnded(stopSessionId, at: workoutStore.plan?.armedAt ?? Date())
        }
        if let closing {
            workoutStore.markFinishing(
                WorkoutSessionStore.Finishing(
                    exerciseEntryId: closing.id,
                    minutes: closing.minutes,
                    sendStop: sendStop || pendingSendStop,
                    requestedAt: Date()
                )
            )
        }
        workoutHealthKit.stop(onBuffered: { [weak self] samples in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.workoutStore.recordFinalHeartRate(self.heartRateReadings(samples))
                guard let closing else { return }
                self.sendHeartRateBatch(
                    samples,
                    exerciseEntryId: closing.id,
                    durationMinutes: closing.minutes
                )
            }
        }, onLateTail: { [weak self] samples in
            MainActor.assumeIsolated {
                guard let self, let closing, let stopSessionId else { return }
                self.deliverLateTail(
                    samples,
                    sessionId: stopSessionId,
                    exerciseEntryId: closing.id
                )
            }
        }) { [weak self] samples, timedOut in
            // Synchronous, not a Task: a timed-out finish parks its tail here,
            // and that has to happen before `onLateTail` can run.
            MainActor.assumeIsolated {
                guard let self else { return }
                if let closing {
                    self.sendHeartRateBatch(samples, exerciseEntryId: closing.id)
                    if timedOut, let stopSessionId {
                        self.parkLateTail(sessionId: stopSessionId, exerciseEntryId: closing.id)
                    }
                }
                if (sendStop || self.pendingSendStop), let stopSessionId {
                    self.transfer(
                        OutboundPayloads.workoutStop(
                            WorkoutStopSignal(sessionId: stopSessionId)
                        )
                    )
                }
                let next = self.pendingPlan
                self.pendingPlan = nil
                self.pendingSendStop = false
                self.workoutStore.recordFinalHeartRate(self.heartRateReadings(samples))
                let summary = next == nil ? self.workoutStore.makeSummary() : nil
                self.workoutStore.reset()
                self.workoutStore.recordSummary(summary)
                self.collectionInFlight = false
                if let next {
                    self.beginPlan(next)
                }
            }
        }
    }

    /// Measurement instants of a heart-rate batch, for the summary totals.
    private func heartRateReadings(_ samples: [HeartRateSample]) -> [(at: Date, bpm: Double)] {
        samples.compactMap { sample in
            instantParser.date(from: sample.t).map { (at: $0, bpm: sample.bpm) }
        }
    }
}

// MARK: - WCSessionDelegate

extension WatchSessionManager: WCSessionDelegate {
    nonisolated func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            // First: anything the wearer did before the session was usable.
            self.flushDeferredTransfers()
            // Before asking the phone for anything: whatever it last sent is
            // already available locally, and unlike `requestContext()` this
            // works with the phone nowhere in sight.
            self.adoptReceivedContext()
            self.retryPending()
            self.recoverLiveWorkoutIfNeeded()
            self.retryPendingSetCompletion()
            self.resendQueuedWaterTaps()
            self.resendQueuedWaterDeletes()
            self.requestContext()
        }
    }

    nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
        let reachable = session.isReachable
        Task { @MainActor in
            self.isReachable = reachable
            if reachable {
                self.retryPending()
                self.resendQueuedWaterTaps()
                self.resendQueuedWaterDeletes()
                self.requestContext()
            }
        }
    }

    nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        Task { @MainActor in self.route(message) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveMessage message: [String: Any],
        replyHandler: @escaping ([String: Any]) -> Void
    ) {
        Task { @MainActor in self.route(message) }
        replyHandler([:])
    }

    nonisolated func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        Task { @MainActor in self.route(userInfo) }
    }

    nonisolated func session(
        _ session: WCSession,
        didReceiveApplicationContext applicationContext: [String: Any]
    ) {
        Task { @MainActor in self.route(applicationContext) }
    }
}
