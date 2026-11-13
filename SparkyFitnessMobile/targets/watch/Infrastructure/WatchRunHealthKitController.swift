import CoreLocation
import CoreMotion
import Foundation
import HealthKit

/// A walk or run recorded on the wrist alone, indoors or out.
///
/// A real `HKWorkoutSession`. Indoors (`locationType = .indoor`) the watch
/// estimates distance from its motion sensors; outdoors it uses its own GPS
/// for distance and records the route, which is attached to the workout when
/// it is saved. Heart rate is sampled at workout rate either way.
///
/// When the wearer finishes, the workout (and route) is written to Apple Health
/// and the same run is sent to the phone as a `runFinished` message (queued, so
/// an out-of-range phone gets it later), which files it in the diary as a
/// native SparkyFitness activity with its route and heart rate.
///
/// The Health workout is stamped with `SparkyFitnessSessionId` so the phone's
/// HealthKit import skips it: the message is the only route into the diary,
/// and importing the Health copy too would log the run twice.
///
/// watchOS runs one workout session at a time, so the store only starts this
/// when neither a strength workout nor a phone-GPS recording holds one.
///
/// A run left going when the app is killed is picked back up: a snapshot of
/// its identity, route and readings is kept on disk while it runs, and
/// `recoverIfNeeded` re-attaches the Health session it belongs to. Without a
/// snapshot it never claims a session, so a strength workout's is left alone.
final class WatchRunHealthKitController: NSObject, CLLocationManagerDelegate {
    static let shared = WatchRunHealthKitController()

    /// Called on the main queue when new figures are available.
    var onMetrics: ((WatchRunMetrics) -> Void)?
    /// Called on the main queue when the session ends unexpectedly, with the
    /// run as it stood when it was long enough to keep. The receiver sends it
    /// on and clears the snapshot.
    var onFailure: ((WatchRunResult?) -> Void)?
    /// Called on the main queue when the wearer stops or starts moving
    /// outdoors: `.pause` or `.resume`. Never called indoors, where there is
    /// no speed to judge by.
    var onAutoPause: ((WatchAutoPause.Action) -> Void)?
    /// The accuracy radius (metres) of each GPS fix as it arrives, outdoors only.
    var onGpsAccuracy: ((Double) -> Void)?
    /// The newest GPS fix as it arrives, outdoors only: what a followed route
    /// is matched against. Position, accuracy radius (metres) and when it was taken.
    var onLocation: ((WatchRoutePoint, Double, Date) -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var metrics = WatchRunMetrics()

    // Outdoor only.
    private var locationManager: CLLocationManager?
    private var routeBuilder: HKWorkoutRouteBuilder?
    /// Whether fixes are being added to the route right now: off while paused,
    /// so standing still at a light does not draw a stray tail.
    private var collectingRoute = false
    private var autoPause = WatchAutoPause()
    // Indoor only: step counting stands in for GPS speed.
    private var indoorAutoPause = WatchIndoorAutoPause()
    private var pedometer: CMPedometer?
    private var motionTimer: Timer?
    private var pedometerSteps = 0
    /// True once a recovery restarted the pedometer: its count then covers
    /// only the time since the relaunch, so it is never reported as the run's.
    private var pedometerPartial = false
    /// True once the pedometer has delivered a reading (permission granted).
    private var pedometerLive = false
    private var runKind: WatchRunKind = .run
    /// Whether the last pause was ours, so only that one is ever resumed.
    private var pausedByAutoPause = false

    /// Stamped on the Health workout so the phone's import skips it: the phone
    /// files the run itself from the message sent at the end. One literal here
    /// and one in `healthkit/dataTransformation.ts`; rename both or neither.
    private static let sessionMetadataKey = "SparkyFitnessSessionId"
    private var clientId = UUID().uuidString
    /// The id of the run in progress, shared with the phone's live view.
    var runId: String { clientId }
    private var startedAt = Date()
    private var runPlace: WatchRunPlace = .indoor
    /// An indoor run that has ended but whose Health workout waits for the
    /// treadmill answer. Its session is paused rather than ended until the
    /// workout is saved, so the builder, with every sample and pause event,
    /// survives the app being killed and `recoverIfNeeded` finds it again.
    private struct HeldWorkout {
        let session: HKWorkoutSession
        let builder: HKLiveWorkoutBuilder
        let clientId: String
        let start: Date
        let end: Date
        let elapsed: TimeInterval
        let steps: Int?
        let selfWritten: Bool
        var distanceAdded = false
        var confirmed = false
        var confirmedMeters: Double?
        var finalMeters: Double?
        var scale: Double = 1
        var phoneQueued = false
        /// Writing to Health now; a second `finishHeld` is ignored.
        var finishing = false
        /// The write failed. The session stays for a retry at the next launch,
        /// unless a new run needs it first.
        var failed = false
    }
    private var held: HeldWorkout?
    /// Indoor runs write their own distance. Apple's collection cannot be
    /// lowered once taken, so the treadmill's final figure (the saved
    /// correction, or what the wearer typed) could only ever go up in Health.
    /// With the system's distance collection off, the live figure comes from
    /// the pedometer and `finishHeld` writes one sample for the final figure,
    /// so Health, the phone and the watch all agree.
    private var selfWrittenDistance = false
    private var liveDataSource: HKLiveWorkoutDataSource?
    /// Pedometer distance since the run began, paused stretches left out.
    private var pedometerDistance = 0.0
    private var lastPedometerDistance: Double?
    /// When the last pedometer reading arrived (the end of the span it
    /// covers), kept in the snapshot so a relaunch can fetch what came after.
    private var pedometerReadAt: Date?
    /// While a relaunch is still asking the pedometer for the distance covered
    /// while the app was gone, the snapshot keeps the distance and reading time
    /// it was recovered from, so neither moves ahead of the other: a second
    /// relaunch asks for the same span again, never for less or twice.
    private var pedometerCheckpoint: (meters: Double, at: Date)?
    /// Where the next pedometer reading's span begins, to weigh it against
    /// the workout's pauses.
    private var pedometerSpanStart: Date?
    /// Metres recorded by the pedometer before the system's distance
    /// collection was switched back on (`fallBackToSystemDistance`, or a
    /// relaunch with no pedometer). Health never collected them, so they are
    /// added to what it collects and topped up when the workout is written.
    private var systemDistanceOffset = 0.0
    /// Set when Health did not show the distance a run wrote for itself, so
    /// later runs go back to Apple's collection rather than lose a distance.
    private static let selfWrittenFailedKey = "indoorSelfWrittenDistanceFailed"
    /// What goes to the phone: the accepted route and the heart-rate readings.
    private var routeRows: [[Double]] = []
    private var routeSegment = 0.0
    private var heartRateRows: [[Double]] = []
    /// Epoch ms of each Lap press, oldest first.
    private var lapMarks: [Double] = []
    /// Metres covered when each lap was marked, parallel to `lapMarks`.
    private var lapDistances: [Double] = []
    /// `[active seconds, metres]` rows a few seconds apart, for the pace chart.
    private var distanceSeries: [[Double]] = []
    private static let distanceSeriesInterval: TimeInterval = 10

    var lapCount: Int { lapMarks.count }
    /// The plan this run follows, if any. The store reads it for the live step.
    private(set) var plan: WatchRunPlan?
    /// Where the route tracker stands, kept in the snapshot. The store sets it
    /// after each fix and reads it back after a recovery.
    var routeProgress: WatchRouteTracker.State?
    fileprivate var lastRouteProgressPersistedAt = Date.distantPast
    /// Where the plan's current step began, kept in the snapshot.
    private var planCursor = WatchRunPlan.Cursor.start
    /// Where the plan's current step began, for the voice coach.
    var planCursorValue: WatchRunPlan.Cursor { planCursor }

    /// Moves the plan on to the step the run is in now and says where it
    /// stands. Steps end on the builder's active clock or, for a distance
    /// step, on the distance it has recorded, so a pause holds either.
    func planPosition() -> WatchRunPlan.Position? {
        guard let plan else { return nil }
        let now = elapsed
        let advanced = plan.advance(planCursor, elapsed: now, meters: metrics.distanceMeters)
        if advanced != planCursor {
            planCursor = advanced
            // A distance step's start can't be rebuilt from the clock, so a
            // run killed after a step change must not recover the old cursor.
            persistSnapshot(force: true)
        }
        return plan.position(cursor: planCursor, elapsed: now, meters: metrics.distanceMeters)
    }

    /// Whether every step of the plan has ended by `elapsed` (a distance step
    /// by the distance recorded in it), for `planCompleted`.
    private func planCompleted(at elapsed: TimeInterval) -> Bool {
        guard let plan else { return false }
        return plan.completed(
            cursor: plan.advance(planCursor, elapsed: elapsed, meters: metrics.distanceMeters)
        )
    }
    /// Auto-pause and voice cues for this run, kept in the snapshot so a
    /// relaunch keeps what the wearer chose.
    private(set) var settings = WatchRunSettings(autoPause: true, voiceCues: false)

    /// Changes the run's switches. The movement detectors start over, so
    /// turning auto-pause back on never acts on stillness from before.
    func updateSettings(_ newSettings: WatchRunSettings) {
        guard session != nil else { return }
        settings = newSettings
        autoPause.reset()
        indoorAutoPause.reset()
        persistSnapshot(force: true)
    }

    /// Marks a lap now. A press within 3 s of the last is a double tap and is
    /// ignored; returns whether one was added.
    @discardableResult
    func markLap(force: Bool = false) -> Bool {
        guard session != nil else { return false }
        let now = Date().timeIntervalSince1970 * 1000
        // A plan's step change is a lap whatever the 3 s rule says.
        if !force, let last = lapMarks.last, now - last < 3000 { return false }
        lapMarks.append(now)
        lapDistances.append(metrics.distanceMeters)
        persistSnapshot(force: true)
        return true
    }

    /// Last time the snapshot was written; route fixes arrive about once a
    /// second and rewriting the file each time would be wasteful.
    private var lastPersistedAt = Date.distantPast
    private static let persistInterval: TimeInterval = 15

    var hasLiveSession: Bool { session != nil }

    /// Active time so far, with pauses removed.
    var elapsed: TimeInterval { builder?.elapsedTime ?? 0 }

    private override init() {
        super.init()
    }

    private static let distanceType = HKQuantityType(.distanceWalkingRunning)
    private static let energyType = HKQuantityType(.activeEnergyBurned)
    private static let heartRateType = HKQuantityType(.heartRate)
    private static let stepType = HKQuantityType(.stepCount)

    /// Asks for what a run needs. `success` only means the prompt finished; a
    /// denied share still lets the recording run as a timer, so callers start
    /// regardless.
    func requestAuthorization(completion: @escaping () -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { completion() }
            return
        }
        var share: Set<HKSampleType> = [
            HKObjectType.workoutType(), Self.distanceType, Self.energyType, Self.heartRateType,
            Self.stepType,
        ]
        // The route is only asked for while Health does not report it granted,
        // like the other types; the route builder needs it while the run records.
        let routeType = HKSeriesType.workoutRoute()
        if healthStore.authorizationStatus(for: routeType) != .sharingAuthorized {
            share.insert(routeType)
        }
        let read: Set<HKObjectType> = [
            HKObjectType.workoutType(), Self.distanceType, Self.energyType, Self.heartRateType,
            Self.stepType,
        ]
        healthStore.requestAuthorization(toShare: share, read: read) { _, _ in
            DispatchQueue.main.async { completion() }
        }
    }

