import Foundation

/// Decides when an indoor (treadmill) wrist recording should pause itself
/// because the wearer stopped stepping, and when to carry on. Indoors there is
/// no GPS speed, so this works from the pedometer's running step count. The
/// stop time matches the outdoor detector (`WatchAutoPause`).
///
/// Fed both when the pedometer reports and once a second by a timer, because
/// a standing wearer produces no pedometer updates at all.
struct WatchIndoorAutoPause {
    /// Steps taken after an auto-pause that count as moving again: about
    /// three seconds of walking.
    static let resumeSteps = 5

    private static func stoppedFor(_ kind: WatchRunKind) -> TimeInterval {
        switch kind {
        case .walk: return 10
        case .run: return 8
        // A jump rope reads as steps on the pedometer, so stopping the rope
        // stops the count and pauses it like a run.
        case .jumpRope: return 8
        }
    }

    private var lastSteps: Int?
    private var lastChange: Date?
    private var pausedBaseline: Int?

    mutating func reset() {
        lastSteps = nil
        lastChange = nil
        pausedBaseline = nil
    }

    /// `steps` is the cumulative count since the recording began; `paused`
    /// says whether the recording is currently auto-paused.
    mutating func step(
        steps: Int,
        at time: Date,
        kind: WatchRunKind,
        paused: Bool
    ) -> WatchAutoPause.Action {
        if lastSteps == nil {
            lastSteps = steps
            lastChange = time
        }
        if !paused {
            pausedBaseline = nil
            if steps > (lastSteps ?? steps) {
                lastSteps = steps
                lastChange = time
                return .none
            }
            guard let since = lastChange,
                  time.timeIntervalSince(since) >= Self.stoppedFor(kind) else { return .none }
            reset()
            return .pause
        }

        let baseline = pausedBaseline ?? steps
        pausedBaseline = baseline
        guard steps - baseline >= Self.resumeSteps else { return .none }
        reset()
        return .resume
    }
}
