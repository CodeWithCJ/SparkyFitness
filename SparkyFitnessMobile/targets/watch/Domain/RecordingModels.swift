import Foundation

/// The kind of GPS recording the phone is making. Raw values are wire strings
/// (`WatchRecordingStatePayload.activity` in
/// `modules/watch-connectivity/index.ts`).
enum RecordingActivity: String {
    case walk, run, ride

    var title: String {
        switch self {
        case .walk: return String(localized: "watch.activity.walk", defaultValue: "Walk")
        case .run: return String(localized: "watch.activity.run", defaultValue: "Run")
        case .ride: return String(localized: "watch.activity.ride", defaultValue: "Ride")
        }
    }

    var symbol: String {
        switch self {
        case .walk: return "figure.walk"
        case .run: return "figure.run"
        case .ride: return "bicycle"
        }
    }
}

/// Raw values are wire strings. `ended` is never held: it means the phone
/// saved or discarded the recording and the watch should let go of it.
enum RecordingStatus: String {
    case recording, paused, finished, ended
}

/// What the phone last said about a GPS recording. The phone records the
/// route; the watch shows this and sends controls and heart rate back.
struct RecordingState: Equatable {
    let sessionId: String
    let activity: RecordingActivity
    /// A treadmill or other indoor session. False from an older phone, which recorded outdoors.
    var indoor: Bool = false
    let status: RecordingStatus
    let startedAt: Date
    /// Time spent paused before the current pause, in milliseconds.
    let pausedMs: Double
    /// While paused, when the pause began. For a finished recording, when it
    /// ended. Nil while recording.
    let pausedAt: Date?
    let distanceMeters: Double
    /// Seconds per km or mile in the phone's unit. Nil when not known yet.
    let paceSeconds: Double?
    let usesMiles: Bool
    /// Phone clock (epoch ms) when this was sent, so a queued message that
    /// arrives after a newer live one is ignored.
    let sentAt: Double
    /// Laps marked so far. Zero from an older phone build that does not say.
    var lapCount: Int = 0
    /// The interval plan's current step, when the recording follows a plan.
    /// Nil without a plan or from an older phone build. `index` is the
    /// plan's step count once every step is done.
    var interval: IntervalStep?

    /// The clock the wearer sees, with pauses removed. Runs on the watch
    /// between phone updates.
    func elapsed(at now: Date) -> TimeInterval {
        let end = status == .recording ? now : (pausedAt ?? now)
        return max(0, end.timeIntervalSince(startedAt) - pausedMs / 1000)
    }

    var distanceText: String {
        let unitMeters = usesMiles ? 1609.344 : 1000.0
        return String(format: "%.2f", distanceMeters / unitMeters)
    }

    var distanceUnitText: String { usesMiles ? "mi" : "km" }

    var paceText: String {
        guard let paceSeconds, paceSeconds > 0, paceSeconds < 3600 else { return "--:--" }
        let total = Int(paceSeconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    var paceUnitText: String { usesMiles ? "/mi" : "/km" }

    static func clock(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }
}

/// Where an interval plan stands, as the phone last said. The step changes
/// are the phone's call; the watch counts down locally between updates.
struct IntervalStep: Equatable {
    let index: Int
    /// Already worded for the wearer, e.g. "Run" or "Walk".
    let label: String
    /// Seconds left in the step when the phone sent it.
    let remaining: TimeInterval
    /// "Walk 1:30", or nil on the last step.
    let next: String?

    /// Seconds left now. Frozen while paused or finished, since the plan
    /// follows the recording's clock rather than the wall clock.
    func remaining(in state: RecordingState, at now: Date) -> TimeInterval {
        guard state.status == .recording else { return remaining }
        let sent = Date(timeIntervalSince1970: state.sentAt / 1000)
        return max(0, remaining - max(0, now.timeIntervalSince(sent)))
    }
}

/// What a `recordingState` message means for the watch.
enum RecordingUpdate: Equatable {
    case state(RecordingState)
    /// The phone saved or discarded this recording. `discarded` is false when
    /// it was saved, and also when an older phone build did not say.
    case ended(sessionId: String, sentAt: Double, discarded: Bool)
}
