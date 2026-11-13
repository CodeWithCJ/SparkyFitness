import XCTest
@testable import WatchRoute

final class StaleRestTests: XCTestCase {
    private let tick = Date(timeIntervalSince1970: 1_000)

    func testRestStartedBeforeTheSkipIsStale() {
        // Logged at tick, phone rest 90s, wearer skipped 2s later.
        let skipped = tick.addingTimeInterval(2)
        XCTAssertTrue(StaleRest.isStale(endsAt: tick.addingTimeInterval(90), durationSeconds: 90, skippedAt: skipped))
    }

    func testRestStartedAfterTheSkipIsNew() {
        let skipped = tick.addingTimeInterval(2)
        let next = tick.addingTimeInterval(30)
        XCTAssertFalse(StaleRest.isStale(endsAt: next.addingTimeInterval(60), durationSeconds: 60, skippedAt: skipped))
    }

    func testNoSkipIsNeverStale() {
        XCTAssertFalse(StaleRest.isStale(endsAt: tick.addingTimeInterval(90), durationSeconds: 90, skippedAt: nil))
    }
}
