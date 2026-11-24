import XCTest
@testable import WatchRoute

final class WatchPageTests: XCTestCase {
    func testAPageOfAFeatureTurnedOffDoesNotShow() {
        let pages = WatchPage.visible(
            order: nil,
            hidden: [],
            offFeatures: ["medications"],
            workoutActive: false
        )
        XCTAssertFalse(pages.contains(.medications))
        XCTAssertEqual(pages.first, .goals)
        XCTAssertTrue(pages.contains(.water))
    }

    func testNoOffFeaturesKeepsEveryPage() {
        XCTAssertTrue(
            WatchPage.visible(order: nil, hidden: nil, offFeatures: [], workoutActive: false)
                .contains(.medications)
        )
        XCTAssertTrue(
            WatchPage.visible(order: nil, hidden: nil, workoutActive: false).contains(.medications)
        )
    }

    func testTheFallbackForEveryPageHiddenLeavesTheOffPageOut() {
        let all = WatchPage.allCases.map(\.rawValue)
        let pages = WatchPage.visible(
            order: nil,
            hidden: all,
            offFeatures: ["medications"],
            workoutActive: false
        )
        XCTAssertFalse(pages.isEmpty)
        XCTAssertFalse(pages.contains(.medications))
    }

    func testOnlyMedicationsPagesBelongToAFeature() {
        XCTAssertEqual(WatchPage.medications.feature, "medications")
        XCTAssertNil(WatchPage.goals.feature)
        XCTAssertNil(WatchPage.workout.feature)
    }
}
