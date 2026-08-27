import Foundation

/// One morning check-in captured on the watch.
///
/// `bodyFatPercentage` is optional on purpose: impedance readings routinely
/// fail on dry feet, and the phone must then OMIT the field from the API call
/// rather than send null — the server upserts by date, so a null would erase a
/// previously recorded value instead of leaving it alone.
struct CheckIn: Codable, Equatable, Identifiable {
    /// Stable id generated on the watch so the phone can dedupe a queued
    /// transfer that gets delivered twice.
    let id: String
    /// Calendar day, `yyyy-MM-dd`, in the wearer's local timezone.
    let entryDate: String
    let weightKg: Double
    let bodyFatPercentage: Double?
    let capturedAt: Date

    var payload: [String: Any] {
        var dict: [String: Any] = [
            "type": "checkIn",
            "clientId": id,
            "entryDate": entryDate,
            "weightKg": weightKg,
        ]
        if let bodyFatPercentage {
            dict["bodyFatPercentage"] = bodyFatPercentage
        }
        return dict
    }
}

/// A day on the trend chart. Body fat is optional for the same reason as above.
struct HistoryPoint: Codable, Equatable, Identifiable {
    let day: String
    let weightKg: Double
    let bodyFatPercentage: Double?

    var id: String { day }

    var date: Date? { CheckInDate.parse(day) }
}

/// Everything the phone relays to the watch: what to seed the crown with, and
/// recent history to draw. Latest-value-only — delivered via
/// `updateApplicationContext`, so a missed update is simply superseded.
struct WatchContext: Codable, Equatable {
    var today: String?
    /// Today's already-logged values, if any. Present => the wearer is
    /// correcting rather than creating, and the crown seeds from these.
    var todayWeightKg: Double?
    var todayBodyFatPercentage: Double?
    /// Most recent known values from any day — the crown's anchor on a normal
    /// morning.
    var lastWeightKg: Double?
    var lastBodyFatPercentage: Double?
    var lastEntryDate: String?
    var history: [HistoryPoint]
    /// Client ids the phone has successfully written to the server. Ack travels
    /// in the context rather than a separate message so it survives the watch
    /// app being asleep when the write lands.
    var ackedClientIds: [String]
    var updatedAt: Date?
    /// Mirrors the phone's Settings → default weight unit. Optional (rather than
    /// defaulting in the initializer) so a context blob persisted before this
    /// field existed still decodes cleanly — Codable synthesis treats a missing
    /// key on an Optional property as `nil`, not a decode failure. Read
    /// `effectiveWeightUnit` instead of this directly.
    var weightUnit: WeightUnit?

    static let empty = WatchContext(
        today: nil,
        todayWeightKg: nil,
        todayBodyFatPercentage: nil,
        lastWeightKg: nil,
        lastBodyFatPercentage: nil,
        lastEntryDate: nil,
        history: [],
        ackedClientIds: [],
        updatedAt: nil,
        weightUnit: nil
    )

    /// True when there is no value to anchor the Digital Crown to, which is the
    /// one case where typing beats the crown (see `FirstRunEntryView`).
    var hasSeed: Bool { todayWeightKg != nil || lastWeightKg != nil }

    /// `weightUnit`, defaulted to kg — the same fallback used everywhere else
    /// (a fresh watch install before first phone sync, or an unrecognized value).
    var effectiveWeightUnit: WeightUnit { weightUnit ?? .kg }

    /// Stale seeds are worse than no seed: every morning would start from a lie
    /// and the delta line would reassure falsely.
    var isSeedStale: Bool {
        guard let lastEntryDate, let parsed = CheckInDate.parse(lastEntryDate) else { return true }
        guard let days = Calendar.current.dateComponents([.day], from: parsed, to: Date()).day else { return true }
        return days > 30
    }

    /// Days since the last known entry, used to widen the "does this look
    /// wrong?" threshold — a week away legitimately moves the needle more than
    /// one night does.
    var daysSinceLastEntry: Int {
        guard let lastEntryDate, let parsed = CheckInDate.parse(lastEntryDate),
              let days = Calendar.current.dateComponents([.day], from: parsed, to: Date()).day
        else { return 1 }
        return max(1, days)
    }
}

/// Which unit the wearer's weight displays in on the watch, mirroring the
/// phone's Settings → default weight unit. The watch always captures and
/// transmits kg — `CheckIn.weightKg`, `WatchContext`'s weight fields, and the
/// server itself are all kg regardless of this setting, exactly like the
/// phone only converts at display time. This affects the crown dial and trend
/// chart only. The phone's third option, `st_lbs` (stone + pounds), collapses
/// to `.lbs` here — the crown dial only has room for one number, not a split.
enum WeightUnit: String, Codable {
    case kg
    case lbs

    private static let kgPerLb = 0.45359237

    /// kg (the one source of truth) → this unit, for display.
    func fromKg(_ kg: Double) -> Double {
        self == .lbs ? kg / Self.kgPerLb : kg
    }

    /// A value in this unit → kg, for storage and WatchConnectivity.
    func toKg(_ value: Double) -> Double {
        self == .lbs ? value * Self.kgPerLb : value
    }

    var suffix: String { self == .lbs ? "lbs" : "kg" }
}

/// Where a captured check-in currently is. The watch's local store is the
/// source of truth the moment Save is tapped; delivery is a separate concern
/// and the UI says so honestly rather than pretending it already landed.
enum SyncState: Equatable {
    case saved
    case queued
    case failed

    var label: String {
        switch self {
        case .saved: return "Saved to SparkyFitness"
        case .queued: return "Saved on watch · sends near phone"
        case .failed: return "Couldn't send · tap to retry"
        }
    }

    var symbol: String {
        switch self {
        case .saved: return "checkmark.circle.fill"
        case .queued: return "clock.arrow.circlepath"
        case .failed: return "exclamationmark.triangle.fill"
        }
    }
}

/// Calendar-day strings, formatted in the device's own timezone.
///
/// Mirrors the phone app's convention of treating `yyyy-MM-dd` as a calendar
/// day and never round-tripping it through UTC — `toISOString().split('T')[0]`
/// is explicitly an anti-pattern in this repo because it silently shifts the
/// day for anyone east or west of UTC (Adam is UTC+1/+2).
enum CheckInDate {
    static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func today() -> String {
        formatter.string(from: Date())
    }

    static func parse(_ value: String) -> Date? {
        formatter.date(from: value)
    }

    /// Short weekday + day + month for the entry screen header, e.g. "Mon 17 Aug".
    static func headerLabel(for value: String) -> String {
        guard let date = parse(value) else { return value }
        let display = DateFormatter()
        display.dateFormat = "EEE d MMM"
        return display.string(from: date)
    }
}
