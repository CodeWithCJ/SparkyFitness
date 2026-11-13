import Foundation

// A saved route the phone handed the watch, and the arithmetic of following it.
// Nothing here imports CoreLocation, WatchConnectivity or SwiftUI: positions
// are plain latitude/longitude doubles and time is passed in, so the whole
// file can be compiled and tested off the watch (see `watch-tests/`).

struct WatchRoutePoint: Codable, Equatable {
    let lat: Double
    let lon: Double
}

/// Raw values are the wire strings of `RouteCueKind` in `@workspace/shared`.
enum WatchRouteCueKind: String, Codable {
    case depart, straight, left, right, uturn, arrive
    case slightLeft = "slight_left"
    case sharpLeft = "sharp_left"
    case slightRight = "slight_right"
    case sharpRight = "sharp_right"
}

/// A turn instruction. `index` is the route point it applies to.
struct WatchRouteCue: Codable, Equatable {
    let index: Int
    let kind: WatchRouteCueKind
    /// The route's own wording ("Turn left onto Mill Lane"); nil uses the kind's.
    let text: String?
}

struct WatchRoute: Codable, Equatable, Identifiable {
    let id: String
    let name: String
    let points: [WatchRoutePoint]
    let cues: [WatchRouteCue]
}

/// Where a live position stands against a route.
struct WatchRouteTracker {
    /// Farther than this from the line counts as off the route...
    static let offRouteMeters: Double = 40
    /// ...once it has lasted this long, so one bad fix or a wide corner does not nag.
    static let offRouteSeconds: TimeInterval = 6
    /// The buzz for a turn comes this far ahead of it.
    static let approachMeters: Double = 50
    /// A cue stays "next" until this far past it.
    static let passedMeters: Double = 15
    /// Within this of the end counts as arrived.
    static let arrivedMeters: Double = 25
    /// Fixes with a worse accuracy radius than this are not trusted.
    static let maxFixAccuracy: Double = 50
    /// How far behind and ahead of the last position the search looks first,
    /// so a loop that passes the same spot twice is followed on the right lap.
    private static let windowBehindMeters: Double = 100
    private static let windowAheadMeters: Double = 500

    struct UpcomingCue: Equatable {
        let cue: WatchRouteCue
        let distanceMeters: Double
    }

    struct Snapshot: Equatable {
        /// Straight-line distance from the position to the nearest point on the route.
        var distanceFromRoute: Double
        /// Metres along the route from the start to where the position projects.
        var progressMeters: Double
        var remainingMeters: Double
        var nextCue: UpcomingCue?
        var isOffRoute: Bool
        var arrived: Bool
    }

    enum Event: Equatable {
        case approachingCue(WatchRouteCue)
        case wentOffRoute
        case backOnRoute
        case arrived
    }

    struct Update: Equatable {
        var snapshot: Snapshot
        var events: [Event]
    }

    let route: WatchRoute
    /// Metres from the start to each point.
    let cumulative: [Double]
    /// Cues in route order, each with its distance from the start.
    private let anchoredCues: [(cue: WatchRouteCue, along: Double)]

    private(set) var progressMeters: Double = 0
    private(set) var isOffRoute = false
    private(set) var hasArrived = false
    private var offRouteSince: Date?
    private var announced: Set<Int> = []

    var totalMeters: Double { cumulative.last ?? 0 }

    /// What a relaunched run needs to carry on where the tracker was, rather
    /// than matching the next fix from the start (which, on a route that
    /// shares geometry with an earlier leg, can jump backward).
    struct State: Codable, Equatable {
        var routeId: String
        var progressMeters: Double
        var isOffRoute: Bool
        var hasArrived: Bool
        var announced: [Int]
        /// A turn cue announced while paused and not yet said. Optional so
        /// a state saved before this existed still decodes.
        var pendingCue: WatchRouteCue?
    }

    var state: State {
        State(
            routeId: route.id,
            progressMeters: progressMeters,
            isOffRoute: isOffRoute,
            hasArrived: hasArrived,
            announced: announced.sorted(),
            pendingCue: nil
        )
    }

    /// Takes back a saved `state`; ignored when it belongs to another route.
    mutating func restore(_ state: State) {
        guard state.routeId == route.id else { return }
        progressMeters = max(0, min(state.progressMeters, totalMeters))
        isOffRoute = state.isOffRoute
        hasArrived = state.hasArrived
        announced = announced.union(state.announced.filter { anchoredCues.indices.contains($0) })
    }

    /// Nil when the route has no line to follow.
    init?(route: WatchRoute) {
        guard route.points.count >= 2 else { return nil }
        self.route = route
        let distances = Self.cumulativeDistances(route.points)
        cumulative = distances
        let last = route.points.count - 1
        anchoredCues = route.cues
            .filter { $0.index >= 0 }
            .sorted { $0.index < $1.index }
            .map { ($0, distances[min($0.index, last)]) }
        // Leaving the start is not worth a buzz.
        announced = Set(anchoredCues.indices.filter { anchoredCues[$0].cue.kind == .depart })
    }

