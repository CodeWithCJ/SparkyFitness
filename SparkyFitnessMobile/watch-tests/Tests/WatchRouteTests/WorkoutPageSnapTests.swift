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

    func testDemoPageIsOneMoreSnapStopAboveMetrics() {
        let withDemo = 3 * page
        let stops: Set<CGFloat> = [0, page, 2 * page, withDemo]
        var y: CGFloat = 0
        while y < withDemo {
            XCTAssertTrue(stops.contains(WorkoutPageSnap.snapped(y, moreTop: withDemo, pageHeight: page)), "y=\(y)")
            y += 0.5
        }
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 0.4, moreTop: withDemo, pageHeight: page), 0)
        XCTAssertEqual(WorkoutPageSnap.snapped(page * 1.6, moreTop: withDemo, pageHeight: page), 2 * page)
    }

    func testPageOrderPutsDemoAboveMetricsOnlyWhenPresent() {
        XCTAssertEqual(WorkoutPageSnap.pages(hasDemo: true), [.demo, .metrics, .set])
        XCTAssertEqual(WorkoutPageSnap.pages(hasDemo: false), [.metrics, .set])
    }

    func testOffsetsOfThePages() {
        XCTAssertEqual(WorkoutPageSnap.offset(of: .set, hasDemo: false, pageHeight: page), page)
        XCTAssertEqual(WorkoutPageSnap.offset(of: .set, hasDemo: true, pageHeight: page), 2 * page)
        XCTAssertEqual(WorkoutPageSnap.offset(of: .demo, hasDemo: true, pageHeight: page), 0)
        XCTAssertEqual(WorkoutPageSnap.offset(of: .metrics, hasDemo: true, pageHeight: page), page)
    }
}