    /// The pedometer must be allowed and able to give distance, and an earlier
    /// run must not have found that Health ignores a distance written this way.
    private static var canWriteOwnDistance: Bool {
        pedometerCanMeasureDistance && !UserDefaults.standard.bool(forKey: selfWrittenFailedKey)
    }

    private static var pedometerCanMeasureDistance: Bool {
        CMPedometer.isDistanceAvailable() && CMPedometer.authorizationStatus() == .authorized
    }

    /// Starts the session. Returns false, leaving nothing running, when
    /// HealthKit is unavailable or a session is already live.
    @discardableResult
    func start(
        _ kind: WatchRunKind,
        place: WatchRunPlace,
        plan: WatchRunPlan? = nil,
        settings: WatchRunSettings
    ) -> Bool {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return false }
        if let held {
            // A held workout keeps its session until Health has it. One whose
            // write failed gives way to the new run (watchOS runs one session
            // at a time); one still waiting or being written does not.
            guard held.failed else { return false }
            held.session.end()
            self.held = nil
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = kind.activityType
        configuration.locationType = place.locationType

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let newBuilder = newSession.associatedWorkoutBuilder()
            let dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )
            selfWrittenDistance = place == .indoor && kind.showsDistance && Self.canWriteOwnDistance
            if selfWrittenDistance { dataSource.disableCollection(for: Self.distanceType) }
            liveDataSource = dataSource
            pedometerDistance = 0
            lastPedometerDistance = nil
            pedometerReadAt = nil
            pedometerCheckpoint = nil
            pedometerSpanStart = nil
            systemDistanceOffset = 0
            // So the finish message can carry a step count. Without it the
            // phone only sees steps once Apple Health has synced, which is
            // after the run is already filed.
            dataSource.enableCollection(for: Self.stepType, predicate: nil)
            newBuilder.dataSource = dataSource
            newSession.delegate = self
            newBuilder.delegate = self

            session = newSession
            builder = newBuilder
            metrics = WatchRunMetrics()
            runKind = kind
            runPlace = place
            self.plan = plan
            planCursor = .start
            self.settings = settings
            autoPause.reset()
            indoorAutoPause.reset()
            pausedByAutoPause = false
            clientId = UUID().uuidString
            routeRows = []
            routeSegment = 0
            routeProgress = nil
            heartRateRows = []
            lapMarks = []
            lapDistances = []
            distanceSeries = []

