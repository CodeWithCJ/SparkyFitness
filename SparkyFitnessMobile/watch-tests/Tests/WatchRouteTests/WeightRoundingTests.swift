import XCTest
@testable import WatchRoute

final class WeightRoundingTests: XCTestCase {
    func testPoundsRoundTripThroughTwoDecimalKilosShowsWhatWasTyped() {
        for pounds in [5.0, 45, 90, 105, 135, 225, 312.5] {
            let storedKg = ((pounds * WeightRounding.kgPerLb) * 100).rounded() / 100
            XCTAssertEqual(WeightRounding.displayed(kg: storedKg, lbs: true), pounds, "\(pounds) lb")
        }
    }

    func test105PoundsDoesNotShowAsAHundredAndFivePointZeroOne() {
        XCTAssertEqual(WeightRounding.displayed(kg: 47.63, lbs: true), 105)
        XCTAssertEqual(WeightRounding.displayed(kg: 47.627, lbs: true), 105)
    }

    func testKilosKeepTwoDecimals() {
        XCTAssertEqual(WeightRounding.displayed(kg: 82.5, lbs: false), 82.5)
        XCTAssertEqual(WeightRounding.displayed(kg: 20.004, lbs: false), 20)
        XCTAssertEqual(WeightRounding.displayed(kg: 1.256, lbs: false), 1.26)
    }

    func testHalfPoundStepsSurvive() {
        XCTAssertEqual(WeightRounding.displayed(kg: 102.5 * WeightRounding.kgPerLb, lbs: true), 102.5)
    }
}
