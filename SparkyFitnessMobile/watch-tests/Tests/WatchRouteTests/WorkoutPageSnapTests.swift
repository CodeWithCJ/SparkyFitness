import XCTest
@testable import WatchRoute

final class WorkoutPageSnapTests: XCTestCase {
    private let page: CGFloat = 251
    private var moreTop: CGFloat { 2 * page }

    func testEveryOffsetAboveMoreLandsOnAPage() {
        let pages: Set<CGFloat> = [0, page, moreTop]
        var y: CGFloat = 0
        while y < moreTop {
            XCTAssertTrue(pages.contains(WorkoutPageSnap.snapped(y, moreTop: moreTop, pageHeight: page)), "y=\(y)")
            y += 0.5
        }
    }

    func testNearestPageWins() {
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 0.4, moreTop: moreTop, pageHeight: page), 0)
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 0.6, moreTop: moreTop, pageHeight: page), page)
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 1.4, moreTop: moreTop, pageHeight: page), page)
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 1.6, moreTop: moreTop, pageHeight: page), moreTop)
    }

    func testMoreScrollsFreely() {
        XCTAssertEqual(WorkoutPageSnap.snapped(moreTop + 123.4, moreTop: moreTop, pageHeight: page), moreTop + 123.4)
    }
}