            let now = Date()
            startedAt = now
            newSession.startActivity(with: now)
            let marker = [Self.sessionMetadataKey: clientId]
            newBuilder.beginCollection(withStart: now) { _, _ in
                newBuilder.addMetadata(marker) { _, _ in }
            }
            pedometerPartial = false
            if place == .outdoor { startRoute() } else { startMotion() }
            persistSnapshot(force: true)
            return true
        } catch {
            session = nil
            builder = nil
            return false
        }
    }

    /// `automatic` marks a pause the detector made, the only kind it resumes.
    func pause(automatic: Bool = false) {
        session?.pause()
        collectingRoute = false
        pausedByAutoPause = automatic
        autoPause.reset()
        indoorAutoPause.reset()
        persistSnapshot(force: true)
    }

    func resume() {
        session?.resume()
        collectingRoute = routeBuilder != nil
        pausedByAutoPause = false
        autoPause.reset()
        indoorAutoPause.reset()
        // The jump across a pause is never distance, so the phone is told
        // where a new stretch begins.
        routeSegment += 1
        persistSnapshot(force: true)
    }

    /// Main-queue-only flag shared by the two callers of a run's delivery.
    private final class DeliveryFlag {
        var done = false
    }

    /// How long the summary waits for HealthKit to hand back the saved workout.
    private static let finishWorkoutTimeout: TimeInterval = 10

    /// The workout last saved and the run it belongs to, kept so the wearer
    /// can rate its effort from the summary. A save can finish after the next
    /// run has started, so both this and `pendingEffort` carry the run's id
    /// and a rating only ever goes to its own run. Main queue only.
    private var lastSavedWorkout: (clientId: String, workout: HKWorkout)?

    /// A rating waiting for its run's workout. Main queue only.
    private var pendingEffort: (clientId: String, score: Int)?

    /// Attaches the wearer's 1-10 effort to the run `clientId` (the summary's
    /// run). A rating given before HealthKit returned that run's workout (the
    /// summary can appear on the timeout, and an indoor run's workout waits
    /// for the treadmill answer) is kept and written when the workout arrives.
    func saveEffort(_ score: Int, for runId: String?, completion: @escaping (Bool) -> Void) {
        let runId = runId ?? clientId
        guard let saved = lastSavedWorkout, saved.clientId == runId else {
            pendingEffort = (runId, score)
            completion(true)
            return
        }
        WorkoutEffort.save(score, for: saved.workout, in: healthStore, completion: completion)
    }

    /// A workout for run `runId` is in Health: keep it for the effort rating
    /// and write that run's rating if it came first. Main queue only.
    private func workoutSaved(_ workout: HKWorkout, clientId runId: String) {
        lastSavedWorkout = (runId, workout)
        if let pending = pendingEffort, pending.clientId == runId {
            pendingEffort = nil
            WorkoutEffort.save(pending.score, for: workout, in: healthStore) { _ in }
        }
    }

    /// Ends the session and writes the workout to Apple Health (`save`) or
    /// throws it away. `completion` runs on the main queue with the final
    /// figures and the active time. A saved indoor distance run is held for
    /// the treadmill answer instead (`holdForDistance`, then `finishHeld`).
    func end(save: Bool, completion: @escaping (WatchRunMetrics, TimeInterval, WatchRunResult?) -> Void) {
        guard let session, let endingBuilder = builder else {
            completion(metrics, 0, nil)
            return
        }
        let finalElapsed = endingBuilder.elapsedTime
        let endingRoute = routeBuilder
        let endedAt = Date()
        let endingClientId = clientId
        let rows = (route: routeRows, heartRate: heartRateRows, laps: lapMarks, lapDistances: lapDistances)
        // Taken before the pedometer is stopped. The workout statistic, read
        // after collection ends, replaces it when the builder has one.
        let pedometerStepsAtEnd = indoorPedometerSteps(elapsed: finalElapsed, endedAt: endedAt)
        // A discarded run is gone at once. A saved one keeps its snapshot
        // until the store has queued the message for the phone, so a kill
        // between here and there still leaves the run to be sent on relaunch.
        if !save { WatchRunSnapshotStore.clear() }
        stopRoute()
        // A gap still being fetched from the pedometer is not waited for.
        pedometerCheckpoint = nil
        // An indoor run is asked for the treadmill's distance before it is
        // written, so the workout waits (`finishHeld`) for the answer. A jump
        // rope covers no distance and is never asked.
        if save && runPlace == .indoor && runKind.showsDistance {
            let steps = Self.workoutStepCount(endingBuilder) ?? pedometerStepsAtEnd
            self.session = nil
            self.builder = nil
            holdForDistance(session: session, builder: endingBuilder, endedAt: endedAt, elapsed: finalElapsed, steps: steps)
            let result = makeResult(endedAt: endedAt, elapsed: finalElapsed, rows: rows, steps: steps)
            DispatchQueue.main.async { completion(self.metrics, finalElapsed, result) }
            return
        }
        self.session = nil
        self.builder = nil
        session.end()
        endingBuilder.endCollection(withEnd: endedAt) { [weak self] _, _ in
            // The summary, and its effort picker, wait until the saved
            // HKWorkout is in hand. Rating before that has nothing to relate,
            // and the picker would still report success. Strength already
            // waits; a run used to show the summary from endCollection.
            // Runs once. finishWorkout can hang or be dropped, and the run
            // must still reach the phone, so a timeout calls it too; whichever
            // comes second finds `delivered` set and does nothing. HealthKit's
            // zone totals exist only after finishWorkout, so the timeout path
            // delivers without them.
            let delivered = DeliveryFlag()
            let deliver: ([[String: Any]]) -> Void = { zones in
                DispatchQueue.main.async {
                    guard !delivered.done else { return }
                    delivered.done = true
                    guard let self else {
                        completion(WatchRunMetrics(), finalElapsed, nil)
                        return
                    }
                    guard save else {
                        completion(self.metrics, finalElapsed, nil)
                        return
                    }
                    let steps = Self.workoutStepCount(endingBuilder) ?? pedometerStepsAtEnd
                    var result = self.makeResult(endedAt: endedAt, elapsed: finalElapsed, rows: rows, steps: steps)
                    result.appleZones = zones
                    completion(self.metrics, finalElapsed, result)
                }
            }
            if save {
                endingBuilder.finishWorkout { [weak self] workout, _ in
                    let zones = workout.map { AppleWorkoutZones.heartRateZones(of: $0) } ?? []
                    DispatchQueue.main.async {
                        if let workout { self?.workoutSaved(workout, clientId: endingClientId) }
                        // The route can only be attached to a saved workout.
                        if let workout, let endingRoute {
                            endingRoute.finishRoute(with: workout, metadata: nil) { _, _ in }
                        }
                        deliver(zones)
                    }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + Self.finishWorkoutTimeout) {
                    deliver([])
                }
            } else {
                endingBuilder.discardWorkout()
                endingRoute?.discard()
                deliver([])
            }
        }
    }

    private typealias ResultRows = (route: [[Double]], heartRate: [[Double]], laps: [Double], lapDistances: [Double])

    /// The finished run as it goes to the phone. Main queue.
    private func makeResult(endedAt: Date, elapsed: TimeInterval, rows: ResultRows, steps: Int?) -> WatchRunResult {
        WatchRunResult(
            clientId: clientId,
            kind: runKind,
            place: runPlace,
            startedAt: startedAt,
            endedAt: endedAt,
            activeSeconds: elapsed,
            metrics: metrics,
            route: rows.route,
            heartRate: rows.heartRate,
            laps: rows.laps,
            lapDistances: rows.lapDistances,
            distanceSeries: distanceSeries,
            plan: plan,
            planCompleted: planCompleted(at: elapsed),
            steps: steps
        )
    }

    /// Pauses the ended indoor run's session and keeps it, with its builder,
    /// for `finishHeld`. Nothing more is collected while the wearer answers, so
    /// the workout ends where the run did. The snapshot records the hold, so a
    /// relaunch picks the paused session up again rather than losing it.
    private func holdForDistance(
        session: HKWorkoutSession,
        builder: HKLiveWorkoutBuilder,
        endedAt: Date,
        elapsed: TimeInterval,
        steps: Int?
    ) {
        if session.state == .running { session.pause() }
        for type in [Self.distanceType, Self.energyType, Self.heartRateType, Self.stepType] {
            liveDataSource?.disableCollection(for: type)
        }
        builder.delegate = nil
        held = HeldWorkout(
            session: session,
            builder: builder,
            clientId: clientId,
            start: startedAt,
            end: endedAt,
            elapsed: elapsed,
            steps: steps,
            selfWritten: selfWrittenDistance
        )
        persistSnapshot(force: true)
    }

    /// Whether a held workout keeps its session, so no new run can start.
    /// One whose write failed gives way (`start`).
    var holdsWorkoutSession: Bool { held.map { !$0.failed } ?? false }

    /// Writes the held indoor workout once the treadmill question is answered.
    /// `answer` is what the machine showed (nil keeps the watch's figure),
    /// `finalDistanceMeters` the run's settled distance and `scale` the indoor
    /// factor it used; all three go into the snapshot before anything is
    /// written, so a kill from here on still sends the same settled run and
    /// writes the same distance.
    ///
    /// With the system's distance collection on, HealthKit cannot lower what
    /// it collected, so a larger final figure is topped up with a sample for
    /// the difference and a smaller one leaves the measured distance. A run
    /// that writes its own distance has none collected, so its one sample is
    /// the final figure, up or down.
    ///
    /// `completion` runs once on the main queue: with the outcome when Health
    /// answers, or after `finishWorkoutTimeout` with nothing saved yet, so the
    /// run is never kept from the phone.
    func finishHeld(
        answer: Double?,
        finalDistanceMeters: Double,
        scale: Double,
        completion: @escaping (WatchRunHealthOutcome) -> Void
    ) {
        guard var current = held, !current.finishing else {
            DispatchQueue.main.async { completion(.notSaved) }
            return
        }
        current.confirmed = true
        current.confirmedMeters = answer
        current.finalMeters = finalDistanceMeters
        current.scale = scale
        held = current
        persistSnapshot(force: true)
        let delivered = DeliveryFlag()
        let report: (WatchRunHealthOutcome) -> Void = { outcome in
            DispatchQueue.main.async {
                guard !delivered.done else { return }
                delivered.done = true
                completion(outcome)
            }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.finishWorkoutTimeout) {
            report(.notSaved)
        }
        writeHeld(giveUpOnFailure: false, report: report)
    }

    /// The run `clientId` is durably queued for the phone. Its snapshot goes
    /// once Health has the workout too; until then it keeps the held run.
    func messageQueued(clientId runId: String) {
        if var current = held, current.clientId == runId {
            current.phoneQueued = true
            held = current
            persistSnapshot(force: true)
        } else if WatchRunSnapshotStore.load()?.clientId == runId {
            WatchRunSnapshotStore.clear()
        }
    }

    /// Adds the distance, ends collection where the run ended and finishes
    /// the workout, then ends the paused session. Each step is tried a few
    /// times. A workout HealthKit refuses keeps its session for a retry at the
    /// next launch (`giveUpOnFailure` false); a retry that fails again ends it.
    /// Main queue.
    private func writeHeld(giveUpOnFailure: Bool, report: @escaping (WatchRunHealthOutcome) -> Void) {
        guard var current = held, let meters = current.finalMeters else {
            report(.notSaved)
            return
        }
        current.finishing = true
        current.failed = false
        held = current
        let runId = current.clientId
        let builder = current.builder
        let sample: HKQuantitySample?
        if current.distanceAdded {
            sample = nil
        } else if current.selfWritten {
            sample = meters >= 1 ? Self.distanceSample(meters, start: current.start, end: current.end) : nil
        } else {
            let collected = builder.statistics(for: Self.distanceType)?
                .sumQuantity()?.doubleValue(for: .meter()) ?? 0
            let missing = meters - collected
            sample = missing >= 1 ? Self.distanceSample(missing, start: current.start, end: current.end) : nil
        }
        let endAt = current.end
        let finish: (Bool) -> Void = { added in
            DispatchQueue.main.async {
                if added, sample != nil, var updated = self.held, updated.clientId == runId {
                    updated.distanceAdded = true
                    self.held = updated
                    self.persistSnapshot(force: true)
                }
                // A collection already ended before a relaunch reports an
                // error here; the workout is finished either way.
                builder.endCollection(withEnd: endAt) { _, _ in
                    self.finishHeldWorkout(builder) { outcome in
                        DispatchQueue.main.async {
                            self.heldWritten(
                                outcome,
                                runId: runId,
                                sample: sample,
                                added: added,
                                giveUpOnFailure: giveUpOnFailure,
                                report: report
                            )
                        }
                    }
                }
            }
        }
        if let sample {
            addDistance(sample, to: builder, completion: finish)
        } else {
            finish(false)
        }
    }

    /// What became of a held workout's `finishWorkout`. Main queue.
    private func heldWritten(
        _ outcome: HeldFinish,
        runId: String,
        sample: HKQuantitySample?,
        added: Bool,
        giveUpOnFailure: Bool,
        report: (WatchRunHealthOutcome) -> Void
    ) {
        guard var current = held, current.clientId == runId else { return }
        guard case .saved(let workout) = outcome else {
            if giveUpOnFailure {
                current.session.end()
                held = nil
                releaseSnapshot(of: runId, phoneQueued: current.phoneQueued)
            } else {
                current.finishing = false
                current.failed = true
                held = current
                persistSnapshot(force: true)
            }
            report(.notSaved)
            return
        }
        current.session.end()
        held = nil
        let inWorkout = current.distanceAdded || added
        if let sample, !added {
            // The workout is kept (time, heart rate, energy); the distance
            // still reaches Health's daily totals on its own.
            saveLooseDistance(sample)
        }
        var matched = sample == nil || inWorkout
        if current.selfWritten {
            if sample != nil, !inWorkout {
                // Health would not take the only distance this run has:
                // later runs go back to Apple's collection.
                UserDefaults.standard.set(true, forKey: Self.selfWrittenFailedKey)
            } else if let workout, let meters = current.finalMeters, meters >= 1 {
                matched = Self.verifyWrittenDistance(meters, in: workout)
            }
        }
        if let workout { workoutSaved(workout, clientId: runId) }
        releaseSnapshot(of: runId, phoneQueued: current.phoneQueued)
        report(WatchRunHealthOutcome(
            workoutSaved: true,
            distanceMatched: matched,
            zones: workout.map { AppleWorkoutZones.heartRateZones(of: $0) } ?? []
        ))
    }

    /// Health is done with run `runId`: its snapshot goes if the phone has the
    /// run too, else it stays (without the held session) for the phone.
    private func releaseSnapshot(of runId: String, phoneQueued: Bool) {
        guard phoneQueued, WatchRunSnapshotStore.load()?.clientId == runId else { return }
        WatchRunSnapshotStore.clear()
    }

    /// How `finishWorkout` came back. HealthKit answers a save made while the
    /// watch is locked with no workout and no error: the workout is in Health
    /// but cannot be read yet, so it counts as saved, never as a failure that
    /// would write it again.
    private enum HeldFinish {
        case saved(HKWorkout?)
        case failed
    }

    /// `finishWorkout`, tried again a couple of times on an error.
    private func finishHeldWorkout(
        _ builder: HKLiveWorkoutBuilder,
        attempt: Int = 1,
        completion: @escaping (HeldFinish) -> Void
    ) {
        builder.finishWorkout { [weak self] workout, error in
            if workout != nil || error == nil {
                completion(.saved(workout))
                return
            }
            guard attempt < Self.healthWriteAttempts, let self else {
                completion(.failed)
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt)) {
                self.finishHeldWorkout(builder, attempt: attempt + 1, completion: completion)
            }
        }
    }

    private static func distanceSample(_ meters: Double, start: Date, end: Date) -> HKQuantitySample {
        HKQuantitySample(
            type: distanceType,
            quantity: HKQuantity(unit: .meter(), doubleValue: meters),
            start: start,
            end: end
        )
    }

    /// Adds `sample` to the held builder, trying again a couple of times
    /// before giving up, since the workout cannot take it once finished.
    private func addDistance(
        _ sample: HKQuantitySample,
        to builder: HKLiveWorkoutBuilder,
        attempt: Int = 1,
        completion: @escaping (Bool) -> Void
    ) {
        builder.add([sample]) { [weak self] success, _ in
            guard !success, attempt < Self.healthWriteAttempts, let self else {
                completion(success)
                return
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + Double(attempt)) {
                self.addDistance(sample, to: builder, attempt: attempt + 1, completion: completion)
            }
        }
    }

    private static let healthWriteAttempts = 3

    /// A distance the workout would not take, saved on its own so Health's
    /// daily distance still counts it.
    private func saveLooseDistance(_ sample: HKQuantitySample) {
        healthStore.save(sample) { _, _ in }
    }

    /// Returns whether Health holds the figure written.
    @discardableResult
    private static func verifyWrittenDistance(_ meters: Double, in workout: HKWorkout) -> Bool {
        let saved = workout.statistics(for: distanceType)?
            .sumQuantity()?.doubleValue(for: .meter())
            ?? workout.totalDistance?.doubleValue(for: .meter())
            ?? 0
        let tolerance = max(10, meters * 0.02)
        guard abs(saved - meters) <= tolerance else {
            UserDefaults.standard.set(true, forKey: selfWrittenFailedKey)
            return false
        }
        return true
    }

}

