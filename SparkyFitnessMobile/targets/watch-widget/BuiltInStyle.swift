import SwiftUI

/// Mirrors `ComplicationPublisher.BuiltInStyle` (targets/watch): the colour and
/// icon the wearer chose, on the phone, for one of the built-in complications.
/// `key` is the phone's built-in key (`calorieGoal`, `proteinGoal`, `carbsGoal`,
/// `fatGoal`, `water`, `fasting`, `steps`); the strings are the same wire values
/// the custom complications use.
private struct StoredBuiltInStyle: Decodable {
    let key: String
    let color: String?
    let icon: String?
}

/// What a built-in complication draws its tint and symbol with.
struct BuiltInLook {
    let color: Color
    let icon: String
    /// The wearer picked an icon, so a view that normally shows a letter in its
    /// place draws the icon instead.
    let customIcon: Bool
}

/// The wearer's choice for `key`, or the complication's own `color` and `icon`
/// when they have not changed it.
func builtInLook(_ key: String, color: Color, icon: String) -> BuiltInLook {
    guard
        let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String,
        !appGroup.isEmpty,
        let data = UserDefaults(suiteName: appGroup)?.data(forKey: "builtInComplicationStyles"),
        let styles = try? JSONDecoder().decode([StoredBuiltInStyle].self, from: data),
        let style = styles.first(where: { $0.key == key })
    else { return BuiltInLook(color: color, icon: icon, customIcon: false) }
    return BuiltInLook(
        color: style.color.map { tint($0) } ?? color,
        icon: style.icon ?? icon,
        customIcon: style.icon != nil
    )
}
