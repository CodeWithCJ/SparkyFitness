import XCTest
@testable import WatchRoute

final class WorkoutPageSnapTests: XCTestCase {
    // Metrics, set, More: not an even multiple of anything, as on a real watch.
    private let stops: [CGFloat] = [0, 223.5, 447.5]

    func testRestsOnTheNearestStopAboveTheLastOne() {
        XCTAssertEqual(WorkoutPageSnap.snapped(40, stops: stops), 0)
        XCTAssertEqual(WorkoutPageSnap.snapped(120, stops: stops), 223.5)
        XCTAssertEqual(WorkoutPageSnap.snapped(340, stops: stops), 447.5)
    }

    func testEveryResultIsAStop() {
        for y in stride(from: CGFloat(0), to: 447.5, by: 7.3) {
            XCTAssertTrue(stops.contains(WorkoutPageSnap.snapped(y, stops: stops)), "y=\(y)")
        }
    }

    func testMoreScrollsFreelyFromItsTop() {
        XCTAssertEqual(WorkoutPageSnap.snapped(447.5, stops: stops), 447.5)
        XCTAssertEqual(WorkoutPageSnap.snapped(612.2, stops: stops), 612.2)
    }

    func testADemoPageAddsAStopAbove() {
        let withDemo: [CGFloat] = [0, 223.5, 447, 670.5]
        XCTAssertEqual(WorkoutPageSnap.snapped(100, stops: withDemo), 0)
        XCTAssertEqual(WorkoutPageSnap.snapped(330, stops: withDemo), 223.5)
    }

    func testNoStopsLeavesTheTargetAlone() {
        XCTAssertEqual(WorkoutPageSnap.snapped(50, stops: []), 50)
    }
}