/// What `finishHeld` reports about the held indoor workout.
struct WatchRunHealthOutcome {
    /// A workout for the run is in Apple Health.
    var workoutSaved: Bool
    /// Health holds the final distance for it (the workout's own sample or top-up).
    var distanceMatched: Bool
    /// The workout's heart-rate zone totals, for the phone. Empty when unsaved.
    var zones: [[String: Any]]

    static let notSaved = WatchRunHealthOutcome(workoutSaved: false, distanceMatched: false, zones: [])
}

// MARK: - Recovery

/// A run picked up again after the app was killed.
struct WatchRunRecovery {
    let kind: WatchRunKind
    let place: WatchRunPlace
    let paused: Bool
    let autoPaused: Bool
    let metrics: WatchRunMetrics
    let lapCount: Int
    /// Active seconds when the snapshot was written; a floor for the clock
    /// while the recovered builder has not started reporting its own.
    let elapsed: TimeInterval
}

/// What `recoverIfNeeded` found.
enum WatchRunRecoveryOutcome {
    /// Nothing of ours was left going.
    case none
    /// The Health session is back and the run carries on.
    case resumed(WatchRunRecovery)
    /// The Health session was gone but the run's own record was not: it is
    /// sent to the phone as it stood, so the effort is not lost.
    case salvaged(WatchRunResult)
    /// An indoor run had ended and its paused session was waiting for the
    /// treadmill answer: ask again. The result is as measured, unscaled, with
    /// its active seconds.
    case awaitingDistance(WatchRunResult, elapsed: TimeInterval)
    /// An indoor run had been answered: the same settled run is rebuilt from
    /// the measured one, the answer and the factor it used, and sent unless it
    /// already was (`queued`). Health's write is retried if its session is back.
    case answeredHeld(WatchRunResult, answer: Double?, scale: Double, queued: Bool)
}

