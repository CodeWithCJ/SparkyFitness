import XCTest
@testable import WatchRoute

final class WatchRouteLibraryTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_000_000)

    private func route(_ id: String, name: String? = nil) -> WatchRoute {
        WatchRoute(
            id: id,
            name: name ?? id,
            points: [WatchRoutePoint(lat: 51.5, lon: -0.12), WatchRoutePoint(lat: 51.51, lon: -0.12)],
            cues: []
        )
    }

    func testAddStoresANewRoute() {
        var library = WatchRouteLibrary()
        XCTAssertEqual(library.add(route("a"), updatedAt: 10, now: now), .added)
        XCTAssertEqual(library.entries.map(\.id), ["a"])
        XCTAssertEqual(library.route(id: "a")?.updatedAt, 10)
    }

    func testNewerRevisionReplacesTheStoredRoute() {
        var library = WatchRouteLibrary()
        _ = library.add(route("a", name: "Old"), updatedAt: 10, now: now)
        XCTAssertEqual(library.add(route("a", name: "New"), updatedAt: 20, now: now), .replaced)
        XCTAssertEqual(library.entries.count, 1)
        XCTAssertEqual(library.route(id: "a")?.route.name, "New")
        XCTAssertEqual(library.route(id: "a")?.updatedAt, 20)
    }

    func testSameOrOlderRevisionChangesNothing() {
        var library = WatchRouteLibrary()
        _ = library.add(route("a", name: "Current"), updatedAt: 20, now: now)
        XCTAssertEqual(library.add(route("a", name: "Again"), updatedAt: 20, now: now), .unchanged)
        XCTAssertEqual(library.add(route("a", name: "Stale"), updatedAt: 5, now: now), .unchanged)
        XCTAssertEqual(library.route(id: "a")?.route.name, "Current")
    }

    func testFullLibraryRefusesANewRouteButStillReplacesAStoredOne() {
        var library = WatchRouteLibrary()
        for index in 0..<WatchRouteLibrary.capacity {
            XCTAssertEqual(library.add(route("r\(index)"), updatedAt: 1, now: now), .added)
        }
        XCTAssertTrue(library.isFull)
        XCTAssertEqual(library.add(route("extra"), updatedAt: 1, now: now), .full)
        XCTAssertNil(library.route(id: "extra"))
        XCTAssertEqual(library.entries.count, WatchRouteLibrary.capacity)
        // Nothing was dropped to make room.
        XCTAssertNotNil(library.route(id: "r0"))
        XCTAssertEqual(library.add(route("r3", name: "Edited"), updatedAt: 2, now: now), .replaced)
        XCTAssertEqual(library.entries.count, WatchRouteLibrary.capacity)
    }

    func testRoomOpensAgainAfterARemoval() {
        var library = WatchRouteLibrary()
        for index in 0..<WatchRouteLibrary.capacity { _ = library.add(route("r\(index)"), updatedAt: 1, now: now) }
        XCTAssertTrue(library.remove(id: "r4", followingId: nil))
        XCTAssertEqual(library.add(route("extra"), updatedAt: 1, now: now), .added)
    }

    func testRemoveDeletesAndIgnoresAnUnknownId() {
        var library = WatchRouteLibrary()
        _ = library.add(route("a"), updatedAt: 1, now: now)
        XCTAssertFalse(library.remove(id: "missing", followingId: nil))
        XCTAssertEqual(library.entries.count, 1)
        XCTAssertTrue(library.remove(id: "a", followingId: nil))
        XCTAssertTrue(library.entries.isEmpty)
    }

    func testRemovingTheFollowedRouteWaitsForTheRunToEnd() {
        var library = WatchRouteLibrary()
        _ = library.add(route("a"), updatedAt: 1, now: now)
        _ = library.add(route("b"), updatedAt: 1, now: now)
        XCTAssertFalse(library.remove(id: "a", followingId: "a"))
        XCTAssertNotNil(library.route(id: "a"))
        XCTAssertEqual(library.pendingRemovals, ["a"])
        XCTAssertTrue(library.finishedFollowing())
        XCTAssertNil(library.route(id: "a"))
        XCTAssertNotNil(library.route(id: "b"))
        XCTAssertTrue(library.pendingRemovals.isEmpty)
        XCTAssertFalse(library.finishedFollowing())
    }

    func testSendingARouteAgainCancelsAHeldRemoval() {
        var library = WatchRouteLibrary()
        _ = library.add(route("a"), updatedAt: 1, now: now)
        _ = library.remove(id: "a", followingId: "a")
        _ = library.add(route("a"), updatedAt: 2, now: now)
        XCTAssertTrue(library.pendingRemovals.isEmpty)
        XCTAssertFalse(library.finishedFollowing())
        XCTAssertNotNil(library.route(id: "a"))
    }

    func testListIsInNameOrderWhateverTheArrivalOrder() {
        var library = WatchRouteLibrary()
        _ = library.add(route("1", name: "park loop"), updatedAt: 1, now: now)
        _ = library.add(route("2", name: "Canal"), updatedAt: 1, now: now)
        _ = library.add(route("3", name: "Hill"), updatedAt: 1, now: now)
        XCTAssertEqual(library.sortedByName.map(\.route.name), ["Canal", "Hill", "park loop"])
        // Re-sending one does not move it.
        _ = library.add(route("2", name: "Canal"), updatedAt: 9, now: now)
        XCTAssertEqual(library.sortedByName.map(\.route.name), ["Canal", "Hill", "park loop"])
    }

    func testLibraryRoundTripsThroughJSON() throws {
        var library = WatchRouteLibrary()
        _ = library.add(route("a"), updatedAt: 1, now: now)
        _ = library.add(route("b"), updatedAt: 2, now: now)
        _ = library.remove(id: "b", followingId: "b")
        let data = try JSONEncoder().encode(library)
        let decoded = try JSONDecoder().decode(WatchRouteLibrary.self, from: data)
        XCTAssertEqual(decoded, library)
    }

    func testLengthIsTheSumOfItsSegments() {
        // 0.01 degrees of latitude is about 1112 m.
        XCTAssertEqual(route("a").lengthMeters, 1112, accuracy: 5)
    }
}
