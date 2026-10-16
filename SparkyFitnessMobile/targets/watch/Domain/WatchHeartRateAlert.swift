import Foundation

/// A heart-rate range to stay inside, in beats per minute, and the rule for
/// when to tell the wearer they are outside it. A Swift port of
/// `heartRateTargets.ts` in `@workspace/shared`: the constants and the logic
/// must stay in step with it. Heart rate lags effort, so it waits longer than
/// the pace alert.
struct WatchHeartRateBand: Codable, Equatable {
    var minBpm: Double
    var maxBpm: Double

    /// What the setup screen offers before the wearer moves anything.
    static let standard = WatchHeartRateBand(minBpm: 130, maxBpm: 150)

    static let lowest = 40.0
    static let highest = 220.0
    static let minWidth = 10.0

    /// The band when it is usable, else nil.
    static func normalized(min: Double?, max: Double?) -> WatchHeartRateBand? {
        guard let min, let max, min.isFinite, max.isFinite else { return nil }
        guard min >= lowest, max <= highest, max - min >= minWidth else { return nil }
        return WatchHeartRateBand(minBpm: min.rounded(), maxBpm: max.rounded())
    }
}

enum WatchHeartRateAlertKind: Equatable {
    case tooHigh, tooLow
}

struct WatchHeartRateAlertState: Equatable {
    var side: WatchHeartRateAlertKind?
    var outsideSince: TimeInterval?
    var lastAlertAt: TimeInterval?

    static let initial = WatchHeartRateAlertState(side: nil, outsideSince: nil, lastAlertAt: nil)

    /// A reading may stray this many bpm past an edge before it counts.
    static let marginBpm = 2.0
    /// It must stay outside this long before the first alert.
    static let sustain: TimeInterval = 15
    /// While it stays outside, repeat no more often than this.
    static let repeatGap: TimeInterval = 45

    /// One reading at `now` (any steady clock, seconds). `bpm` is nil when
    /// there is none, which changes nothing.
    mutating func step(bpm: Double?, band: WatchHeartRateBand, now: TimeInterval) -> WatchHeartRateAlertKind? {
        guard let bpm, bpm > 0 else { return nil }
        var side: WatchHeartRateAlertKind?
        if bpm > band.maxBpm + Self.marginBpm {
            side = .tooHigh
        } else if bpm < band.minBpm - Self.marginBpm {
            side = .tooLow
        }
        guard let side else {
            self = WatchHeartRateAlertState(side: nil, outsideSince: nil, lastAlertAt: lastAlertAt)
            return nil
        }
        // Crossing to the other side starts the wait and the repeat gap again.
        let sameSide = self.side == side && outsideSince != nil
        let since = sameSide ? outsideSince! : now
        let last = sameSide ? lastAlertAt : nil
        let sustained = now - since >= Self.sustain
        let rested = last == nil || now - last! >= Self.repeatGap
        if sustained && rested {
            self = WatchHeartRateAlertState(side: side, outsideSince: since, lastAlertAt: now)
            return side
        }
        self = WatchHeartRateAlertState(side: side, outsideSince: since, lastAlertAt: last)
        return nil
    }
}
