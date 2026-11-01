import Foundation
import HealthKit

/// Wraps HKWorkoutSession/HKLiveWorkoutBuilder — the watch's own workout
/// engine — so the rest of the app deals in plain heart-rate callbacks
/// instead of HealthKit's session/builder/delegate machinery. Starting a real
/// HKWorkoutSession (rather than only reading heart-rate samples on the side)
/// is what keeps HR sampling running in the background and gives the wearer
/// the system's own workout affordances (Dock, complications reflecting an
/// active session) while the app itself isn't in the foreground.
///
/// All delegate callbacks are re-dispatched onto the main queue: HealthKit
/// calls them from its own background queue, and every property here is read
/// from `WorkoutView`'s SwiftUI body.
final class WorkoutHealthKitController: NSObject {
    static let shared = WorkoutHealthKitController()

    /// Fired on every fresh HR reading HealthKit reports, for the header's
    /// live BPM. Always called on the main queue.
    var onHeartRate: ((Double, Date) -> Void)?
    /// Fired periodically with whatever samples accumulated since the last
    /// flush, for `heartRateBatch` transfers. Always called on the main queue.
    var onBatchReady: (([HeartRateSample]) -> Void)?
    /// Running active energy for this workout, in kcal. Always called on the
    /// main queue.
    var onActiveEnergy: ((Double) -> Void)?

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// The workout `finishWorkout` last saved, kept so the wearer can attach
    /// an effort rating to it from the summary screen. Cleared when the next
    /// session starts. Main queue only.
    private var lastSavedWorkout: HKWorkout?
    private var pendingSamples: [HeartRateSample] = []
    /// Timestamps already sitting in `pendingSamples` (or flushed this
    /// session), so a series-query callback and a statistics burst cannot
    /// enqueue the same instant twice.
    private var pendingSampleTimes: Set<String> = []
    private var batchTimer: Timer?
    private var hrSeriesQuery: HKQuery?
    /// Set on recovery: readings at or before this instant were already sent
    /// before the relaunch and must not go out again. Nil for a fresh workout.
    private var skipReadingsThrough: Date?
    /// Bumped whenever a session takes over the buffer (`start`, a recovery),
    /// so a late `stop` path can tell that `pendingSamples` and
    /// `pendingSampleTimes` now belong to another session. Main queue only.
    private var sessionGeneration = 0
    /// Builders `discard` has thrown away. A statistics callback can still
    /// land on main afterwards, including from an older session than the one
    /// most recently discarded, and must not reach the workout now running.
    private var discardedBuilderIds: Set<ObjectIdentifier> = []
    private let instantFormatter = ISO8601DateFormatter()

    /// How often accumulated samples are flushed to `onBatchReady`.
    ///
    /// A minute rather than ten seconds because batches are QUEUED now
    /// (`WatchSessionManager.sendHeartRateBatch`) instead of dropped when the
    /// phone is out of range: nothing is lost by batching less often, and an
    /// hour's workout costs ~60 queued transfers rather than ~360.
    private static let batchInterval: TimeInterval = 60

    /// Cap used when expanding a sparse HK quantity-series sample whose
    /// date interval is wider than a single reading. Matches the server's
    /// `MAX_GAP_SECONDS` so a compressed 3-minute sample still credits time
    /// in zone instead of collapsing to one point and losing the gap.
    private static let seriesExpandStep: TimeInterval = 30

    /// Longest `stop` holds its completion while HealthKit saves the workout
    /// and the saved heart rate is read back.
    private static let finishTailTimeout: TimeInterval = 20

    /// Stamped onto every workout this app saves to HealthKit, so the phone's
    /// inbound sync can recognise its own writes and skip them.
    ///
    /// Duplicated as a literal in
    /// `src/services/healthkit/dataTransformation.ts` — a Swift watch target
    /// and a React Native module have no way to share a constant, the same
    /// reason `WatchDeepLink.scheme` exists in three places. Renaming it here
    /// without renaming it there silently reintroduces duplicate workouts.
    ///
    /// A metadata key rather than the source bundle id because the watch app's
    /// bundle (`<phone>.watchkitapp`) is not the phone's, so the existing
    /// `isOwnRecord` bundle comparison would never match a workout written
    /// from the wrist.
    static let sessionMetadataKey = "SparkyFitnessSessionId"

