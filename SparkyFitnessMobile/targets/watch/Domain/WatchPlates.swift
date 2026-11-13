import Foundation

/// The bar and plates a person owns, as the phone sends them with a barbell
/// exercise (`WatchPlateConfigPayload` in `modules/watch-connectivity`).
struct WatchPlateConfig: Codable, Equatable {
    /// "kg" or "lbs": the unit of every weight below. A set's weight is kg.
    var unit: String
    var barWeight: Double
    /// One collar; 0 when collars are off.
    var collarWeight: Double
    /// Pairs owned of each plate weight.
    var plates: [Plate]

    struct Plate: Codable, Equatable {
        var weight: Double
        var pairs: Int
    }
}

/// Plates per side for a target weight: the same search as `calculatePlateLoad`
/// in `shared/src/utils/plateCalculator.ts`, which the phone's plate calculator
/// uses, ported so the watch can answer for a weight edited on the wrist. A
/// bounded knapsack, not greedy loading: it finds the fewest plates that make
/// the weight, heaviest first, from the plates actually owned, and when the
/// weight cannot be built it names the nearest loadable weights either side.
/// Pure Foundation, tested in `watch-tests/` against the same cases as the
/// TypeScript.
enum WatchPlates {
    /// Plates on one side, heaviest first.
    struct Load: Equatable {
        var plates: [Count]
        var perSide: Double
        /// Bar, collars and both sides, in the config's unit.
        var total: Double
    }

    struct Count: Equatable {
        var weight: Double
        var count: Int
    }

    enum Result: Equatable {
        case exact(Load)
        /// Nearest loadable weights under and over the target; either can be nil.
        case inexact(below: Load?, above: Load?)
        case invalid
    }

    private static let kgPerLb = 0.45359237
    /// Weights keep three decimals, so the search runs in thousandths.
    private static let scale = 1000.0
    private static let notReachable = UInt16.max
    /// slots x denominations; past it the search is refused rather than cut short.
    private static let maxSearchCells = 4_000_000
    private static let exactNoise = 1e-9
    /// Realistic ceilings (kg, and the config's unit for bar/collar/plates) so a
    /// payload value can never overflow an Int conversion below.
    private static let maxTargetKg = 1000.0
    private static let maxConfigWeight = 10_000.0
    private static let maxPairs = 1000
    /// Int is 32-bit on arm64_32 watches: every thousandths total below must
    /// stay within this, or the config is refused rather than trapping.
    private static let maxUnits = Int(Int32.max)

    /// A kg weight in the config's unit.
    static func inUnit(_ kg: Double, of config: WatchPlateConfig) -> Double {
        config.unit == "lbs" ? kg / kgPerLb : kg
    }

    static func calculate(targetKg: Double, config: WatchPlateConfig) -> Result {
        let target = inUnit(targetKg, of: config)
        guard targetKg.isFinite, targetKg > 0, targetKg <= maxTargetKg, target.isFinite, target > 0,
              config.barWeight.isFinite, config.collarWeight.isFinite,
              (0...maxConfigWeight).contains(config.barWeight),
              (0...maxConfigWeight).contains(config.collarWeight) else { return .invalid }

        var merged: [Int: Int] = [:]
        for plate in config.plates where plate.weight.isFinite && plate.weight > 0 && plate.pairs > 0 {
            guard plate.weight <= maxConfigWeight else { return .invalid }
            let units = Int((plate.weight * scale).rounded())
            merged[units] = min((merged[units] ?? 0) + min(plate.pairs, maxPairs), maxPairs)
        }
        let kinds = merged.map { (units: $0.key, pairs: min($0.value, maxPairs)) }.sorted { $0.units > $1.units }
        let fixed = (config.barWeight * scale).rounded() + 2 * (config.collarWeight * scale).rounded()
        let side = (target * scale - fixed) / 2
        let step = kinds.reduce(0) { gcd($0, $1.units) }.nonZero ?? 1
        var maxSide = 0
        for kind in kinds {
            let (product, productOverflow) = kind.units.multipliedReportingOverflow(by: kind.pairs)
            let (sum, sumOverflow) = maxSide.addingReportingOverflow(product)
            guard !productOverflow, !sumOverflow, sum <= maxUnits else { return .invalid }
            maxSide = sum
        }
        let heaviest = kinds.first?.units ?? 0
        let cap = min(maxSide, Int(max(0, side.rounded(.up))) + heaviest)
        let cells = cap / step + 1
        let (searchCells, cellsOverflow) = cells.multipliedReportingOverflow(by: max(kinds.count, 1))
        guard !cellsOverflow, searchCells <= maxSearchCells else { return .invalid }

        let table = fewestPlates(kinds: kinds.map { ($0.units / step, $0.pairs) }, cells: cells)
        func reachable(_ cell: Int) -> Bool { cell >= 0 && cell < cells && table[0][cell] != notReachable }
        func load(_ cell: Int) -> Load {
            let plates = platesFor(cell: cell, kinds: kinds.map { ($0.units / step, $0.pairs) }, table: table)
                .map { Count(weight: Double($0.units * step) / scale, count: $0.count) }
            let perSideUnits = Double(cell * step)
            return Load(plates: plates, perSide: perSideUnits / scale, total: (fixed + 2 * perSideUnits) / scale)
        }

        let near = side.rounded()
        if abs(side - near) < exactNoise, near >= 0, Int(near) % step == 0, reachable(Int(near) / step) {
            return .exact(load(Int(near) / step))
        }
        var below: Load?
        if side >= 0 {
            var cell = min(Int((side / Double(step)).rounded(.down)), cells - 1)
            while cell >= 0, !reachable(cell) { cell -= 1 }
            if cell >= 0 { below = load(cell) }
        }
        var above: Load?
        var cell = max(Int((side / Double(step)).rounded(.up)), 0)
        while cell < cells, !reachable(cell) { cell += 1 }
        if cell < cells { above = load(cell) }
        return .inexact(below: below, above: above)
    }