extension WatchRunHealthKitController {
    /// Writes the snapshot after the store has published new route progress.
    /// The controller's own write for the same fix can run first (the store
    /// handles the fix on a later task), so this has its own throttle; `force`
    /// is for a paused fix, which no other write follows.
    func persistRouteProgress(force: Bool = false) {
        let now = Date()
        guard force || now.timeIntervalSince(lastRouteProgressPersistedAt) >= Self.persistInterval else { return }
        lastRouteProgressPersistedAt = now
        persistSnapshot(force: true)
    }

    fileprivate func persistSnapshot(force: Bool = false) {
        guard session != nil || held != nil else { return }
        let now = Date()
        guard force || now.timeIntervalSince(lastPersistedAt) >= Self.persistInterval else { return }
        lastPersistedAt = now
        WatchRunSnapshotStore.save(WatchRunSnapshot(
            clientId: clientId,
            kind: runKind.rawValue,
            place: runPlace.rawValue,
            startedAt: startedAt,
            routeSegment: routeSegment,
            pausedByAutoPause: pausedByAutoPause,
            routeRows: routeRows,
            heartRateRows: heartRateRows,
            distanceMeters: pedometerCheckpoint?.meters ?? metrics.distanceMeters,
            activeEnergyKcal: metrics.activeEnergyKcal,
            elapsed: builder?.elapsedTime ?? held?.elapsed ?? 0,
            savedAt: now,
            lapMarks: lapMarks,
            lapDistances: lapDistances,
            distanceSeries: distanceSeries,
            plan: plan,
            planCursor: plan == nil ? nil : planCursor,
            settings: settings,
            routeProgress: routeProgress,
            selfWrittenDistance: selfWrittenDistance,
            systemDistanceOffset: systemDistanceOffset,
            pedometerReadAt: pedometerCheckpoint?.at ?? pedometerReadAt,
            heldEndedAt: held?.end,
            heldElapsed: held?.elapsed,
            heldSteps: held?.steps,
            heldDistanceAdded: held?.distanceAdded,
            distanceConfirmed: held?.confirmed,
            confirmedMeters: held?.confirmedMeters,
            finalDistanceMeters: held?.finalMeters,
            heldScale: held?.scale,
            phoneQueued: held?.phoneQueued
        ))
    }

    /// Re-attaches the run left going when the app was killed, if there is
    /// one. Only a run with a snapshot is claimed, and only when the Health
    /// session found is the same kind of activity, so a strength workout's
    /// session is never taken by mistake. Completion is on the main queue.
    func recoverIfNeeded(completion: @escaping (WatchRunRecoveryOutcome) -> Void) {
        guard session == nil, held == nil, let snapshot = WatchRunSnapshotStore.load(),
              let kind = WatchRunKind(rawValue: snapshot.kind),
              let place = WatchRunPlace(rawValue: snapshot.place)
        else {
            DispatchQueue.main.async { completion(.none) }
            return
        }
        guard Date().timeIntervalSince(snapshot.savedAt) < WatchRunSnapshot.maxAge,
              HKHealthStore.isHealthDataAvailable()
        else {
            WatchRunSnapshotStore.clear()
            DispatchQueue.main.async { completion(.none) }
            return
        }
        healthStore.recoverActiveWorkoutSession { [weak self] recovered, error in
            DispatchQueue.main.async {
                guard let self else { completion(.none); return }
                guard let recovered, error == nil,
                      recovered.workoutConfiguration.activityType == kind.activityType,
                      recovered.state == .running || recovered.state == .paused
                else {
                    completion(self.salvage(snapshot, kind: kind, place: place))
                    return
                }
                if let endedAt = snapshot.heldEndedAt {
                    completion(self.recoverHeld(recovered, snapshot: snapshot, kind: kind, place: place, endedAt: endedAt))
                    return
                }
                let recoveredBuilder = recovered.associatedWorkoutBuilder()
                recovered.delegate = self
                recoveredBuilder.delegate = self
                let dataSource = HKLiveWorkoutDataSource(
                    healthStore: self.healthStore,
                    workoutConfiguration: recovered.workoutConfiguration
                )
                // A run that wrote its own distance keeps doing so: the system's
                // collection stays off and the pedometer carries on from the
                // recorded figure, so Health never replaces it and the final
                // treadmill figure can still be lower. With the pedometer gone,
                // the system collects again on top of what was recorded.
                self.pedometerDistance = 0
                self.lastPedometerDistance = nil
                self.pedometerReadAt = nil
                self.systemDistanceOffset = snapshot.systemDistanceOffset ?? 0
                self.selfWrittenDistance = false
                if place == .indoor, snapshot.selfWrittenDistance == true {
                    if Self.pedometerCanMeasureDistance {
                        self.selfWrittenDistance = true
                        dataSource.disableCollection(for: Self.distanceType)
                        self.pedometerDistance = snapshot.distanceMeters
                    } else {
                        self.systemDistanceOffset = snapshot.distanceMeters
                    }
                }
                dataSource.enableCollection(for: Self.stepType, predicate: nil)
                self.liveDataSource = dataSource
                recoveredBuilder.dataSource = dataSource
                self.session = recovered
                self.builder = recoveredBuilder
                self.clientId = snapshot.clientId
                self.startedAt = snapshot.startedAt
                self.runKind = kind
                self.runPlace = place
                self.routeRows = snapshot.routeRows
                self.heartRateRows = snapshot.heartRateRows
                let laps = Self.pairedLaps(snapshot.lapMarks, snapshot.lapDistances)
                self.lapMarks = laps.marks
                self.lapDistances = laps.distances
                self.distanceSeries = snapshot.distanceSeries ?? []
                self.plan = snapshot.plan
                // An older snapshot has no cursor; its plan was timed, so the
                // clock alone places it again.
                self.routeProgress = snapshot.routeProgress
                self.planCursor = snapshot.planCursor
                    ?? snapshot.plan?.advance(.start, elapsed: snapshot.elapsed, meters: 0)
                    ?? .start
                // A snapshot from before the switches existed: what runs had then.
                self.settings = snapshot.settings
                    ?? WatchRunSettings(autoPause: true, voiceCues: false)
                // The jump across the gap while the app was gone is never distance.
                self.routeSegment = snapshot.routeSegment + 1
                self.autoPause.reset()
                self.indoorAutoPause.reset()
                let paused = recovered.state == .paused
                self.pausedByAutoPause = paused && snapshot.pausedByAutoPause
                var current = WatchRunMetrics()
                if self.selfWrittenDistance {
                    current.distanceMeters = snapshot.distanceMeters
                } else {
                    let offset = self.systemDistanceOffset
                    let collected = recoveredBuilder.statistics(for: Self.distanceType)?
                        .sumQuantity()?.doubleValue(for: .meter())
                    current.distanceMeters = collected.map { $0 + offset } ?? snapshot.distanceMeters
                }
                current.activeEnergyKcal = recoveredBuilder.statistics(for: Self.energyType)?
                    .sumQuantity()?.doubleValue(for: .kilocalorie()) ?? snapshot.activeEnergyKcal
                self.metrics = current
                if place == .outdoor {
                    // A route builder cannot be re-attached, so the route in
                    // Health restarts here; the phone still gets every fix.
                    self.startRoute()
                    self.collectingRoute = !paused
                } else {
                    let resumedAt = Date()
                    self.startMotion(from: resumedAt)
                    if self.selfWrittenDistance, let lastRead = snapshot.pedometerReadAt {
                        self.pedometerReadAt = lastRead
                        self.recoverPedometerGap(
                            from: lastRead,
                            to: resumedAt,
                            events: recoveredBuilder.workoutEvents,
                            clientId: snapshot.clientId
                        )
                    }
                }
                // The pedometer restarted at zero above; its count is partial.
                self.pedometerPartial = true
                self.persistSnapshot(force: true)
                completion(.resumed(WatchRunRecovery(
                    kind: kind,
                    place: place,
                    paused: paused,
                    autoPaused: self.pausedByAutoPause,
                    metrics: current,
                    lapCount: self.lapMarks.count,
                    elapsed: snapshot.elapsed
                )))
            }
        }
    }

