import Foundation
import Combine

/// The watch's view of a GPS recording the phone is making: what to show, and
/// the pause/resume/finish and heart-rate messages going back.
///
/// The phone is the source of truth. This only mirrors its last message; the
/// clock runs locally between updates (`RecordingState.elapsed`).
@MainActor
final class RecordingStore: ObservableObject {
    static let shared = RecordingStore()

    @Published private(set) var state: RecordingState?

    /// The newest heart rate, shown beside the status while readings keep
    /// arriving. Cleared when they stop for `liveHeartRateMaxAge`, and
    /// whenever the recording is not running, so a stale number never sits on
    /// the page.
    @Published private(set) var liveHeartRate: Int?
    private var staleReadingTask: Task<Void, Never>?
    private static let liveHeartRateMaxAge: TimeInterval = 15

    /// True while there is a recording to show, including a finished one the
    /// phone has not saved yet.
    var isActive: Bool { state != nil }

    private let healthKit = RecordingHealthKitController.shared
    /// Recordings the phone has ended. A queued state message for one of them
    /// can arrive late and must not bring it back.
    private var endedSessionIds: [String] = []
    /// The recording heart rate is being collected for.
    private var collectingFor: String?
    /// The finished recording whose Apple Health workout is waiting for the
    /// phone to say whether it was saved or discarded.
    private var heldFor: String?

    private init() {
        healthKit.onBatchReady = { [weak self] samples in
            Task { @MainActor in self?.sendHeartRate(samples) }
        }
        healthKit.onLiveReading = { [weak self] bpm, at in
            Task { @MainActor in self?.receiveLiveHeartRate(bpm, at: at) }
        }
    }

    func apply(_ update: RecordingUpdate) {
        switch update {
        case .ended(let sessionId, _, let discarded):
            remember(ended: sessionId)
            // A finished recording's workout has been held for this verdict:
            // saved goes to Apple Health, discarded goes nowhere.
            if heldFor == sessionId {
                heldFor = nil
                healthKit.resolveHeld(save: !discarded)
            }
            guard state?.sessionId == sessionId else { return }
            // Still collecting when the phone ends it: it was thrown away
            // before it finished.
            finishCollection(.discard)
            clearLiveHeartRate()
            state = nil
        case .state(let incoming):
            if endedSessionIds.contains(incoming.sessionId) { return }
            if let current = state, current.sessionId == incoming.sessionId {
                // Out of order: a queued copy of an earlier status.
                if incoming.sentAt < current.sentAt { return }
            }
            let previous = state
            state = incoming
            // Buzz when the plan moves on, but not when a recording first
            // appears or a step is only re-sent with a new countdown.
            if let before = previous?.interval, let after = incoming.interval,
               previous?.sessionId == incoming.sessionId,
               incoming.status == .recording, after.index != before.index {
                Haptics.step()
            }
            if incoming.status != .recording { clearLiveHeartRate() }
            updateCollection(previous: previous, current: incoming)
        }
    }

    // MARK: - Controls

    func pause() { sendControl("pause") }
    func resume() { sendControl("resume") }
    func finish() { sendControl("finish") }
    func lap() { sendControl("lap") }

    private func sendControl(_ action: String) {
        guard let state else { return }
        WatchSessionManager.shared.sendRecordingControl(sessionId: state.sessionId, action: action)
    }

    // MARK: - Heart rate

    private func updateCollection(previous: RecordingState?, current: RecordingState) {
        switch current.status {
        case .recording:
            if collectingFor != current.sessionId {
                // A strength workout owns the HealthKit session; the
                // recording then runs without heart rate.
                guard !WorkoutSessionStore.shared.isActive,
                      !WatchRunStore.shared.isActive else { return }
                collectingFor = current.sessionId
                // Starting a recording settles any workout still held.
                heldFor = nil
                WorkoutHealthKitController.shared.requestAuthorization { [weak self] _ in
                    Task { @MainActor in
                        // The recording may have finished while the prompt was up.
                        guard let self, self.state?.sessionId == current.sessionId,
                              self.state?.status != .finished else { return }
                        self.healthKit.start(
                            sessionId: current.sessionId,
                            activity: current.activity,
                            indoor: current.indoor
                        )
                    }
                }
            } else if previous?.status == .paused {
                healthKit.resume()
            }
        case .paused:
            if collectingFor == current.sessionId { healthKit.pause() }
        case .finished:
            if collectingFor == current.sessionId { finishCollection(.hold) }
        case .ended:
            break
        }
    }

    /// Shows the reading on the wrist and tells the phone, which shows it on
    /// its recording screen. The phone copy is a live message only (see
    /// `WatchSessionManager.sendRecordingLiveHeartRate`); the batches are what
    /// reach the diary.
    private func receiveLiveHeartRate(_ bpm: Double, at date: Date) {
        guard let state, state.status == .recording,
              collectingFor == state.sessionId, bpm > 0
        else { return }
        liveHeartRate = Int(bpm.rounded())
        staleReadingTask?.cancel()
        staleReadingTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.liveHeartRateMaxAge * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.liveHeartRate = nil
        }
        WatchSessionManager.shared.sendRecordingLiveHeartRate(
            sessionId: state.sessionId,
            bpm: bpm,
            measuredAt: date
        )
    }

    private func clearLiveHeartRate() {
        staleReadingTask?.cancel()
        staleReadingTask = nil
        liveHeartRate = nil
    }

    private func finishCollection(_ outcome: RecordingHealthKitController.Outcome) {
        guard let sessionId = collectingFor else { return }
        collectingFor = nil
        if outcome == .hold { heldFor = sessionId }
        healthKit.stop(outcome) { [weak self] samples in
            Task { @MainActor in self?.sendHeartRate(samples, sessionId: sessionId) }
        }
    }

    private func sendHeartRate(_ samples: [HeartRateSample], sessionId: String? = nil) {
        guard !samples.isEmpty, let id = sessionId ?? collectingFor ?? state?.sessionId else { return }
        WatchSessionManager.shared.sendRecordingHeartRate(
            sessionId: id,
            clientId: UUID().uuidString,
            samples: samples
        )
    }

    private func remember(ended sessionId: String) {
        endedSessionIds.append(sessionId)
        if endedSessionIds.count > 10 { endedSessionIds.removeFirst() }
    }
}
