import Foundation

/// A pace range to run inside, in seconds per kilometre (`min` the fastest
/// allowed, `max` the slowest), and the rule for when to tell the runner they
/// are outside it. A Swift port of `paceTargets.ts` in `@workspace/shared`:
/// the constants and the logic must stay in step with it.
struct WatchPaceBand: Codable, Equatable {
    var minSecondsPerKm: Double
    var maxSecondsPerKm: Double

    /// What the setup screen offers before the wearer moves anything: 5:00 to
    /// 5:30 per kilometre.
    static let standard = WatchPaceBand(minSecondsPerKm: 300, maxSecondsPerKm: 330)

    static let fastest = 120.0
    static let slowest = 1200.0
    static let minWidth = 10.0

    /// The band when it is usable, else nil.
    static func normalized(min: Double?, max: Double?) -> WatchPaceBand? {
        guard let min, let max, min.isFinite, max.isFinite else { return nil }
        guard min >= fastest, max <= slowest, max - min >= minWidth else { return nil }
        return WatchPaceBand(minSecondsPerKm: min.rounded(), maxSecondsPerKm: max.rounded())
    }
}

enum WatchPaceAlertKind: Equatable {
    case tooFast, tooSlow
}

struct WatchPaceAlertState: Equatable {
    var side: WatchPaceAlertKind?
    var outsideSince: TimeInterval?
    var lastAlertAt: TimeInterval?

    static let initial = WatchPaceAlertState(side: nil, outsideSince: nil, lastAlertAt: nil)

    /// Pace may stray this far past an edge (share of it) before it counts.
    static let margin = 0.03
    /// It must stay outside this long before the first alert.
    static let sustain: TimeInterval = 8
    /// While it stays outside, repeat no more often than this.
    static let repeatGap: TimeInterval = 30

    /// One reading at `now` (any steady clock, seconds). `pace` is the current
    /// pace in seconds per km, nil when there is not enough to tell, which
    /// changes nothing.
    mutating func step(pace: Double?, band: WatchPaceBand, now: TimeInterval) -> WatchPaceAlertKind? {
        guard let pace, pace > 0 else { return nil }
        var side: WatchPaceAlertKind?
        if pace < band.minSecondsPerKm * (1 - Self.margin) {
            side = .tooFast
        } else if pace > band.maxSecondsPerKm * (1 + Self.margin) {
            side = .tooSlow
        }
        guard let side else {
            self = WatchPaceAlertState(side: nil, outsideSince: nil, lastAlertAt: lastAlertAt)
            return nil
        }
        // Crossing to the other side starts the wait and the repeat gap again.
        let sameSide = self.side == side && outsideSince != nil
        let since = sameSide ? outsideSince! : now
        let last = sameSide ? lastAlertAt : nil
        let sustained = now - since >= Self.sustain
        let rested = last == nil || now - last! >= Self.repeatGap
        if sustained && rested {
            self = WatchPaceAlertState(side: side, outsideSince: since, lastAlertAt: now)
            return side
        }
        self = WatchPaceAlertState(side: side, outsideSince: since, lastAlertAt: last)
        return nil
    }
}

/// Pace over the last half minute of a run, from the distance the builder
/// reports against active time. Pauses never count (the clock is the
/// builder's), and nothing is said until there is a few seconds and metres to
/// judge by.
struct WatchRecentPace {
    private var samples: [(elapsed: TimeInterval, meters: Double)] = []

    static let window: TimeInterval = 30
    static let minSeconds: TimeInterval = 10
    static let minMeters = 20.0

    mutating func reset() { samples.removeAll() }

    /// Adds a reading and returns the pace in seconds per km, or nil.
    mutating func add(elapsed: TimeInterval, meters: Double) -> Double? {
        if let last = samples.last, elapsed < last.elapsed { samples.removeAll() }
        samples.append((elapsed, meters))
        samples.removeAll { elapsed - $0.elapsed > Self.window }
        guard let first = samples.first else { return nil }
        let seconds = elapsed - first.elapsed
        let moved = meters - first.meters
        guard seconds >= Self.minSeconds, moved >= Self.minMeters else { return nil }
        return seconds / moved * 1000
    }
}