    /// Takes back the paused session of an indoor run that ended while it
    /// waited for the treadmill answer. Nothing more is collected for it. An
    /// answered run's write is retried now; a retry that fails ends the
    /// session, so a refusing Health cannot hold the watch's one session.
    private func recoverHeld(
        _ recovered: HKWorkoutSession,
        snapshot: WatchRunSnapshot,
        kind: WatchRunKind,
        place: WatchRunPlace,
        endedAt: Date
    ) -> WatchRunRecoveryOutcome {
        let recoveredBuilder = recovered.associatedWorkoutBuilder()
        recovered.delegate = self
        if recovered.state == .running { recovered.pause() }
        clientId = snapshot.clientId
        startedAt = snapshot.startedAt
        runKind = kind
        runPlace = place
        routeRows = snapshot.routeRows
        heartRateRows = snapshot.heartRateRows
        let laps = Self.pairedLaps(snapshot.lapMarks, snapshot.lapDistances)
        lapMarks = laps.marks
        lapDistances = laps.distances
        distanceSeries = snapshot.distanceSeries ?? []
        plan = snapshot.plan
        planCursor = snapshot.planCursor ?? .start
        settings = snapshot.settings ?? WatchRunSettings(autoPause: true, voiceCues: false)
        selfWrittenDistance = snapshot.selfWrittenDistance ?? false
        systemDistanceOffset = snapshot.systemDistanceOffset ?? 0
        pedometerReadAt = snapshot.pedometerReadAt
        pedometerCheckpoint = nil
        var restored = WatchRunMetrics()
        restored.distanceMeters = snapshot.distanceMeters
        restored.activeEnergyKcal = snapshot.activeEnergyKcal
        metrics = restored
        let elapsed = snapshot.heldElapsed ?? snapshot.elapsed
        var restoredHeld = HeldWorkout(
            session: recovered,
            builder: recoveredBuilder,
            clientId: snapshot.clientId,
            start: snapshot.startedAt,
            end: endedAt,
            elapsed: elapsed,
            steps: snapshot.heldSteps,
            selfWritten: selfWrittenDistance
        )
        restoredHeld.distanceAdded = snapshot.heldDistanceAdded ?? false
        restoredHeld.confirmed = snapshot.distanceConfirmed ?? false
        restoredHeld.confirmedMeters = snapshot.confirmedMeters
        restoredHeld.finalMeters = snapshot.finalDistanceMeters
        restoredHeld.scale = snapshot.heldScale ?? 1
        restoredHeld.phoneQueued = snapshot.phoneQueued ?? false
        held = restoredHeld
        let result = Self.heldResult(snapshot, kind: kind, place: place, endedAt: endedAt)
        guard restoredHeld.confirmed else {
            return .awaitingDistance(result, elapsed: elapsed)
        }
        writeHeld(giveUpOnFailure: true) { _ in }
        return .answeredHeld(
            result,
            answer: restoredHeld.confirmedMeters,
            scale: restoredHeld.scale,
            queued: restoredHeld.phoneQueued
        )
    }

    /// A held run as measured (unscaled), from its snapshot.
    private static func heldResult(
        _ snapshot: WatchRunSnapshot,
        kind: WatchRunKind,
        place: WatchRunPlace,
        endedAt: Date
    ) -> WatchRunResult {
        let elapsed = snapshot.heldElapsed ?? snapshot.elapsed
        var measured = WatchRunMetrics()
        measured.distanceMeters = snapshot.distanceMeters
        measured.activeEnergyKcal = snapshot.activeEnergyKcal
        let laps = pairedLaps(snapshot.lapMarks, snapshot.lapDistances)
        return WatchRunResult(
            clientId: snapshot.clientId,
            kind: kind,
            place: place,
            startedAt: snapshot.startedAt,
            endedAt: endedAt,
            activeSeconds: elapsed,
            metrics: measured,
            route: snapshot.routeRows,
            heartRate: snapshot.heartRateRows,
            laps: laps.marks,
            lapDistances: laps.distances,
            distanceSeries: snapshot.distanceSeries ?? [],
            plan: snapshot.plan,
            planCompleted: snapshot.plan.map { plan in
                plan.completed(
                    cursor: plan.advance(
                        snapshot.planCursor ?? .start,
                        elapsed: elapsed,
                        meters: snapshot.distanceMeters
                    )
                )
            } ?? false,
            steps: snapshot.heldSteps
        )
    }

    /// The lap marks and their distances, kept the same length. A snapshot from
    /// a build that wrote marks without distances is padded, so a lap marked
    /// after the relaunch still lines up with its own distance.
    private static func pairedLaps(
        _ marks: [Double]?,
        _ distances: [Double]?
    ) -> (marks: [Double], distances: [Double]) {
        let marks = marks ?? []
        var distances = Array((distances ?? []).prefix(marks.count))
        while distances.count < marks.count { distances.append(distances.last ?? 0) }
        return (marks, distances)
    }

