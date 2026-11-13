import XCTest
@testable import WatchRoute

final class WatchRouteTrackerTests: XCTestCase {
    private let originLat = 51.5
    private let originLon = -0.12
    private let metersPerDegreeLat = 111_195.0
    private var metersPerDegreeLon: Double { metersPerDegreeLat * cos(originLat * .pi / 180) }

    /// A point `east`/`north` metres from the origin.
    private func at(_ east: Double, _ north: Double) -> WatchRoutePoint {
        WatchRoutePoint(lat: originLat + north / metersPerDegreeLat, lon: originLon + east / metersPerDegreeLon)
    }

    /// 400 m north, then 400 m east, a point every 10 m, with a right turn at 400 m.
    private func lRoute(cues: [WatchRouteCue]? = nil) -> WatchRoute {
        var points: [WatchRoutePoint] = []
        for i in 0...40 { points.append(at(0, Double(i) * 10)) }
        for i in 1...40 { points.append(at(Double(i) * 10, 400)) }
        let defaults = [
            WatchRouteCue(index: 0, kind: .depart, text: nil),
            WatchRouteCue(index: 40, kind: .right, text: nil),
            WatchRouteCue(index: 80, kind: .arrive, text: nil),
        ]
        return WatchRoute(id: "l", name: "L", points: points, cues: cues ?? defaults)
    }

    private let t0 = Date(timeIntervalSince1970: 1_000_000)

    private func tracker(_ route: WatchRoute? = nil) -> WatchRouteTracker {
        WatchRouteTracker(route: route ?? lRoute())!
    }

    func testNeedsTwoPoints() {
        XCTAssertNil(WatchRouteTracker(route: WatchRoute(id: "x", name: "x", points: [at(0, 0)], cues: [])))
    }

    func testTotalLengthIsTheLine() {
        XCTAssertEqual(tracker().totalMeters, 800, accuracy: 3)
    }

    func testProgressAndRemainingOnTheLine() throws {
        var t = tracker()
        let update = try XCTUnwrap(t.update(lat: at(0, 200).lat, lon: at(0, 200).lon, accuracy: 5, at: t0))
        XCTAssertEqual(update.snapshot.progressMeters, 200, accuracy: 3)
        XCTAssertEqual(update.snapshot.remainingMeters, 600, accuracy: 5)
        XCTAssertEqual(update.snapshot.distanceFromRoute, 0, accuracy: 1)
        XCTAssertFalse(update.snapshot.isOffRoute)
    }

    func testNextCueAndItsDistance() throws {
        var t = tracker()
        let update = try XCTUnwrap(t.update(lat: at(0, 250).lat, lon: at(0, 250).lon, accuracy: 5, at: t0))
        XCTAssertEqual(update.snapshot.nextCue?.cue.kind, .right)
        XCTAssertEqual(update.snapshot.nextCue?.distanceMeters ?? 0, 150, accuracy: 4)
    }

    func testNextCueMovesOnOnceItIsPassed() throws {
        var t = tracker()
        _ = t.update(lat: at(0, 395).lat, lon: at(0, 395).lon, accuracy: 5, at: t0)
        // Well past the corner, on the second leg.
        let update = try XCTUnwrap(t.update(lat: at(100, 400).lat, lon: at(100, 400).lon, accuracy: 5, at: t0 + 10))
        XCTAssertEqual(update.snapshot.nextCue?.cue.kind, .arrive)
    }

    func testApproachingBuzzesOnceInsideFiftyMetres() throws {
        var t = tracker()
        let far = try XCTUnwrap(t.update(lat: at(0, 300).lat, lon: at(0, 300).lon, accuracy: 5, at: t0))
        XCTAssertEqual(far.events, [])
        let near = try XCTUnwrap(t.update(lat: at(0, 355).lat, lon: at(0, 355).lon, accuracy: 5, at: t0 + 1))
        XCTAssertEqual(near.events, [.approachingCue(WatchRouteCue(index: 40, kind: .right, text: nil))])
        let closer = try XCTUnwrap(t.update(lat: at(0, 380).lat, lon: at(0, 380).lon, accuracy: 5, at: t0 + 2))
        XCTAssertEqual(closer.events, [])
    }

    func testDepartAndArriveDoNotBuzzAsCues() throws {
        var t = tracker()
        let start = try XCTUnwrap(t.update(lat: at(0, 5).lat, lon: at(0, 5).lon, accuracy: 5, at: t0))
        XCTAssertEqual(start.events, [])
        _ = t.update(lat: at(0, 395).lat, lon: at(0, 395).lon, accuracy: 5, at: t0 + 1)
        let nearEnd = try XCTUnwrap(t.update(lat: at(370, 400).lat, lon: at(370, 400).lon, accuracy: 5, at: t0 + 2))
        XCTAssertFalse(nearEnd.events.contains { if case .approachingCue = $0 { return true } else { return false } })
    }

