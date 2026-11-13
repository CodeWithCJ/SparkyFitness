import XCTest
@testable import WatchRoute

final class WatchPlatesTests: XCTestCase {
    private let kg = WatchPlateConfig(
        unit: "kg", barWeight: 20, collarWeight: 0,
        plates: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5].map { .init(weight: $0, pairs: 2) }
    )

    private func exact(_ result: WatchPlates.Result, file: StaticString = #filePath, line: UInt = #line) -> WatchPlates.Load? {
        guard case .exact(let load) = result else {
            XCTFail("expected exact, got \(result)", file: file, line: line)
            return nil
        }
        return load
    }

    func testPlatesOwnedDecideTheBreakdown() {
        // Without 25s and 15s, 31.25 a side is 20 + 10 + 1.25.
        let config = WatchPlateConfig(
            unit: "kg", barWeight: 20, collarWeight: 0,
            plates: [20, 10, 5, 2.5, 1.25].map { .init(weight: $0, pairs: 2) }
        )
        let load = exact(WatchPlates.calculate(targetKg: 82.5, config: config))
        XCTAssertEqual(WatchPlates.summary(load?.plates ?? []), "20+10+1.25")
    }

    func testFewestPlatesHeaviestFirst() {
        // 82.5 on a 20 kg bar is 31.25 a side: 25 + 5 + 1.25 is three plates.
        let load = exact(WatchPlates.calculate(targetKg: 82.5, config: kg))
        XCTAssertEqual(load?.perSide, 31.25)
        XCTAssertEqual(load?.total, 82.5)
    }

    func testBarOnlyIsExactWithNoPlates() {
        let load = exact(WatchPlates.calculate(targetKg: 20, config: kg))
        XCTAssertEqual(load?.plates, [])
    }

    func testLimitedPlatesDoNotGoGreedy() {
        // One 20 and two 15s: 30 a side is 15 + 15, not 20 and the rest.
        let config = WatchPlateConfig(
            unit: "kg", barWeight: 20, collarWeight: 0,
            plates: [.init(weight: 20, pairs: 1), .init(weight: 15, pairs: 2)]
        )
        let load = exact(WatchPlates.calculate(targetKg: 80, config: config))
        XCTAssertEqual(WatchPlates.summary(load?.plates ?? []), "15+15")
    }

    func testUnloadableWeightNamesTheNearestEitherSide() {
        // Smallest plate is 0.5 a side, so totals move in kilos.
        guard case .inexact(let below, let above) = WatchPlates.calculate(targetKg: 80.25, config: kg) else {
            return XCTFail("expected inexact")
        }
        XCTAssertEqual(below?.total, 80)
        XCTAssertEqual(above?.total, 81)
    }

    func testUnderTheBarHasNothingBelow() {
        guard case .inexact(let below, let above) = WatchPlates.calculate(targetKg: 15, config: kg) else {
            return XCTFail("expected inexact")
        }
        XCTAssertNil(below)
        XCTAssertEqual(above?.total, 20)
    }

    func testPoundsConfigConvertsTheKgWeight() {
        let lbs = WatchPlateConfig(
            unit: "lbs", barWeight: 45, collarWeight: 0,
            plates: [45, 25, 10, 5, 2.5].map { .init(weight: $0, pairs: 2) }
        )
        // 135 lb = 61.2349... kg: a 45 bar and a 45 each side.
        let load = exact(WatchPlates.calculate(targetKg: 135 * 0.45359237, config: lbs))
        XCTAssertEqual(WatchPlates.summary(load?.plates ?? []), "45")
    }

    func testCollarsCountTowardTheTotal() {
        let collars = WatchPlateConfig(unit: "kg", barWeight: 20, collarWeight: 2.5, plates: kg.plates)
        let load = exact(WatchPlates.calculate(targetKg: 65, config: collars))
        XCTAssertEqual(load?.perSide, 20)
    }

    func testNumberFormatting() {
        XCTAssertEqual(WatchPlates.number(20), "20")
        XCTAssertEqual(WatchPlates.number(1.25), "1.25")
        XCTAssertEqual(WatchPlates.number(0.5), "0.5")
    }
}

final class WatchPlatesStepTests: XCTestCase {
    private let kg = WatchPlateConfig(
        unit: "kg", barWeight: 20, collarWeight: 0,
        plates: [20, 10, 5, 2.5, 1.25].map { .init(weight: $0, pairs: 2) }
    )

    func testStepsToTheNeighbouringLoadableWeights() {
        XCTAssertEqual(WatchPlates.nextLoadable(from: 82.5, up: true, config: kg), 85)
        XCTAssertEqual(WatchPlates.nextLoadable(from: 82.5, up: false, config: kg), 80)
    }

    func testANonLoadableTargetGoesToTheNearerLoadableSide() {
        XCTAssertEqual(WatchPlates.nextLoadable(from: 83, up: true, config: kg), 85)
        XCTAssertEqual(WatchPlates.nextLoadable(from: 83, up: false, config: kg), 82.5)
    }

    func testStopsAtTheBarAndAtTheHeaviestLoad() {
        XCTAssertNil(WatchPlates.nextLoadable(from: 20, up: false, config: kg))
        // Two pairs of each: 20 + 2 * 2 * (20 + 10 + 5 + 2.5 + 1.25) = 175.
        XCTAssertEqual(WatchPlates.nextLoadable(from: 172.5, up: true, config: kg), 175)
        XCTAssertNil(WatchPlates.nextLoadable(from: 175, up: true, config: kg))
    }

    func testPoundsComeBackAsKg() {
        let lbs = WatchPlateConfig(unit: "lbs", barWeight: 45, collarWeight: 0, plates: [45, 25, 10, 5, 2.5].map { .init(weight: $0, pairs: 2) })
        let next = WatchPlates.nextLoadable(from: 135 * 0.45359237, up: true, config: lbs)
        XCTAssertEqual(next ?? 0, 140 * 0.45359237, accuracy: 1e-6)
    }

    func testEnormousValuesAreInvalidInsteadOfTrapping() {
        XCTAssertEqual(WatchPlates.calculate(targetKg: 1e300, config: kg), .invalid)
        XCTAssertEqual(WatchPlates.calculate(targetKg: Double.greatestFiniteMagnitude, config: kg), .invalid)
        XCTAssertEqual(WatchPlates.calculate(targetKg: 1e18, config: kg), .invalid)
        XCTAssertNil(WatchPlates.nextLoadable(from: 1e300, up: true, config: kg))
        XCTAssertNil(WatchPlates.nextLoadable(from: 1e300, up: false, config: kg))
        let hugePlate = WatchPlateConfig(unit: "kg", barWeight: 20, collarWeight: 0, plates: [.init(weight: 1e300, pairs: 2)])
        XCTAssertEqual(WatchPlates.calculate(targetKg: 100, config: hugePlate), .invalid)
        let hugeBar = WatchPlateConfig(unit: "kg", barWeight: 1e300, collarWeight: 0, plates: [.init(weight: 20, pairs: 2)])
        XCTAssertEqual(WatchPlates.calculate(targetKg: 100, config: hugeBar), .invalid)
        let manyPairs = WatchPlateConfig(unit: "kg", barWeight: 20, collarWeight: 0, plates: [.init(weight: 20, pairs: Int.max)])
        _ = WatchPlates.calculate(targetKg: 100, config: manyPairs)
    }
}