    /// The run as the snapshot last had it, for when the Health session did
    /// not survive. A record shorter than a minute is dropped.
    private func salvage(
        _ snapshot: WatchRunSnapshot,
        kind: WatchRunKind,
        place: WatchRunPlace
    ) -> WatchRunRecoveryOutcome {
        if let endedAt = snapshot.heldEndedAt {
            // The run had ended and waited for the treadmill answer, but its
            // session is gone, so Health's workout is lost. The phone still
            // gets the run, settled if it was answered.
            let result = Self.heldResult(snapshot, kind: kind, place: place, endedAt: endedAt)
            guard snapshot.distanceConfirmed == true else { return .salvaged(result) }
            guard snapshot.phoneQueued != true else {
                WatchRunSnapshotStore.clear()
                return .none
            }
            return .answeredHeld(
                result,
                answer: snapshot.confirmedMeters,
                scale: snapshot.heldScale ?? 1,
                queued: false
            )
        }
        // Kept until the store has queued the run for the phone.
        guard snapshot.elapsed >= WatchRunSnapshot.minimumKeptSeconds else {
            WatchRunSnapshotStore.clear()
            return .none
        }
        var salvaged = WatchRunMetrics()
        salvaged.distanceMeters = snapshot.distanceMeters
        salvaged.activeEnergyKcal = snapshot.activeEnergyKcal
        return .salvaged(WatchRunResult(
            clientId: snapshot.clientId,
            kind: kind,
            place: place,
            startedAt: snapshot.startedAt,
            endedAt: snapshot.savedAt,
            activeSeconds: snapshot.elapsed,
            metrics: salvaged,
            route: snapshot.routeRows,
            heartRate: snapshot.heartRateRows,
            laps: Self.pairedLaps(snapshot.lapMarks, snapshot.lapDistances).marks,
            lapDistances: Self.pairedLaps(snapshot.lapMarks, snapshot.lapDistances).distances,
            distanceSeries: snapshot.distanceSeries ?? [],
            plan: snapshot.plan,
            planCompleted: snapshot.plan.map { plan in
                plan.completed(
                    cursor: plan.advance(
                        snapshot.planCursor ?? .start,
                        elapsed: snapshot.elapsed,
                        meters: snapshot.distanceMeters
                    )
                )
            } ?? false
        ))
    }
}

// MARK: - Auto-pause (indoor)

extension WatchRunHealthKitController {
    /// Pedometer steps over the moving time. The counter keeps running through
    /// a pause, so the paused share is taken off. Nil outdoors, or when it
    /// never reported. The workout statistic is preferred when it has a count.
    private func indoorPedometerSteps(elapsed: TimeInterval, endedAt: Date) -> Int? {
        guard runPlace == .indoor, !pedometerPartial, pedometerSteps > 0 else { return nil }
        let wall = endedAt.timeIntervalSince(startedAt)
        guard wall > 0, elapsed > 0 else { return pedometerSteps }
        let share = min(1, elapsed / wall)
        let steps = Int((Double(pedometerSteps) * share).rounded())
        return steps > 0 ? steps : nil
    }

    /// Steps the workout builder collected, pauses already left out.
    fileprivate static func workoutStepCount(_ builder: HKLiveWorkoutBuilder) -> Int? {
        guard let quantity = builder.statistics(for: stepType)?.sumQuantity() else { return nil }
        let steps = Int(quantity.doubleValue(for: .count()).rounded())
        return steps > 0 ? steps : nil
    }

    /// Counts steps with the pedometer and judges them once a second. The
    /// pedometer keeps reporting while the workout session is paused, which is
    /// what lets a treadmill run resume itself. Without motion permission or a
    /// step counter nothing happens: the wearer pauses by hand.
    fileprivate func startMotion(from start: Date = Date()) {
        stopMotion()
        guard CMPedometer.isStepCountingAvailable() else { return }
        // Denied (or restricted) motion access reports nothing, and "no steps"
        // would read as "standing still": do not pause on silence.
        switch CMPedometer.authorizationStatus() {
        case .denied, .restricted: return
        default: break
        }
        let counter = CMPedometer()
        pedometer = counter
        pedometerSteps = 0
        pedometerLive = false
        pedometerSpanStart = start
        counter.startUpdates(from: start) { [weak self, weak counter] data, error in
            DispatchQueue.main.async {
                // A restart replaces the counter; a late callback from the old
                // one must not tear down the new one or feed it its steps.
                guard let self, let counter, self.pedometer === counter else { return }
                // A failure (permission refused at the prompt, sensor trouble)
                // switches the detector off rather than leaving it to guess.
                if error != nil {
                    self.stopMotion()
                    self.fallBackToSystemDistance()
                    return
                }
                if self.selfWrittenDistance, let data, let total = data.distance?.doubleValue {
                    self.addPedometerDistance(total, readAt: data.endDate)
                }
                guard let steps = data?.numberOfSteps.intValue else { return }
                self.pedometerSteps = steps
                self.pedometerLive = true
            }
        }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            self?.judgeSteps()
        }
        RunLoop.main.add(timer, forMode: .common)
        motionTimer = timer
    }

    /// Adds what the pedometer measured since its last reading, less the
    /// share of it that fell in a pause. Readings arrive late and in batches,
    /// so one can straddle a pause or resume: the session's state when it
    /// arrives says nothing about when the distance was covered. Its span is
    /// weighed against the workout's pause and resume events instead, the
    /// distance taken as spread evenly over the span.
    private func addPedometerDistance(_ total: Double, readAt: Date) {
        let delta = total - (lastPedometerDistance ?? 0)
        lastPedometerDistance = total
        let spanStart = pedometerSpanStart ?? readAt
        pedometerSpanStart = readAt
        // Counted or left out, the distance up to here is settled.
        pedometerReadAt = readAt
        guard delta > 0, session != nil, let builder else { return }
        let span = readAt.timeIntervalSince(spanStart)
        let running: Double
        if span > 0 {
            let moving = Self.runningStretches(from: spanStart, to: readAt, events: builder.workoutEvents)
                .reduce(0) { $0 + $1.duration }
            running = min(1, moving / span)
        } else {
            running = session?.state == .running ? 1 : 0
        }
        guard running > 0 else { return }
        pedometerDistance += delta * running
        var updated = metrics
        updated.distanceMeters = pedometerDistance
        metrics = updated
        let activeElapsed = builder?.elapsedTime ?? 0
        if activeElapsed - (distanceSeries.last?.first ?? -Self.distanceSeriesInterval) >= Self.distanceSeriesInterval {
            distanceSeries.append([activeElapsed.rounded(), pedometerDistance])
        }
        // Health holds none of this distance, so the snapshot is what a
        // relaunch picks it up from.
        persistSnapshot()
        onMetrics?(updated)
    }

    /// Adds the distance covered between the snapshot's last pedometer reading
    /// and the relaunch, which the restarted pedometer does not report and
    /// Health never collected. The pedometer keeps its own history, so it is
    /// asked for each stretch the session was running in that gap; paused
    /// stretches (from the workout's pause and resume events) are left out.
    private func recoverPedometerGap(
        from start: Date,
        to end: Date,
        events: [HKWorkoutEvent],
        clientId: String
    ) {
        let stretches = Self.runningStretches(from: start, to: end, events: events)
        guard !stretches.isEmpty, CMPedometer.isDistanceAvailable() else { return }
        // Until the answers are in, the snapshot keeps the figure and reading
        // time it was recovered from, so the two never disagree.
        pedometerCheckpoint = (metrics.distanceMeters, start)
        let query = CMPedometer()
        let group = DispatchGroup()
        var gap = 0.0
        for stretch in stretches {
            group.enter()
            query.queryPedometerData(from: stretch.start, to: stretch.end) { data, _ in
                DispatchQueue.main.async {
                    gap += data?.distance?.doubleValue ?? 0
                    group.leave()
                }
            }
        }
        group.notify(queue: .main) { [weak self] in
            // Keeps the query's pedometer alive until every answer is in.
            _ = query
            guard let self, self.session != nil, self.clientId == clientId else { return }
            // The gap and the live readings since the relaunch are now both in
            // the figure, and the reading time is the live one: written together.
            self.pedometerCheckpoint = nil
            if gap > 0, self.selfWrittenDistance {
                self.pedometerDistance += gap
                var updated = self.metrics
                updated.distanceMeters = self.pedometerDistance
                self.metrics = updated
                self.onMetrics?(updated)
            }
            self.persistSnapshot(force: true)
        }
    }

    /// The stretches of `start...end` the session was running in, from its
    /// pause and resume events. Before the first event inside the span the
    /// session is taken to be in the state the last earlier event left it.
    private static func runningStretches(from start: Date, to end: Date, events: [HKWorkoutEvent]) -> [DateInterval] {
        guard end > start else { return [] }
        var running = true
        var stretchStart = start
        var stretches: [DateInterval] = []
        let changes = events
            .compactMap { event -> (Date, Bool)? in
                switch event.type {
                case .pause, .motionPaused: return (event.dateInterval.start, false)
                case .resume, .motionResumed: return (event.dateInterval.start, true)
                default: return nil
                }
            }
            .sorted { $0.0 < $1.0 }
        for (at, resumes) in changes {
            if at <= start {
                running = resumes
                continue
            }
            if at >= end { break }
            if running && !resumes {
                stretches.append(DateInterval(start: stretchStart, end: at))
            } else if !running && resumes {
                stretchStart = at
            }
            running = resumes
        }
        if running { stretches.append(DateInterval(start: stretchStart, end: end)) }
        return stretches.filter { $0.duration > 0 }
    }

    /// The pedometer failed (permission refused at the prompt, sensor trouble)
    /// partway through a run that writes its own distance: let the system
    /// collect it again so the run is not left without any.
    private func fallBackToSystemDistance() {
        guard selfWrittenDistance else { return }
        selfWrittenDistance = false
        // Health never collected what the pedometer measured so far: keep it
        // as a floor under what the system collects from here on.
        systemDistanceOffset = pedometerDistance
        liveDataSource?.enableCollection(for: Self.distanceType, predicate: nil)
        persistSnapshot(force: true)
    }

    fileprivate func stopMotion() {
        pedometerLive = false
        pedometer?.stopUpdates()
        pedometer = nil
        motionTimer?.invalidate()
        motionTimer = nil
    }

    private func judgeSteps() {
        // Only once the pedometer has actually reported: before that, a zero
        // count says nothing about whether the wearer is moving.
        guard session != nil, pedometerLive else { return }
        let paused = pausedByAutoPause
        let action = indoorAutoPause.step(
            steps: pedometerSteps,
            at: Date(),
            kind: runKind,
            paused: paused
        )
        guard action != .none else { return }
        // A manual pause is never auto-resumed.
        if action == .resume && !paused { return }
        onAutoPause?(action)
    }
}

