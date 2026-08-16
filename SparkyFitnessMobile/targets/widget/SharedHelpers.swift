import Foundation

let snapshotDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter
}()

func todayDateString() -> String {
    snapshotDateFormatter.string(from: Date())
}

func isToday(_ dateString: String?) -> Bool {
    guard let dateString else { return false }
    return dateString == todayDateString()
}

func appGroupIdentifier() -> String? {
    if let appGroup = Bundle.main.object(forInfoDictionaryKey: "APP_GROUP_IDENTIFIER") as? String {
        return appGroup
    }

    guard let bundleIdentifier = Bundle.main.bundleIdentifier else {
        return nil
    }

    if bundleIdentifier.hasSuffix(".widget") {
        return "group.\(bundleIdentifier.dropLast(".widget".count))"
    }
    return "group.\(bundleIdentifier)"
}

/// Locale used for number formatting and localized-string lookups. iOS owns
/// the per-app language (final PR3), so WidgetKit always resolves from its
/// native locale — there is no persisted widget-only override.
func widgetLocale() -> Locale {
    return .current
}

/// Resolves a widget string key against the localized resources. Never
/// intentionally displays a raw key:
///
///   1. the extension's native/current bundle (iOS per-app language);
///   2. the English widget bundle;
///   3. a stable readable fallback map for the known key set.
func localizedWidgetString(_ key: String) -> String {
    let bundles: [Bundle?] = [
        Bundle.main,
        Bundle.main.path(forResource: "en", ofType: "lproj").flatMap { Bundle(path: $0) },
    ]

    for bundle in bundles {
        guard let bundle else { continue }
        let value = bundle.localizedString(forKey: key, value: nil, table: nil)
        if !value.isEmpty && value != key {
            return value
        }
    }
    return fallbackWidgetString(key)
}

/// Stable readable English fallback for the small known widget key set, used
/// only when every localization bundle is missing the key.
private func fallbackWidgetString(_ key: String) -> String {
    switch key {
    case "widget.calorie.name": return "Calories"
    case "widget.calorie.description": return "Today's calorie intake at a glance."
    case "widget.macro.name": return "Macros"
    case "widget.macro.description": return "Today's protein, carbs, and fat at a glance."
    case "widget.kcal_left": return "kcal left"
    case "widget.kcal": return "kcal"
    case "widget.food": return "Food"
    case "widget.burned": return "Burned"
    case "widget.goal": return "Goal"
    case "widget.protein": return "Protein"
    case "widget.carbs": return "Carbs"
    case "widget.fat": return "Fat"
    case "widget.grams": return "%@ g"
    case "widget.a11y.kcal_left": return "%@ kcal left"
    case "widget.a11y.kcal": return "%@ kcal"
    case "widget.search_food": return "Search food"
    case "widget.scan_barcode": return "Scan barcode"
    default: return key
    }
}

/// Locale-aware integer formatter that keeps existing business rounding and
/// never hardcodes an English locale or manual separators.
private func widgetNumberFormatter() -> NumberFormatter {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.locale = widgetLocale()
    formatter.maximumFractionDigits = 0
    return formatter
}

/// Formats a calorie/macro value using the widget locale, preserving the
/// existing `rounded()` business rounding.
func localizedNumberString(_ value: Double) -> String {
    widgetNumberFormatter().string(from: NSNumber(value: value.rounded())) ?? "0"
}