    /// A weight in the config's unit as kg, the unit a set's weight is stored in.
    static func toKg(_ value: Double, of config: WatchPlateConfig) -> Double {
        config.unit == "lbs" ? value * kgPerLb : value
    }

    /// The nearest loadable total strictly above (`up`) or below `targetKg`, in
    /// kg; nil past the lightest or heaviest the plates allow. The target is
    /// nudged by half a thousandth, below the search's resolution, so a
    /// loadable target steps to its neighbour and any other to the nearer
    /// loadable weight on that side. This is how the plate calculator's crown
    /// moves through only the weights the plates can make.
    static func nextLoadable(from targetKg: Double, up: Bool, config: WatchPlateConfig) -> Double? {
        guard targetKg.isFinite, targetKg <= maxTargetKg else { return nil }
        let probe = inUnit(targetKg, of: config) + (up ? 0.0005 : -0.0005)
        guard case .inexact(let below, let above) = calculate(targetKg: toKg(probe, of: config), config: config),
              let load = up ? above : below else { return nil }
        return toKg(load.total, of: config)
    }

    /// "20+10+1.25": each plate on one side, a repeated plate repeated.
    static func summary(_ plates: [Count]) -> String {
        plates.flatMap { Array(repeating: number($0.weight), count: $0.count) }.joined(separator: "+")
    }

    /// 20, 1.25, 0.5: no trailing zeros.
    static func number(_ value: Double) -> String {
        let text = String(format: "%.3f", value)
        return text.replacingOccurrences(of: "\\.?0+$", with: "", options: .regularExpression)
    }

    // MARK: - Search

    /// `table[i][sum]`: fewest plates making `sum` from denominations i....
    private static func fewestPlates(kinds: [(Int, Int)], cells: Int) -> [[UInt16]] {
        var table = [[UInt16]](repeating: [UInt16](repeating: notReachable, count: cells), count: kinds.count + 1)
        table[kinds.count][0] = 0
        for i in stride(from: kinds.count - 1, through: 0, by: -1) {
            let (units, pairs) = kinds[i]
            for sum in 0..<cells {
                var best = notReachable
                for k in 0...pairs {
                    let from = sum - k * units
                    if from < 0 { break }
                    let rest = table[i + 1][from]
                    if rest != notReachable, rest + UInt16(k) < best { best = rest + UInt16(k) }
                }
                table[i][sum] = best
            }
        }
        return table
    }

    /// The plates making a reachable cell: fewest, then heaviest first.
    private static func platesFor(cell: Int, kinds: [(Int, Int)], table: [[UInt16]]) -> [(units: Int, count: Int)] {
        var out: [(units: Int, count: Int)] = []
        var rest = cell
        for i in 0..<kinds.count {
            let (units, pairs) = kinds[i]
            let need = table[i][rest]
            var k = min(pairs, rest / units)
            while k >= 0 {
                let after = table[i + 1][rest - k * units]
                if after != notReachable, after + UInt16(k) == need {
                    if k > 0 { out.append((units, k)) }
                    rest -= k * units
                    break
                }
                k -= 1
            }
        }
        return out
    }

    private static func gcd(_ a: Int, _ b: Int) -> Int {
        var (x, y) = (a, b)
        while y != 0 { (x, y) = (y, x % y) }
        return x
    }
}

private extension Int {
    var nonZero: Int? { self == 0 ? nil : self }
}