// MARK: - Route (outdoor)

extension WatchRunHealthKitController {
    /// Starts the watch's GPS and a route builder. The location prompt shows
    /// the first time; fixes start arriving once it is allowed. A denied
    /// permission leaves a workout with no route, and the distance the
    /// session estimates without GPS.
    fileprivate func startRoute() {
        // A second start must not leave the first location manager delivering.
        stopRoute()
        routeBuilder = HKWorkoutRouteBuilder(healthStore: healthStore, device: nil)
        let manager = CLLocationManager()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.activityType = .fitness
        locationManager = manager
        collectingRoute = true
        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    fileprivate func stopRoute() {
        locationManager?.stopUpdatingLocation()
        locationManager?.delegate = nil
        locationManager = nil
        collectingRoute = false
        routeBuilder = nil
        // Called wherever a run ends or fails, so the indoor detector stops here too.
        stopMotion()
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        switch manager.authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways:
            manager.startUpdatingLocation()
        default:
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let latest = locations.last {
            let accuracy = latest.horizontalAccuracy
            DispatchQueue.main.async { [weak self] in self?.onGpsAccuracy?(accuracy) }
            let point = WatchRoutePoint(lat: latest.coordinate.latitude, lon: latest.coordinate.longitude)
            let taken = latest.timestamp
            DispatchQueue.main.async { [weak self] in self?.onLocation?(point, accuracy, taken) }
        }
        judgeMovement(locations)
        guard collectingRoute, let routeBuilder else { return }
        // Apple's guidance: drop fixes with no usable accuracy, and ones too
        // coarse to draw a believable line.
        let usable = locations.filter { $0.horizontalAccuracy >= 0 && $0.horizontalAccuracy <= 50 }
        guard !usable.isEmpty else { return }
        routeBuilder.insertRouteData(usable) { _, _ in }
        routeRows.append(contentsOf: usable.map { fix in
            [
                fix.timestamp.timeIntervalSince1970 * 1000,
                fix.coordinate.latitude,
                fix.coordinate.longitude,
                fix.verticalAccuracy >= 0 ? fix.altitude : watchRunNoAltitude,
                fix.horizontalAccuracy,
                routeSegment,
            ]
        })
        persistSnapshot()
    }

    /// Runs every fix, paused or not, through the auto-pause detector. The
    /// location manager keeps running while paused for exactly this reason.
    private func judgeMovement(_ locations: [CLLocation]) {
        guard session != nil else { return }
        for location in locations {
            let paused = pausedByAutoPause
            let action = autoPause.step(
                speed: location.speed,
                accuracy: location.horizontalAccuracy,
                at: location.timestamp,
                kind: runKind,
                paused: paused
            )
            guard action != .none else { continue }
            // A manual pause is never auto-resumed.
            if action == .resume && !paused { continue }
            DispatchQueue.main.async { [weak self] in self?.onAutoPause?(action) }
            break
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

extension WatchRunHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            // A failure after the run was ended on purpose is not this run's.
            guard let self, self.session === workoutSession else { return }
            // Whatever was recorded is kept: the session is gone, but the
            // route, readings and figures are still here.
            let elapsed = self.builder?.elapsedTime ?? 0
            let endedAt = Date()
            let counted = self.builder.flatMap { Self.workoutStepCount($0) }
                ?? self.indoorPedometerSteps(elapsed: elapsed, endedAt: endedAt)
            let result = elapsed >= WatchRunSnapshot.minimumKeptSeconds ? WatchRunResult(
                clientId: self.clientId,
                kind: self.runKind,
                place: self.runPlace,
                startedAt: self.startedAt,
                endedAt: endedAt,
                activeSeconds: elapsed,
                metrics: self.metrics,
                route: self.routeRows,
                heartRate: self.heartRateRows,
                laps: self.lapMarks,
                lapDistances: self.lapDistances,
                distanceSeries: self.distanceSeries,
                plan: self.plan,
                planCompleted: self.planCompleted(at: elapsed),
                steps: counted
            ) : nil
            self.session = nil
            self.builder = nil
            self.routeBuilder?.discard()
            self.stopRoute()
            if result == nil { WatchRunSnapshotStore.clear() }
            self.onFailure?(result)
        }
    }
}

extension WatchRunHealthKitController: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        // Runs on a HealthKit queue: read the builder here, and touch `metrics`
        // (written on the main queue) only inside the main-queue block.
        let distance = workoutBuilder.statistics(for: Self.distanceType)?
            .sumQuantity()?.doubleValue(for: .meter())
        let energy = workoutBuilder.statistics(for: Self.energyType)?
            .sumQuantity()?.doubleValue(for: .kilocalorie())
        let bpm = workoutBuilder.statistics(for: Self.heartRateType)?
            .mostRecentQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        let heartRateCollected = collectedTypes.contains(Self.heartRateType)
        let activeElapsed = workoutBuilder.elapsedTime
        let readAt = Date().timeIntervalSince1970 * 1000
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            var updated = self.metrics
            if !self.selfWrittenDistance, let distance {
                updated.distanceMeters = self.systemDistanceOffset + distance
            }
            if let energy { updated.activeEnergyKcal = energy }
            if let bpm, bpm > 0 { updated.heartRate = bpm }
            let reading = heartRateCollected ? updated.heartRate : nil
            self.metrics = updated
            if !self.selfWrittenDistance, distance != nil, updated.distanceMeters > 0,
               activeElapsed - (self.distanceSeries.last?.first ?? -Self.distanceSeriesInterval) >= Self.distanceSeriesInterval {
                self.distanceSeries.append([activeElapsed.rounded(), updated.distanceMeters])
            }
            if let reading, self.session != nil {
                self.heartRateRows.append([readAt, reading])
                self.persistSnapshot()
            }
            self.onMetrics?(updated)
        }
    }
}
