import Foundation

/// Decides, fix by fix, when an outdoor wrist recording should pause itself
/// because the wearer stopped and when it should carry on. A port of the
/// phone's `stepAutoPause` (`src/utils/autoPause.ts`); keep the thresholds
/// the same so a recording behaves alike on either device.
struct WatchAutoPause {
    enum Action: Equatable {
        case none
        case pause
        case resume
    }

    private struct Profile {
        let stoppedBelowMps: Double
        let movingAboveMps: Double
        let stoppedFor: TimeInterval
        let movingFor: TimeInterval
    }

    // The resume threshold sits well above the stop one so a shuffle at the
    // lights does not flip the recording back and forth.
    private static func profile(for kind: WatchRunKind) -> Profile {
        switch kind {
        case .walk: return Profile(stoppedBelowMps: 0.4, movingAboveMps: 0.9, stoppedFor: 10, movingFor: 3)
        case .run: return Profile(stoppedBelowMps: 0.6, movingAboveMps: 1.5, stoppedFor: 8, movingFor: 3)
        }
    }

    /// A fix with a worse accuracy radius than this says nothing about speed.
    static let maxAccuracyMeters = 30.0

    private var stoppedSince: Date?
    private var movingSince: Date?

    mutating func reset() {
        stoppedSince = nil
        movingSince = nil
    }

    /// Feeds one reading. `speed` is metres per second, negative when the
    /// receiver has none; `paused` is whether the recording is currently
    /// auto-paused.
    mutating func step(
        speed: Double,
        accuracy: Double,
        at time: Date,
        kind: WatchRunKind,
        paused: Bool
    ) -> Action {
        guard speed >= 0, accuracy >= 0, accuracy <= Self.maxAccuracyMeters else { return .none }
        let profile = Self.profile(for: kind)

        if !paused {
            movingSince = nil
            guard speed < profile.stoppedBelowMps else {
                stoppedSince = nil
                return .none
            }
            let since = stoppedSince ?? time
            stoppedSince = since
            if time.timeIntervalSince(since) >= profile.stoppedFor {
                reset()
                return .pause
            }
            return .none
        }

        stoppedSince = nil
        guard speed >= profile.movingAboveMps else {
            movingSince = nil
            return .none
        }
        let since = movingSince ?? time
        movingSince = since
        if time.timeIntervalSince(since) >= profile.movingFor {
            reset()
            return .resume
        }
        return .none
    }
}
