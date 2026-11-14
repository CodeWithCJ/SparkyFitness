import Foundation

/// A weight shown or edited on the watch. A set's weight travels and is stored
/// in kg (the server keeps two decimals), so 105 lb comes back as 47.63 kg,
/// which is 105.011 lb. Showing that raw is wrong, so the number in the wearer's
/// unit is rounded to what could have been typed, as the phone's
/// `storedWeightInUnit` does: a tenth of a pound, a hundredth of a kilo.
enum WeightRounding {
    static let kgPerLb = 0.45359237

    /// `kg` in pounds or kilos, rounded for display and editing.
    static func displayed(kg: Double, lbs: Bool) -> Double {
        let value = lbs ? kg / kgPerLb : kg
        let factor = lbs ? 10.0 : 100.0
        return (value * factor).rounded() / factor
    }
}
