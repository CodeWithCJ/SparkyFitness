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

/// Stable widget locale written by the JS app into the shared app group. This
/// is what lets the widget follow an explicit in-app language choice that the
/// system (and therefore WidgetKit) does not know about. `nil` means "follow
/// the extension's native locale".
private func widgetLocaleCode() -> String? {
    guard
        let appGroup = appGroupIdentifier(),
        !appGroup.isEmpty,
        let defaults = UserDefaults(suiteName: appGroup),
        let code = defaults.string(forKey: "widgetLocale"),
        code == "en" || code == "pl"
    else {
        return nil
    }
    return code
}

/// Locale used for number formatting and localized-string lookups. Prefers the
/// stable JS-provided locale and falls back to the widget's current locale.
func widgetLocale() -> Locale {
    switch widgetLocaleCode() {
    case "en":
        return Locale(identifier: "en")
    case "pl":
        return Locale(identifier: "pl")
    default:
        return .current
    }
}

/// Resolves a widget string key against the localized resources, honoring the
/// JS-provided locale when present. Falls back to the bundle's native
/// localization so a missing override never shows a raw key.
func localizedWidgetString(_ key: String) -> String {
    if
        let code = widgetLocaleCode(),
        let path = Bundle.main.path(forResource: code, ofType: "lproj"),
        let bundle = Bundle(path: path)
    {
        return bundle.localizedString(forKey: key, value: nil, table: nil)
    }
    return Bundle.main.localizedString(forKey: key, value: nil, table: nil)
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
