import XCTest
@testable import WatchRoute

final class LoggedSetOrderTests: XCTestCase {
    func testKeepsLogOrderAcrossExercisesAndSupersets() {
        let plan = ["a1", "a2", "b1", "b2"]
        var order: [String] = []
        // Superset logged a1, b1, a2: not plan order.
        for done in [["a1"], ["a1", "b1"], ["a1", "b1", "a2"]] {
            order = LoggedSetOrder.synced(order, completed: Set(done), planOrder: plan)
        }
        XCTAssertEqual(order, ["a1", "b1", "a2"])
    }

    func testUnloggedSetDropsOutAndRelogGoesLast() {
        let plan = ["a1", "a2", "b1"]
        var order = LoggedSetOrder.synced([], completed: ["a1", "a2", "b1"], planOrder: plan)
        order = LoggedSetOrder.synced(order, completed: ["a2", "b1"], planOrder: plan)
        XCTAssertEqual(order, ["a2", "b1"])
        order = LoggedSetOrder.synced(order, completed: ["a1", "a2", "b1"], planOrder: plan)
        XCTAssertEqual(order, ["a2", "b1", "a1"])
    }

    func testOlderStopsAtTheOldest() {
        XCTAssertNil(LoggedSetOrder.older(than: 0))
        XCTAssertEqual(LoggedSetOrder.older(than: 2), 1)
    }

    func testNewerAlwaysMovesAndEndsAtTheCurrentSet() {
        XCTAssertEqual(LoggedSetOrder.newer(than: 0, count: 3), .set(1))
        XCTAssertEqual(LoggedSetOrder.newer(than: 2, count: 3), .current)
    }
}
