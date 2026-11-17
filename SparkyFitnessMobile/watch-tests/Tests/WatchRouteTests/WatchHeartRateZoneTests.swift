import XCTest
@testable import WatchRoute

final class WatchHeartRateZoneTests: XCTestCase {
    private let floors: [Double] = [95, 114, 133, 152, 171]

    func testZonesFollowTheFloors() {
        XCTAssertEqual(WatchHeartRateZone.zone(for: 94, floors: floors), 0)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 95, floors: floors), 1)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 113.9, floors: floors), 1)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 114, floors: floors), 2)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 141, floors: floors), 3)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 152, floors: floors), 4)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 171, floors: floors), 5)
        XCTAssertEqual(WatchHeartRateZone.zone(for: 210, floors: floors), 5)
    }

    func testNoFloorsMeansNoZone() {
        XCTAssertNil(WatchHeartRateZone.zone(for: 140, floors: nil))
        XCTAssertNil(WatchHeartRateZone.zone(for: 140, floors: []))
        XCTAssertNil(WatchHeartRateZone.zone(for: 140, floors: [95, 114]))
    }

    func testNormalizedRejectsBadFloors() {
        XCTAssertEqual(WatchHeartRateZone.normalized(floors), floors)
        XCTAssertNil(WatchHeartRateZone.normalized(nil))
        XCTAssertNil(WatchHeartRateZone.normalized([95, 114, 133, 152]))
        XCTAssertNil(WatchHeartRateZone.normalized([95, 133, 114, 152, 171]))
        XCTAssertNil(WatchHeartRateZone.normalized([0, 114, 133, 152, 171]))
    }
}