    /// Takes a fix. Nil when its accuracy is too poor to act on.
    mutating func update(lat: Double, lon: Double, accuracy: Double?, at date: Date) -> Update? {
        if let accuracy, accuracy < 0 || accuracy > Self.maxFixAccuracy { return nil }
        let here = WatchRoutePoint(lat: lat, lon: lon)

        // Near where we were first; the whole line only when that is off it.
        let nearby = nearest(to: here, segments: windowSegments())
        let match: Match
        if nearby.distance <= Self.offRouteMeters {
            match = nearby
        } else {
            let anywhere = nearest(to: here, segments: 0..<(route.points.count - 1))
            match = anywhere.distance < nearby.distance ? anywhere : nearby
        }
        let onLine = match.distance <= Self.offRouteMeters
        if onLine { progressMeters = match.along }

        var events: [Event] = []

        // Off route needs the position to stay away for a while; back on is at once.
        if onLine {
            offRouteSince = nil
            if isOffRoute {
                isOffRoute = false
                events.append(.backOnRoute)
            }
        } else {
            let since = offRouteSince ?? date
            offRouteSince = since
            if !isOffRoute, date.timeIntervalSince(since) >= Self.offRouteSeconds {
                isOffRoute = true
                events.append(.wentOffRoute)
            }
        }

        let remaining = max(0, totalMeters - progressMeters)

        // Cues passed without a buzz (a gap in GPS) are not announced late.
        for (i, anchored) in anchoredCues.enumerated() where anchored.along < progressMeters - Self.passedMeters {
            announced.insert(i)
        }
        let next = nextCueIndex()
        if onLine, !isOffRoute, let next, !announced.contains(next) {
            let anchored = anchoredCues[next]
            // The finish has its own event.
            if anchored.cue.kind != .arrive, anchored.along - progressMeters <= Self.approachMeters {
                announced.insert(next)
                events.append(.approachingCue(anchored.cue))
            }
        }

        if onLine, !hasArrived, remaining <= Self.arrivedMeters, progressMeters > 0 {
            hasArrived = true
            events.append(.arrived)
        }

        let snapshot = Snapshot(
            distanceFromRoute: match.distance,
            progressMeters: progressMeters,
            remainingMeters: remaining,
            nextCue: next.map {
                UpcomingCue(cue: anchoredCues[$0].cue, distanceMeters: max(0, anchoredCues[$0].along - progressMeters))
            },
            isOffRoute: isOffRoute,
            arrived: hasArrived
        )
        return Update(snapshot: snapshot, events: events)
    }

    // MARK: - Matching

    private struct Match {
        let distance: Double
        let along: Double
    }

    /// The segments (by start-point index) around the current progress.
    private func windowSegments() -> Range<Int> {
        let count = route.points.count - 1
        var low = 0
        while low < count - 1, cumulative[low + 1] < progressMeters - Self.windowBehindMeters { low += 1 }
        var high = low
        while high < count, cumulative[high] <= progressMeters + Self.windowAheadMeters { high += 1 }
        return low..<max(high, low + 1)
    }

    private func nearest(to point: WatchRoutePoint, segments: Range<Int>) -> Match {
        var best = Match(distance: .infinity, along: 0)
        for i in segments {
            let projected = Self.project(point, onto: route.points[i], route.points[i + 1])
            if projected.distance < best.distance {
                let length = cumulative[i + 1] - cumulative[i]
                best = Match(distance: projected.distance, along: cumulative[i] + projected.t * length)
            }
        }
        return best
    }

    /// First cue not yet passed.
    private func nextCueIndex() -> Int? {
        anchoredCues.firstIndex { $0.along >= progressMeters - Self.passedMeters }
    }

    // MARK: - Geometry

    private static let earthRadius = 6_371_008.8

    /// Metres from the first point to each point along the line.
    static func cumulativeDistances(_ points: [WatchRoutePoint]) -> [Double] {
        guard !points.isEmpty else { return [] }
        var distances = [0.0]
        for i in 1..<points.count {
            distances.append(distances[i - 1] + haversine(points[i - 1], points[i]))
        }
        return distances
    }

    private static func radians(_ degrees: Double) -> Double { degrees * .pi / 180 }

    static func haversine(_ a: WatchRoutePoint, _ b: WatchRoutePoint) -> Double {
        let dLat = radians(b.lat - a.lat)
        let dLon = radians(b.lon - a.lon)
        let h = sin(dLat / 2) * sin(dLat / 2)
            + cos(radians(a.lat)) * cos(radians(b.lat)) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * earthRadius * asin(min(1, sqrt(h)))
    }

    /// Distance from `p` to the segment `a`-`b` and how far along it (0...1) the
    /// nearest point is. A flat approximation around `a`, which is exact enough
    /// at the few hundred metres a segment spans.
    static func project(
        _ p: WatchRoutePoint, onto a: WatchRoutePoint, _ b: WatchRoutePoint
    ) -> (distance: Double, t: Double) {
        let cosLat = cos(radians(a.lat))
        func xy(_ q: WatchRoutePoint) -> (Double, Double) {
            (radians(q.lon - a.lon) * cosLat * earthRadius, radians(q.lat - a.lat) * earthRadius)
        }
        let (px, py) = xy(p)
        let (bx, by) = xy(b)
        let lengthSquared = bx * bx + by * by
        guard lengthSquared > 0 else { return ((px * px + py * py).squareRoot(), 0) }
        let t = max(0, min(1, (px * bx + py * by) / lengthSquared))
        let dx = px - t * bx
        let dy = py - t * by
        return ((dx * dx + dy * dy).squareRoot(), t)
    }
}
