import Foundation
import HealthKit

/// Heart-rate collection for a GPS recording the phone is making.
///
/// The phone owns the route and the diary entry, so this runs a plain
/// `HKWorkoutSession` for one reason: it is what keeps the heart-rate sensor
/// sampling at workout rate with the wrist down. Readings come from the live
/// builder's statistics (a reading every few seconds) and go to the phone in
/// batches.
///
/// The workout it saves to Apple Health carries `SparkyFitnessSessionId`, the
/// same own-write marker `WorkoutHealthKitController` uses, so the phone's
/// inbound sync skips it instead of filing the run a second time.
///
/// Nothing is written to Apple Health until the phone says whether the
/// recording was saved or discarded. When it finishes, the collection is
/// stopped but the workout is held (`Outcome.hold`); the phone's verdict then
/// finishes it (`resolveHeld(save: true)`) or throws it away. A workout that
/// was already written cannot be reliably taken back out of Health, since
/// deleting the `HKWorkout` does not remove every sample attached to it.
final class RecordingHealthKitController: NSObject {
    static let shared = RecordingHealthKitController()

    /// Called on the main queue with the readings collected since the last
    /// call.
    var onBatchReady: (([HeartRateSample]) -> Void)?

    /// Called on the main queue with each new reading as it is taken, ahead of
    /// the batch it will also be part of. Display only.
    var onLiveReading: ((Double, Date) -> Void)?

    /// What happens to the workout when collection stops.
    enum Outcome {
        /// Write it to Apple Health now.
        case save
        /// Throw it away; nothing reaches Apple Health.
        case discard
        /// Stop collecting but keep the workout until `resolveHeld`.
        case hold
    }

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    /// A finished recording's workout, waiting for the phone's verdict.
    private var heldBuilder: HKLiveWorkoutBuilder?
    /// A hold was asked for but `endCollection` has not finished, so there is
    /// nothing to finish or discard yet.
    private var holdInFlight = false
    /// The phone's verdict arrived while a hold was still in flight.
    private var earlyVerdict: Bool?
    private var pendingSamples: [HeartRateSample] = []
    private var pendingTimes: Set<String> = []
    private var batchTimer: Timer?
    private let instantFormatter = ISO8601DateFormatter()

    private static let batchInterval: TimeInterval = 30

    var hasLiveSession: Bool { session != nil }

    private override init() {
        super.init()
    }

    /// Starts sampling. A no-op when a session is already running (for
    /// example a strength workout) or HealthKit is unavailable: the recording
    /// still works, just without heart rate.
    func start(sessionId: String, activity: RecordingActivity, indoor: Bool) {
        guard HKHealthStore.isHealthDataAvailable(), session == nil else { return }

        // A new recording while an earlier one is still undecided: keep the
        // earlier workout rather than lose it.
        resolveHeld(save: true)

        let configuration = HKWorkoutConfiguration()
        switch activity {
        case .walk: configuration.activityType = .walking
        case .run: configuration.activityType = .running
        case .ride: configuration.activityType = .cycling
        }
        configuration.locationType = indoor ? .indoor : .outdoor

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
            pendingTimes = []

            let now = Date()
            newSession.startActivity(with: now)
            newBuilder.beginCollection(withStart: now) { success, _ in
                guard success else { return }
                newBuilder.addMetadata(
                    [WorkoutHealthKitController.sessionMetadataKey: sessionId]
                ) { _, _ in }
            }
            startBatchTimer()
        } catch {
            session = nil
            builder = nil
        }
    }

    func pause() {
        session?.pause()
    }

    func resume() {
        session?.resume()
    }

    /// Applies the phone's verdict to a workout held by `stop(.hold)`: write it
    /// to Apple Health when the recording was saved, drop it when it was
    /// discarded. Does nothing when nothing is held.
    func resolveHeld(save: Bool) {
        if let held = heldBuilder {
            heldBuilder = nil
            Self.complete(held, save: save)
        } else if holdInFlight {
            earlyVerdict = save
        }
    }

    private static func complete(_ builder: HKLiveWorkoutBuilder, save: Bool) {
        if save {
            builder.finishWorkout { _, _ in }
        } else {
            builder.discardWorkout()
        }
    }

    /// Ends the session and hands back the readings not yet sent. `outcome`
    /// says what becomes of the workout: written to Apple Health, discarded,
    /// or held until the phone decides.
    func stop(_ outcome: Outcome, completion: @escaping ([HeartRateSample]) -> Void) {
        stopBatchTimer()
        let held = pendingSamples
        pendingSamples = []
        guard let session, let endingBuilder = builder else {
            completion(held)
            return
        }
        self.session = nil
        self.builder = nil
        if outcome == .hold { holdInFlight = true }
        session.end()
        endingBuilder.endCollection(withEnd: Date()) { [weak self] _, _ in
            switch outcome {
            case .discard:
                endingBuilder.discardWorkout()
            case .save:
                endingBuilder.finishWorkout { _, _ in }
            case .hold:
                DispatchQueue.main.async {
                    guard let self else { return }
                    self.holdInFlight = false
                    if let verdict = self.earlyVerdict {
                        self.earlyVerdict = nil
                        Self.complete(endingBuilder, save: verdict)
                    } else {
                        self.heldBuilder = endingBuilder
                    }
                }
            }
            DispatchQueue.main.async { completion(held) }
        }
    }

    private func startBatchTimer() {
        stopBatchTimer()
        batchTimer = Timer.scheduledTimer(withTimeInterval: Self.batchInterval, repeats: true) { [weak self] _ in
            self?.flush()
        }
    }

    private func stopBatchTimer() {
        batchTimer?.invalidate()
        batchTimer = nil
    }

    private func flush() {
        guard !pendingSamples.isEmpty else { return }
        let batch = pendingSamples
        pendingSamples = []
        onBatchReady?(batch)
    }

    private func append(bpm: Double, at date: Date) {
        let t = instantFormatter.string(from: date)
        if pendingTimes.contains(t) { return }
        pendingTimes.insert(t)
        pendingSamples.append(HeartRateSample(t: t, bpm: bpm))
    }
}

extension RecordingHealthKitController: HKWorkoutSessionDelegate {
    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { [weak self] in
            self?.stopBatchTimer()
            self?.session = nil
            self?.builder = nil
        }
    }
}

extension RecordingHealthKitController: HKLiveWorkoutBuilderDelegate {
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    func workoutBuilder(
        _ workoutBuilder: HKLiveWorkoutBuilder,
        didCollectDataOf collectedTypes: Set<HKSampleType>
    ) {
        let heartRateType = HKQuantityType(.heartRate)
        guard collectedTypes.contains(heartRateType),
              let statistics = workoutBuilder.statistics(for: heartRateType),
              let quantity = statistics.mostRecentQuantity(),
              let interval = statistics.mostRecentQuantityDateInterval()
        else { return }
        let bpm = quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute()))
        guard bpm > 0 else { return }
        DispatchQueue.main.async { [weak self] in
            self?.append(bpm: bpm, at: interval.end)
            self?.onLiveReading?(bpm, interval.end)
        }
    }
}
