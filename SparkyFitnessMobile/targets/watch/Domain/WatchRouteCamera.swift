import Foundation

/// Where the route map looks while a route is followed: on the wearer, turned
/// so the way ahead points up, and close enough to read the street and the
/// next turn. Pure, so it runs under the Mac test package with the tracker.
struct WatchRouteCamera: Equatable {
    var lat: Double
    var lon: Double
    /// Metres from the ground to the camera (MapKit's `MapCamera.distance`).
    var distance: Double
    /// Degrees clockwise from north that point up the screen; 0 is north up.
    var heading: Double

    /// Zoom with nothing special in view, about 200 m across the watch face.
    static let baseDistance: Double = 450
    /// Furthest the camera pulls back, for a far turn or when off the route.
    static let maxDistance: Double = 1000
    /// How far along the route the heading looks, so a bend does not swing the
    /// map until the wearer is almost at it.
    static let lookAheadMeters: Double = 40

    /// Initial bearing from `a` to `b`, in degrees clockwise from north.
    static func bearing(from a: WatchRoutePoint, to b: WatchRoutePoint) -> Double {
        let lat1 = a.lat * .pi / 180
        let lat2 = b.lat * .pi / 180
        let dLon = (b.lon - a.lon) * .pi / 180
        let y = sin(dLon) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        let degrees = atan2(y, x) * 180 / .pi
        return (degrees + 360).truncatingRemainder(dividingBy: 360)
    }

    /// The route's direction `lookAheadMeters` past `progressMeters`, or nil at
    /// the end of the line.
    static func routeHeading(points: [WatchRoutePoint], cumulative: [Double], progressMeters: Double) -> Double? {
        guard points.count > 1, cumulative.count == points.count else { return nil }
        let from = progressMeters
        let to = progressMeters + lookAheadMeters
        guard from < (cumulative.last ?? 0) else { return nil }
        let start = point(at: from, points: points, cumulative: cumulative)
        let end = point(at: min(to, cumulative.last ?? to), points: points, cumulative: cumulative)
        guard WatchRouteTracker.haversine(start, end) > 1 else { return nil }
        return bearing(from: start, to: end)
    }

    /// The point `meters` along the line.
    static func point(at meters: Double, points: [WatchRoutePoint], cumulative: [Double]) -> WatchRoutePoint {
        if meters <= 0 { return points[0] }
        guard let last = cumulative.last, meters < last else { return points[points.count - 1] }
        var low = 0
        var high = cumulative.count - 1
        while low < high {
            let mid = (low + high + 1) / 2
            if cumulative[mid] <= meters { low = mid } else { high = mid - 1 }
        }
        let next = min(low + 1, points.count - 1)
        let span = cumulative[next] - cumulative[low]
        let t = span > 0 ? (meters - cumulative[low]) / span : 0
        return WatchRoutePoint(
            lat: points[low].lat + (points[next].lat - points[low].lat) * t,
            lon: points[low].lon + (points[next].lon - points[low].lon) * t
        )
    }

    /// Camera for a wearer at `position`. On the route it turns with the route
    /// and pulls back just far enough to keep the next turn on screen; off the
    /// route, at the end, or with no heading it stays north up (the way ahead
    /// is not meaningful) and a little wider.
    static func follow(
        route: WatchRoute,
        cumulative: [Double],
        progress: WatchRouteTracker.Snapshot?,
        position: WatchRoutePoint
    ) -> WatchRouteCamera {
        var camera = WatchRouteCamera(lat: position.lat, lon: position.lon, distance: baseDistance, heading: 0)
        guard let progress else { return camera }
        if progress.isOffRoute {
            camera.distance = 650
            return camera
        }
        if progress.arrived { return camera }
        if let heading = routeHeading(points: route.points, cumulative: cumulative, progressMeters: progress.progressMeters) {
            camera.heading = heading
        }
        if let next = progress.nextCue {
            // The turn sits ahead of the wearer, who is at the centre of the map,
            // so it has to fit in the top half.
            camera.distance = min(maxDistance, max(baseDistance, next.distanceMeters * 4.2))
        }
        return camera
    }

    /// A camera is only worth handing to the map when it has moved enough to
    /// see: every GPS fix would otherwise start a new MapKit animation and
    /// tile load, which costs battery for a shift of a step or two.
    static let minMoveMeters: Double = 8
    static let minHeadingDegrees: Double = 10
    static let minDistanceChangeMeters: Double = 50

    func isWorthMoving(from previous: WatchRouteCamera?) -> Bool {
        guard let previous else { return true }
        let moved = WatchRouteTracker.haversine(
            WatchRoutePoint(lat: previous.lat, lon: previous.lon),
            WatchRoutePoint(lat: lat, lon: lon)
        )
        if moved >= Self.minMoveMeters { return true }
        if abs(distance - previous.distance) >= Self.minDistanceChangeMeters { return true }
        var turn = abs(heading - previous.heading).truncatingRemainder(dividingBy: 360)
        if turn > 180 { turn = 360 - turn }
        return turn >= Self.minHeadingDegrees
    }

    /// The map area for the overview page: the whole route, plus the wearer
    /// while off the route so the dot stays on screen, with room for the clock
    /// above and the footer below.
    struct Overview: Equatable {
        var centerLat: Double
        var centerLon: Double
        var latSpan: Double
        var lonSpan: Double
    }

    /// Smallest span, about 450 m, so a very short route is not zoomed to a blur.
    static let minOverviewSpan: Double = 0.004

    static func overview(points: [WatchRoutePoint], extra: WatchRoutePoint?) -> Overview {
        var lats = points.map(\.lat)
        var lons = points.map(\.lon)
        if let extra {
            lats.append(extra.lat)
            lons.append(extra.lon)
        }
        let minLat = lats.min() ?? 0
        let maxLat = lats.max() ?? 0
        let minLon = lons.min() ?? 0
        let maxLon = lons.max() ?? 0
        return Overview(
            centerLat: (minLat + maxLat) / 2,
            centerLon: (minLon + maxLon) / 2,
            latSpan: max((maxLat - minLat) * 1.7, minOverviewSpan),
            lonSpan: max((maxLon - minLon) * 1.4, minOverviewSpan)
        )
    }
}
