import XCTest
@testable import WatchRoute

final class WatchRouteCameraTests: XCTestCase {
    private let originLat = 51.5
    private let originLon = -0.12
    private let metersPerDegreeLat = 111_195.0
    private var metersPerDegreeLon: Double { metersPerDegreeLat * cos(originLat * .pi / 180) }

    private func at(_ east: Double, _ north: Double) -> WatchRoutePoint {
        WatchRoutePoint(lat: originLat + north / metersPerDegreeLat, lon: originLon + east / metersPerDegreeLon)
    }

    /// 400 m north, then 400 m east, a point every 10 m.
    private func lRoute() -> WatchRoute {
        var points: [WatchRoutePoint] = []
        for i in 0...40 { points.append(at(0, Double(i) * 10)) }
        for i in 1...40 { points.append(at(Double(i) * 10, 400)) }
        return WatchRoute(id: "l", name: "L", points: points, cues: [
            WatchRouteCue(index: 40, kind: .right, text: nil),
        ])
    }

    private func snapshot(
        progress: Double,
        off: Bool = false,
        arrived: Bool = false,
        cueMeters: Double? = nil
    ) -> WatchRouteTracker.Snapshot {
        WatchRouteTracker.Snapshot(
            distanceFromRoute: off ? 80 : 2,
            progressMeters: progress,
            remainingMeters: 800 - progress,
            nextCue: cueMeters.map {
                WatchRouteTracker.UpcomingCue(cue: WatchRouteCue(index: 40, kind: .right, text: nil), distanceMeters: $0)
            },
            isOffRoute: off,
            arrived: arrived
        )
    }

    private func camera(_ snapshot: WatchRouteTracker.Snapshot?, position: WatchRoutePoint? = nil) -> WatchRouteCamera {
        let route = lRoute()
        return WatchRouteCamera.follow(
            route: route,
            cumulative: WatchRouteTracker.cumulativeDistances(route.points),
            progress: snapshot,
            position: position ?? at(0, 100)
        )
    }

    func testBearingOfTheCompassPoints() {
        let origin = at(0, 0)
        XCTAssertEqual(WatchRouteCamera.bearing(from: origin, to: at(0, 100)), 0, accuracy: 0.5)
        XCTAssertEqual(WatchRouteCamera.bearing(from: origin, to: at(100, 0)), 90, accuracy: 0.5)
        XCTAssertEqual(WatchRouteCamera.bearing(from: origin, to: at(0, -100)), 180, accuracy: 0.5)
        XCTAssertEqual(WatchRouteCamera.bearing(from: origin, to: at(-100, 0)), 270, accuracy: 0.5)
    }

    func testHeadsAlongTheRouteAheadOfTheWearer() {
        XCTAssertEqual(camera(snapshot(progress: 100, cueMeters: 300)).heading, 0, accuracy: 1)
        // On the eastbound leg the map turns to point east.
        XCTAssertEqual(camera(snapshot(progress: 500)).heading, 90, accuracy: 1)
    }

    func testBendIsNotTakenUntilItIsAlmostReached() {
        XCTAssertEqual(camera(snapshot(progress: 300)).heading, 0, accuracy: 1)
        XCTAssertGreaterThan(camera(snapshot(progress: 395)).heading, 30)
    }

    func testCentersOnTheWearer() {
        let here = at(0, 123)
        let result = camera(snapshot(progress: 123), position: here)
        XCTAssertEqual(result.lat, here.lat)
        XCTAssertEqual(result.lon, here.lon)
    }

    func testZoomsToAboutTwoHundredMetresWhenTheTurnIsNear() {
        XCTAssertEqual(camera(snapshot(progress: 380, cueMeters: 20)).distance, WatchRouteCamera.baseDistance)
    }

    func testPullsBackForAFarTurnButNotPastTheLimit() {
        let mid = camera(snapshot(progress: 100, cueMeters: 200)).distance
        XCTAssertGreaterThan(mid, WatchRouteCamera.baseDistance)
        XCTAssertEqual(camera(snapshot(progress: 0, cueMeters: 5000)).distance, WatchRouteCamera.maxDistance)
    }

    func testNorthUpWhenOffRouteArrivedOrWithoutAFix() {
        XCTAssertEqual(camera(snapshot(progress: 500, off: true)).heading, 0)
        XCTAssertGreaterThan(camera(snapshot(progress: 500, off: true)).distance, WatchRouteCamera.baseDistance)
        XCTAssertEqual(camera(snapshot(progress: 800, arrived: true)).heading, 0)
        XCTAssertEqual(camera(nil).heading, 0)
    }

    func testNoHeadingPastTheEndOfTheLine() {
        let route = lRoute()
        let cumulative = WatchRouteTracker.cumulativeDistances(route.points)
        XCTAssertNil(WatchRouteCamera.routeHeading(points: route.points, cumulative: cumulative, progressMeters: 900))
    }

    func testSmallShiftsDoNotMoveTheMap() {
        let base = WatchRouteCamera(lat: originLat, lon: originLon, distance: 450, heading: 0)
        XCTAssertTrue(base.isWorthMoving(from: nil))
        var near = base
        near.lat += 3 / metersPerDegreeLat
        near.heading = 5
        XCTAssertFalse(near.isWorthMoving(from: base))
        var moved = base
        moved.lat += 12 / metersPerDegreeLat
        XCTAssertTrue(moved.isWorthMoving(from: base))
        var zoomed = base
        zoomed.distance = 520
        XCTAssertTrue(zoomed.isWorthMoving(from: base))
    }

    func testHeadingChangeWrapsAroundNorth() {
        var a = WatchRouteCamera(lat: originLat, lon: originLon, distance: 450, heading: 355)
        var b = a
        b.heading = 3
        XCTAssertFalse(b.isWorthMoving(from: a))
        b.heading = 20
        XCTAssertTrue(b.isWorthMoving(from: a))
        a.heading = 0
        b.heading = 350
        XCTAssertTrue(b.isWorthMoving(from: a))
    }

    func testOverviewCoversTheRouteWithMargin() {
        let route = lRoute()
        let area = WatchRouteCamera.overview(points: route.points, extra: nil)
        let corner = at(400, 400)
        XCTAssertEqual(area.centerLat, (at(0, 0).lat + corner.lat) / 2, accuracy: 1e-9)
        XCTAssertEqual(area.centerLon, (at(0, 0).lon + corner.lon) / 2, accuracy: 1e-9)
        XCTAssertEqual(area.latSpan, (corner.lat - at(0, 0).lat) * 1.7, accuracy: 1e-9)
        XCTAssertEqual(area.lonSpan, (corner.lon - at(0, 0).lon) * 1.4, accuracy: 1e-9)
    }

    func testOverviewIncludesAWearerWhoIsOffTheRoute() {
        let far = at(2000, 0)
        let area = WatchRouteCamera.overview(points: lRoute().points, extra: far)
        XCTAssertGreaterThan(area.lonSpan, (far.lon - at(0, 0).lon) * 1.4 - 1e-9)
        XCTAssertGreaterThan(area.centerLon, at(400, 0).lon)
    }

    func testOverviewOfOnePointKeepsAMinimumSpan() {
        let area = WatchRouteCamera.overview(points: [at(0, 0)], extra: nil)
        XCTAssertEqual(area.latSpan, WatchRouteCamera.minOverviewSpan)
        XCTAssertEqual(area.lonSpan, WatchRouteCamera.minOverviewSpan)
    }
}