    private var heartRateType: HKQuantityType { HKQuantityType(.heartRate) }
    /// Apple's zone totals for the workout just finished. Consumed by the
    /// batch that carries the tail, so a periodic batch cannot take them.
    private var pendingAppleZones: [[String: Any]]?

    func storeAppleZones(from workout: HKWorkout) {
        let zones = AppleWorkoutZones.heartRateZones(of: workout)
        pendingAppleZones = zones.isEmpty ? nil : zones
    }

    func consumeAppleZones() -> [[String: Any]]? {
        let zones = pendingAppleZones
        pendingAppleZones = nil
        return zones
    }
    private var activeEnergyType: HKQuantityType { HKQuantityType(.activeEnergyBurned) }

    private override init() {
        super.init()
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            DispatchQueue.main.async { completion(false) }
            return
        }
        let shareTypes: Set<HKSampleType> = [
            HKObjectType.workoutType(), heartRateType, activeEnergyType,
        ]
        let readTypes: Set<HKObjectType> = [
            heartRateType, activeEnergyType, HKObjectType.workoutType(),
        ]
        healthStore.requestAuthorization(toShare: shareTypes, read: readTypes) { [weak self] success, _ in
            DispatchQueue.main.async {
                guard let self else {
                    completion(false)
                    return
                }
                // `success` only means the prompt finished without error, NOT
                // that the wearer granted anything. Apple hides read status
                // (always `.notDetermined`); share status is the one we can
                // actually inspect. Denied share still lets the Workout tab
                // run as a timer — callers start the session regardless and
                // treat this as "worth trying" vs "HealthKit is unusable".
                let workoutShare = self.healthStore.authorizationStatus(
                    for: HKObjectType.workoutType()
                )
                completion(success && workoutShare != .sharingDenied)
            }
        }
    }

    /// True when we currently hold a live (or recovered) HK session.
    var hasLiveSession: Bool { session != nil }

    /// Re-attaches an HKWorkoutSession that watchOS kept alive after jetsam.
    ///
    /// The system does not restore our delegates or the series query, so a
    /// relaunch that only rebuilt SwiftUI state would show a workout with no
    /// heart rate and never save the HKWorkout. Returns whether a session was
    /// recovered; the caller then either binds callbacks to it or starts a
    /// fresh one against the persisted plan.
    /// - Parameter heartRateSentThrough: the last reading already sent before
    ///   the relaunch. The HR query resumes there, including any sample that
    ///   straddles it, and drops the readings up to it. Nil replays from the
    ///   workout's start, which re-sends everything the phone already has.
    func recoverIfNeeded(
        heartRateSentThrough: Date? = nil,
        completion: @escaping (Bool) -> Void
    ) {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else {
            DispatchQueue.main.async { completion(self.session != nil) }
            return
        }
        healthStore.recoverActiveWorkoutSession { [weak self] recovered, error in
            DispatchQueue.main.async {
                guard let self, let recovered, error == nil else {
                    completion(false)
                    return
                }
                let state = recovered.state
                guard state == .running || state == .paused else {
                    completion(false)
                    return
                }
                recovered.delegate = self
                let recoveredBuilder = recovered.associatedWorkoutBuilder()
                recoveredBuilder.delegate = self
                recoveredBuilder.dataSource = HKLiveWorkoutDataSource(
                    healthStore: self.healthStore,
                    workoutConfiguration: recovered.workoutConfiguration
                )
                self.session = recovered
                self.builder = recoveredBuilder
                self.sessionGeneration += 1
                if state == .paused {
                    recovered.resume()
                }
                if let heartRateSentThrough {
                    self.skipReadingsThrough = heartRateSentThrough
                    // Overlapping rather than strict-start: a multi-reading
                    // sample that began before the mark still holds readings
                    // after it; `appendSample` drops the ones already sent.
                    self.startHeartRateSeriesQuery(
                        from: heartRateSentThrough,
                        includeSamplesStartingEarlier: true
                    )
                } else {
                    self.startHeartRateSeriesQuery(from: recovered.startDate ?? Date())
                }
                self.startBatchTimer()
                completion(true)
            }
        }
    }

    /// Starts a real workout session, defaulting to strength training — this
    /// app has no per-exercise activity-type mapping yet, and traditional
    /// strength training is the closest built-in `HKWorkoutActivityType` to a
    /// preset session's mix of exercises. Close enough to unlock background HR
    /// sampling and the system workout UI; a no-op if a session is already
    /// running or HealthKit isn't available (the Workout tab still functions
    /// as a plain timer/set tracker either way, just without live HR).
    /// - Parameter sessionId: the Sparky live-workout session this belongs to,
    ///   stamped into the saved workout's metadata as the own-write marker.
    /// - Parameter workoutName: the preset's name, saved as the workout's
    ///   brand name — the title Fitness shows in its Sessions list instead of
    ///   the bare activity type.
    func start(sessionId: String, workoutName: String) {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = .traditionalStrengthTraining
        configuration.locationType = .indoor

        do {
            let newSession = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
            let newBuilder = newSession.associatedWorkoutBuilder()
            newBuilder.dataSource = HKLiveWorkoutDataSource(
                healthStore: healthStore,
                workoutConfiguration: configuration
            )
            newSession.delegate = self
            newBuilder.delegate = self

            session = newSession
            builder = newBuilder
            pendingSamples = []
            pendingSampleTimes = []
            skipReadingsThrough = nil
            lastSavedWorkout = nil
            sessionGeneration += 1

            let now = Date()
            newSession.startActivity(with: now)
            // Metadata must be added during an active collection — firing it
            // in parallel with beginCollection raced and could drop the
            // own-write marker the phone uses to skip this workout on sync.
            var metadata: [String: Any] = [Self.sessionMetadataKey: sessionId]
            let title = workoutName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !title.isEmpty {
                metadata[HKMetadataKeyWorkoutBrandName] = title
            }
            newBuilder.beginCollection(withStart: now) { success, _ in
                guard success else { return }
                newBuilder.addMetadata(metadata) { _, _ in }
            }
            startHeartRateSeriesQuery(from: now)
            startBatchTimer()
        } catch {
            session = nil
            builder = nil
        }
    }

    /// Ends the session. Samples already held go to `onBuffered` before
    /// anything waits on HealthKit; heart rate HealthKit only saves when the
    /// workout is finished goes to `completion` afterwards.
    ///
    /// The anchored query has to stop before `finishWorkout`, and that is
    /// when HealthKit writes the tail. Reading `predicateForObjects(from:)`
    /// on the saved workout picks those up. Instants already flushed stay in
    /// `pendingSampleTimes`, so the tail is only what the phone has not seen.
    ///
    /// `onBuffered` runs synchronously on the caller's (main) queue, so those
    /// readings can be queued for the phone before the process has a chance
    /// to be suspended mid-finish. Passing nil folds them into `completion`.
    ///
    /// The completion is always on the main queue and fires exactly once, at
    /// the latest `finishTailTimeout` after the call. Its second argument is
    /// true when the timeout fired it: the saved tail was still outstanding,
    /// and arrives later through `onLateTail` (possibly empty, which means
    /// HealthKit is done and there was nothing more). Callers must not send
    /// `workoutStop` or clear the plan until `completion` fires — the tail
    /// still needs a session to tag.
    func stop(
        onBuffered: (([HeartRateSample]) -> Void)? = nil,
        onLateTail: (([HeartRateSample]) -> Void)? = nil,
        completion: @escaping ([HeartRateSample], Bool) -> Void
    ) {
        stopBatchTimer()
        stopHeartRateSeriesQuery()
        let held = pendingSamples
        pendingSamples = []
        let buffered: [HeartRateSample]
        if let onBuffered {
            onBuffered(held)
            buffered = []
        } else {
            buffered = held
        }
        let gate = LeaveOnce()
        // Readings the anchored query or builder delegate had already queued
        // on main still land in `pendingSamples` after the drain above, and
        // `appendSample` marks them seen, so the saved-tail filter drops them.
        // Whichever path runs takes them along. The completion is claimed
        // first, so a losing path cannot empty the buffer after it ran.
        // Both closures run on main only.
        // Once another session has started (a queued plan after the timeout,
        // or one resumed after recovery), the live buffer and dedupe set are
        // its own: a late path must not drain them or filter against them.
        let stopGeneration = sessionGeneration
        let seenAtStop = pendingSampleTimes
        let drainLate: () -> [HeartRateSample] = { [weak self] in
            guard let self, self.sessionGeneration == stopGeneration else { return [] }
            let late = self.pendingSamples
            self.pendingSamples = []
            return late
        }
        // `tail` is only what HealthKit saved that nobody has seen: empty
        // when it could not save. `buffered` rides with the completion, so a
        // late tail after the timeout does not repeat it.
        let finishTail: ([HeartRateSample]) -> Void = { tail in
            DispatchQueue.main.async {
                if gate.claim() {
                    completion(buffered + tail + drainLate(), false)
                } else {
                    onLateTail?(tail + drainLate())
                }
            }
        }
        guard let session, let endingBuilder = builder else {
            finishTail([])
            return
        }
        // HealthKit can take a while to save, and a query can stall. The
        // caller holds the plan, and any queued next workout, until the
        // completion fires, so the wait is bounded. The tail itself is not
        // dropped: it goes to `onLateTail` whenever it does arrive.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.finishTailTimeout) {
            if gate.claim() {
                completion(buffered + drainLate(), true)
            }
        }
        let skipThrough = skipReadingsThrough
        let now = Date()
        session.end()
        self.session = nil
        self.builder = nil
        endingBuilder.endCollection(withEnd: now) { [weak self] _, _ in
            endingBuilder.finishWorkout { [weak self] workout, _ in
                guard let self, let workout else {
                    finishTail([])
                    return
                }
                self.storeAppleZones(from: workout)
                DispatchQueue.main.async { self.lastSavedWorkout = workout }
                self.readHeartRate(
                    matching: HKQuery.predicateForObjects(from: workout),
                    skipThrough: skipThrough
                ) { extra in
                    // The series query finishes on a background queue. The
                    // live buffer is only touched on main, so the dedupe set
                    // has to be too.
                    DispatchQueue.main.async {
                        let current = self.sessionGeneration == stopGeneration
                        let seen = current ? self.pendingSampleTimes : seenAtStop
                        let novel = extra.filter { !seen.contains($0.t) }
                        if current {
                            for sample in novel {
                                self.pendingSampleTimes.insert(sample.t)
                            }
                        }
                        finishTail(novel)
                    }
                }
            }
        }
    }

    /// Attaches the wearer's 1-10 effort to the workout just saved.
    func saveEffort(_ score: Int, completion: @escaping (Bool) -> Void) {
        guard let workout = lastSavedWorkout else {
            completion(false)
            return
        }
        WorkoutEffort.save(score, for: workout, in: healthStore, completion: completion)
    }

    /// Ends the session and throws the workout away: nothing is saved to
    /// Health and no heart rate is sent. Safe with no session running.
    func discard() {
        stopBatchTimer()
        stopHeartRateSeriesQuery()
        pendingSamples = []
        pendingSampleTimes = []
        sessionGeneration += 1
        guard let session, let endingBuilder = builder else { return }
        discardedBuilderIds.insert(ObjectIdentifier(endingBuilder))
        session.end()
        self.session = nil
        self.builder = nil
        endingBuilder.endCollection(withEnd: Date()) { _, _ in
            endingBuilder.discardWorkout()
        }
    }

    /// Heart rate saved with the workout carrying this session's own-write
    /// marker, for a finish whose tail never reached the phone. Readings at or
    /// before `sentThrough` were already sent and are skipped.
    ///
    /// Completion is on main with nil when HealthKit holds no such workout.
    /// There is deliberately no fallback to other readings in the time window:
    /// nothing ties those to this workout, let alone to one exercise.
    func readSavedHeartRate(
        sessionId: String,
        sentThrough: Date?,
        completion: @escaping ([HeartRateSample]?) -> Void
    ) {
        let deliver: ([HeartRateSample]?) -> Void = { samples in
            DispatchQueue.main.async { completion(samples) }
        }
        guard HKHealthStore.isHealthDataAvailable() else {
            deliver(nil)
            return
        }
        let workoutQuery = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: HKQuery.predicateForObjects(
                withMetadataKey: Self.sessionMetadataKey,
                allowedValues: [sessionId]
            ),
            limit: 1,
            sortDescriptors: nil
        ) { [weak self] _, samples, _ in
            guard let self, let workout = samples?.first as? HKWorkout else {
                deliver(nil)
                return
            }
            self.storeAppleZones(from: workout)
            self.readHeartRate(
                matching: HKQuery.predicateForObjects(from: workout),
                skipThrough: sentThrough
            ) { samples in
                deliver(samples)
            }
        }
        healthStore.execute(workoutQuery)
    }

    /// Returns and clears whatever is buffered, WITHOUT stopping the session.
    ///
    /// Synchronous for the same reason `stop()` is: the caller tags the batch
    /// with the exercise it belongs to, and routing it through `onBatchReady`
    /// (which hops to the main actor) would read the exercise after the store
    /// had already moved on. Used at every exercise boundary so a batch never
    /// spans two exercises.
    func drainPending() -> [HeartRateSample] {
        let drained = pendingSamples
        pendingSamples = []
        return drained
    }

    private func startBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = Timer.scheduledTimer(withTimeInterval: Self.batchInterval, repeats: true) { [weak self] _ in
            self?.flush()
        }
        if let batchTimer {
            RunLoop.main.add(batchTimer, forMode: .common)
        }
    }

    private func stopBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = nil
    }

    /// Hands the buffer to `WatchSessionManager.sendHeartRateBatch`, EVEN WHEN
    /// IT IS EMPTY.
    ///
    /// Active energy rides along on these batches but is read from the store
    /// rather than this buffer, so bailing out on no samples used to mean a
    /// wearer who granted energy but refused heart rate sent nothing at all
    /// for the whole workout — despite the payload, the route and the phone's
    /// flush all supporting energy without a series. Whether there is anything
    /// worth sending is decided one level up, which is the only place that can
    /// see both halves.
    private func flush() {
        let batch = pendingSamples
        pendingSamples = []
        onBatchReady?(batch)
    }

    /// Walks every quantity in an HK heart-rate series, not just
    /// `statistics.mostRecentQuantity()`.
    ///
    /// The live-builder statistics callback fires once per burst and only
    /// exposes the latest reading, so a compressed series covering 30–60s
    /// collapsed to a single point and the server's zone calculator (which
    /// attributes the gap between consecutive samples, capped at 60s) lost
    /// the interior. `HKQuantitySeriesSampleQuery` yields each interior
    /// quantity; a sample whose own interval is still wide is expanded at
    /// `seriesExpandStep` so the zone chart still has something to credit.
    private func startHeartRateSeriesQuery(
        from start: Date,
        includeSamplesStartingEarlier: Bool = false
    ) {
        stopHeartRateSeriesQuery()
        // No source filter: heart rate sampled during the session is saved
        // with the watch itself as its source, not this app, so restricting
        // to `HKSource.default()` matched nothing on real hardware. Anything
        // this watch measured after the workout began belongs to it.
        // Strict-start for a fresh workout so readings from before it began
        // cannot creep in; overlapping on recovery (see `recoverIfNeeded`).
        let predicate = HKQuery.predicateForSamples(
            withStart: start,
            end: nil,
            options: includeSamplesStartingEarlier ? [] : .strictStartDate
        )
        // Long-running: `HKQuantitySeriesSampleQuery` on its own enumerates
        // only the samples that exist when it executes and then completes,
        // so started at workout begin it found nothing and the upload buffer
        // stayed empty for the whole workout (the live BPM kept working
        // because it comes from the builder's statistics instead). The
        // anchored query's `updateHandler` keeps delivering every sample the
        // live data source saves until the query is stopped.
        // Read on main (this runs there), so a callback still in flight after
        // `discard` or a newer `start` can tell the buffer is no longer its own.
        let generation = sessionGeneration
        let handleSamples: ([HKSample]?) -> Void = { [weak self] samples in
            guard let self, let samples else { return }
            for case let sample as HKQuantitySample in samples {
                self.ingest(sample, generation: generation)
            }
        }
        let query = HKAnchoredObjectQuery(
            type: heartRateType,
            predicate: predicate,
            anchor: nil,
            limit: HKObjectQueryNoLimit
        ) { _, samples, _, _, error in
            guard error == nil else { return }
            handleSamples(samples)
        }
        query.updateHandler = { _, samples, _, _, error in
            guard error == nil else { return }
            handleSamples(samples)
        }
        healthStore.execute(query)
        hrSeriesQuery = query
    }

    /// Feeds one saved heart-rate sample into the buffer. A sample holding
    /// several readings is walked with a one-shot series query scoped to that
    /// sample — correct here, unlike at workout start, because the sample
    /// already exists — so the zone calculator gets each interior reading.
    private func ingest(_ sample: HKQuantitySample, generation: Int) {
        let bpmUnit = HKUnit.count().unitDivided(by: .minute())
        guard sample.count > 1 else {
            let bpm = sample.quantity.doubleValue(for: bpmUnit)
            guard bpm > 0 else { return }
            let interval = DateInterval(start: sample.startDate, end: sample.endDate)
            DispatchQueue.main.async { [weak self] in
                guard let self, self.sessionGeneration == generation else { return }
                self.ingestSeriesQuantity(bpm: bpm, interval: interval)
            }
            return
        }
        let seriesQuery = HKQuantitySeriesSampleQuery(
            quantityType: heartRateType,
            predicate: HKQuery.predicateForObject(with: sample.uuid)
        ) { [weak self] _, quantity, dateInterval, _, _, error in
            guard error == nil, let quantity, let dateInterval else { return }
            let bpm = quantity.doubleValue(for: bpmUnit)
            guard bpm > 0 else { return }
            DispatchQueue.main.async {
                guard let self, self.sessionGeneration == generation else { return }
                self.ingestSeriesQuantity(bpm: bpm, interval: dateInterval)
            }
        }
        healthStore.execute(seriesQuery)
    }

    private func stopHeartRateSeriesQuery() {
        if let hrSeriesQuery {
            healthStore.stop(hrSeriesQuery)
        }
        hrSeriesQuery = nil
    }

    /// Heart rate saved in Health, expanded the way the live query expands it.
    /// For a finished workout these samples do not exist until `finishWorkout`
    /// returns, which is after the live query has stopped. Completion runs on
    /// a background queue.
    private func readHeartRate(
        matching predicate: NSPredicate,
        skipThrough: Date?,
        completion: @escaping ([HeartRateSample]) -> Void
    ) {
        let query = HKSampleQuery(
            sampleType: heartRateType,
            predicate: predicate,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: nil
        ) { [weak self] _, samples, _ in
            guard let self else {
                completion([])
                return
            }
            let quantities = (samples as? [HKQuantitySample]) ?? []
            let bpmUnit = HKUnit.count().unitDivided(by: .minute())
            let group = DispatchGroup()
            let lock = NSLock()
            var collected: [HeartRateSample] = []
            for sample in quantities {
                if sample.count <= 1 {
                    let bpm = sample.quantity.doubleValue(for: bpmUnit)
                    guard bpm > 0 else { continue }
                    let expanded = self.expandedSamples(
                        bpm: bpm,
                        interval: DateInterval(start: sample.startDate, end: sample.endDate),
                        skipThrough: skipThrough
                    )
                    lock.lock()
                    collected.append(contentsOf: expanded)
                    lock.unlock()
                    continue
                }
                group.enter()
                let gate = LeaveOnce()
                let series = HKQuantitySeriesSampleQuery(
                    quantityType: self.heartRateType,
                    predicate: HKQuery.predicateForObject(with: sample.uuid)
                ) { _, quantity, interval, _, done, error in
                    if let quantity, let interval {
                        let bpm = quantity.doubleValue(for: bpmUnit)
                        if bpm > 0 {
                            let expanded = self.expandedSamples(
                                bpm: bpm,
                                interval: interval,
                                skipThrough: skipThrough
                            )
                            lock.lock()
                            collected.append(contentsOf: expanded)
                            lock.unlock()
                        }
                    }
                    lock.lock()
                    let shouldLeave = (done || error != nil) && gate.claim()
                    lock.unlock()
                    if shouldLeave {
                        group.leave()
                    }
                }
                self.healthStore.execute(series)
            }
            group.notify(queue: .global()) {
                completion(collected)
            }
        }
        healthStore.execute(query)
    }

    /// Same expansion `ingestSeriesQuantity` uses, without touching the live
    /// buffer or the on-screen BPM.
    private func expandedSamples(
        bpm: Double,
        interval: DateInterval,
        skipThrough: Date?
    ) -> [HeartRateSample] {
        let duration = interval.end.timeIntervalSince(interval.start)
        if duration <= 2 {
            return sample(at: interval.end, bpm: bpm, skipThrough: skipThrough).map { [$0] } ?? []
        }
        var samples: [HeartRateSample] = []
        var cursor = interval.start
        while cursor < interval.end {
            if let sample = sample(at: cursor, bpm: bpm, skipThrough: skipThrough) {
                samples.append(sample)
            }
            cursor = cursor.addingTimeInterval(Self.seriesExpandStep)
        }
        if let sample = sample(at: interval.end, bpm: bpm, skipThrough: skipThrough) {
            samples.append(sample)
        }
        return samples
    }

    /// `skipThrough` is passed in rather than read from `skipReadingsThrough`
    /// because this runs on HealthKit's queue, after `stop` may have moved on.
    private func sample(at date: Date, bpm: Double, skipThrough: Date?) -> HeartRateSample? {
        if let skipThrough, date < skipThrough.addingTimeInterval(1) {
            return nil
        }
        return HeartRateSample(t: instantFormatter.string(from: date), bpm: bpm)
    }

    private func ingestSeriesQuantity(bpm: Double, interval: DateInterval) {
        let duration = interval.end.timeIntervalSince(interval.start)
        if duration <= 2 {
            appendSample(at: interval.end, bpm: bpm)
            return
        }
        var cursor = interval.start
        while cursor < interval.end {
            appendSample(at: cursor, bpm: bpm)
            cursor = cursor.addingTimeInterval(Self.seriesExpandStep)
        }
        appendSample(at: interval.end, bpm: bpm)
    }

    private func appendSample(at date: Date, bpm: Double) {
        // Instants go out at second precision, so anything within the same
        // second as the last reading sent would re-send that reading.
        if let skipReadingsThrough, date < skipReadingsThrough.addingTimeInterval(1) {
            return
        }
        let t = instantFormatter.string(from: date)
        if pendingSampleTimes.contains(t) { return }
        pendingSampleTimes.insert(t)
        pendingSamples.append(HeartRateSample(t: t, bpm: bpm))
        onHeartRate?(bpm, date)
    }
}

