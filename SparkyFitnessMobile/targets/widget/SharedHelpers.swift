import Foundation

let arabicNumberFormatter: NumberFormatter = {
    let formatter = NumberFormatter()
    formatter.locale = Locale(identifier: "ar_SA")
    formatter.numberStyle = .decimal
    formatter.maximumFractionDigits = 0
    return formatter
}()

func formatArabicInteger(_ value: Double) -> String {
    arabicNumberFormatter.string(from: NSNumber(value: Int(value.rounded()))) ?? "٠"
}

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