    func testArrivalIsReportedOnce() throws {
        var t = tracker()
        _ = t.update(lat: at(0, 395).lat, lon: at(0, 395).lon, accuracy: 5, at: t0)
        let end = try XCTUnwrap(t.update(lat: at(390, 400).lat, lon: at(390, 400).lon, accuracy: 5, at: t0 + 1))
        XCTAssertTrue(end.events.contains(.arrived))
        XCTAssertTrue(end.snapshot.arrived)
        let again = try XCTUnwrap(t.update(lat: at(395, 400).lat, lon: at(395, 400).lon, accuracy: 5, at: t0 + 2))
        XCTAssertFalse(again.events.contains(.arrived))
    }

    func testOffRouteNeedsToLastSeveralSeconds() throws {
        var t = tracker()
        let away = at(80, 200) // 80 m east of the first leg
        let first = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0))
        XCTAssertEqual(first.snapshot.distanceFromRoute, 80, accuracy: 3)
        XCTAssertFalse(first.snapshot.isOffRoute)
        let brief = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 4))
        XCTAssertFalse(brief.snapshot.isOffRoute)
        XCTAssertEqual(brief.events, [])
        let sustained = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 6))
        XCTAssertTrue(sustained.snapshot.isOffRoute)
        XCTAssertEqual(sustained.events, [.wentOffRoute])
        // Said once, not on every fix.
        let still = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 7))
        XCTAssertEqual(still.events, [])
    }

    func testReturningClearsOffRouteAtOnce() throws {
        var t = tracker()
        let away = at(80, 200)
        _ = t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0)
        _ = t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 7)
        let back = try XCTUnwrap(t.update(lat: at(10, 210).lat, lon: at(10, 210).lon, accuracy: 5, at: t0 + 8))
        XCTAssertFalse(back.snapshot.isOffRoute)
        XCTAssertEqual(back.events, [.backOnRoute])
    }

    func testABriefStrayResetsTheTimer() throws {
        var t = tracker()
        let away = at(80, 200)
        _ = t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0)
        _ = t.update(lat: at(0, 205).lat, lon: at(0, 205).lon, accuracy: 5, at: t0 + 4)
        let again = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 8))
        XCTAssertFalse(again.snapshot.isOffRoute)
    }

    func testPoorFixesAreIgnored() {
        var t = tracker()
        XCTAssertNil(t.update(lat: at(0, 100).lat, lon: at(0, 100).lon, accuracy: 120, at: t0))
        XCTAssertNil(t.update(lat: at(0, 100).lat, lon: at(0, 100).lon, accuracy: -1, at: t0))
        XCTAssertNotNil(t.update(lat: at(0, 100).lat, lon: at(0, 100).lon, accuracy: nil, at: t0))
    }

    func testProgressHoldsWhileOffRoute() throws {
        var t = tracker()
        _ = t.update(lat: at(0, 200).lat, lon: at(0, 200).lon, accuracy: 5, at: t0)
        let away = at(200, 100)
        let off = try XCTUnwrap(t.update(lat: away.lat, lon: away.lon, accuracy: 5, at: t0 + 1))
        XCTAssertEqual(off.snapshot.progressMeters, 200, accuracy: 3)
    }

    func testALoopIsFollowedOnTheRightLap() throws {
        // A 200 x 100 m rectangle: the route ends where it began, so the end of
        // the line must not be mistaken for its start.
        var points: [WatchRoutePoint] = []
        for i in 0...20 { points.append(at(0, Double(i) * 10)) }
        for i in 1...10 { points.append(at(Double(i) * 10, 200)) }
        for i in 1...20 { points.append(at(100, 200 - Double(i) * 10)) }
        for i in 1...10 { points.append(at(100 - Double(i) * 10, 0)) }
        var t = WatchRouteTracker(route: WatchRoute(id: "loop", name: "Loop", points: points, cues: []))!
        // Walk the whole thing so progress is carried.
        for p in points.dropFirst() {
            _ = t.update(lat: p.lat, lon: p.lon, accuracy: 5, at: t0)
        }
        XCTAssertEqual(t.progressMeters, t.totalMeters, accuracy: 5)
    }

    func testRejoiningFurtherAlongTheRouteJumpsThere() throws {
        var t = tracker()
        _ = t.update(lat: at(0, 100).lat, lon: at(0, 100).lon, accuracy: 5, at: t0)
        // A shortcut: next seen 700 m along, well outside the search window.
        let rejoin = at(300, 400)
        let update = try XCTUnwrap(t.update(lat: rejoin.lat, lon: rejoin.lon, accuracy: 5, at: t0 + 5))
        XCTAssertEqual(update.snapshot.progressMeters, 700, accuracy: 5)
        XCTAssertFalse(update.snapshot.isOffRoute)
    }

    func testCumulativeDistancesStartAtZeroAndGrow() {
        let distances = WatchRouteTracker.cumulativeDistances(lRoute().points)
        XCTAssertEqual(distances.count, 81)
        XCTAssertEqual(distances.first, 0)
        XCTAssertEqual(distances[40], 400, accuracy: 2)
        XCTAssertEqual(WatchRouteTracker.cumulativeDistances([]), [])
    }
}