/// Lets one caller through. Leaves a DispatchGroup once even if HealthKit
/// reports both an error and a final `done` callback for the same series
/// query, and fires `stop`'s completion once when the timeout races the tail.
private final class LeaveOnce {
    private var left = false

    func claim() -> Bool {
        if left { return false }
        left = true
        return true
    }
}

// MARK: - HKWorkoutSessionDelegate

extension WorkoutHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        // Strength-training sessions auto-pause when the wearer is still
        // (rest between sets). Leaving them paused stops HR for the rest of
        // the workout. Resume immediately so sampling survives rest.
        if toState == .paused {
            workoutSession.resume()
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.stopHeartRateSeriesQuery()
            self?.session = nil
            self?.builder = nil
            self?.stopBatchTimer()
        }
    }
}

// MARK: - HKLiveWorkoutBuilderDelegate

extension WorkoutHealthKitController: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        // Drives the live BPM, AND feeds the upload buffer as a floor: the
        // builder's statistics are what the wearer sees working, so a series
        // the sample query cannot read (read access withheld, or samples
        // attributed somewhere it does not look) still reaches the diary at
        // one reading per burst. When the sample query does deliver, its
        // denser readings join the same buffer and `appendSample` drops any
        // instant already present.
        if collectedTypes.contains(heartRateType),
           let statistics = workoutBuilder.statistics(for: heartRateType),
           let quantity = statistics.mostRecentQuantity(),
           let interval = statistics.mostRecentQuantityDateInterval() {
            let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
            if bpm > 0 {
                DispatchQueue.main.async { [weak self] in
                    guard let self,
                          !self.discardedBuilderIds.contains(ObjectIdentifier(workoutBuilder))
                    else { return }
                    self.appendSample(at: interval.end, bpm: bpm)
                }
            }
        }

        // Cumulative for the whole workout, not an instantaneous reading, so
        // it is read as a running sum rather than a most-recent value.
        if collectedTypes.contains(activeEnergyType),
           let statistics = workoutBuilder.statistics(for: activeEnergyType),
           let kcal = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
            DispatchQueue.main.async { [weak self] in
                guard let self,
                      !self.discardedBuilderIds.contains(ObjectIdentifier(workoutBuilder))
                else { return }
                self.onActiveEnergy?(kcal)
            }
        }
    }
}
