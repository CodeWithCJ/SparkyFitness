/// Which heart rate zone a reading falls in, for colouring it. The floors are
/// the phone's: the lowest bpm of zones 1 to 5 from the person's own resolved
/// zones (the context's `heartRateZoneFloors`). The watch never works out a
/// max heart rate or a floor itself.
enum WatchHeartRateZone {
    /// The zone count the app draws; the same five as the phone's charts.
    static let count = 5

    /// Zone 1 to 5 for a reading; 0 below zone 1. Nil when no floors have
    /// arrived (an older phone build, or zones not loaded yet), which reads as
    /// "no zone, keep the plain heart colour".
    static func zone(for bpm: Double, floors: [Double]?) -> Int? {
        guard let floors, floors.count == count else { return nil }
        var zone = 0
        for (index, floor) in floors.enumerated() where bpm >= floor {
            zone = index + 1
        }
        return zone
    }

    /// Whether a context's floors can be trusted: five, ascending, positive.
    static func normalized(_ raw: [Double]?) -> [Double]? {
        guard let raw, raw.count == count, raw.allSatisfy({ $0 > 0 }),
              zip(raw, raw.dropFirst()).allSatisfy({ $0 <= $1 }) else { return nil }
        return raw
    }
}
