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
}

/// A day on the trend chart. Body fat is optional for the same reason as above.
struct HistoryPoint: Codable, Equatable, Identifiable {
    let day: String
    let weightKg: Double
    let bodyFatPercentage: Double?

    var id: String { day }

    var date: Date? { CheckInDate.parse(day) }
}

/// One macro's standing against today's goal.
struct MacroGoal: Codable, Equatable {
    let consumed: Double
    let goal: Double
    /// Clamped 0...1 by the phone, so this screen and the Daily Energy Goal
    /// complication fill from identical numbers rather than each doing their
    /// own arithmetic and drifting apart.
    let progress: Double

    var hasGoal: Bool { goal > 0 }
}

/// Today's nutrition, mirrored from the phone's Dashboard for the Goals page.
///
/// Arrives as flat keys in the context payload and is reassembled here (see
/// `WatchSessionManager.handle(context:)`). Every property is non-optional
/// because the watch builds the whole struct itself, defaulting anything the
/// phone left out — but note that makes it decode-fragile: any field added
/// here later MUST be Optional, or a snapshot persisted by an older build
/// will fail to decode and take the entire `WatchContext` down with it.
struct NutritionSnapshot: Codable, Equatable {
    /// The calendar day these totals describe. Yesterday's numbers are worse
    /// than none — the watch can wake long before the phone syncs a new day.
    let day: String
    let caloriesConsumed: Double
    let caloriesBurned: Double
    /// Goal minus net calories. Negative once the wearer is over.
    let caloriesRemaining: Double
    let calorieProgress: Double
    let carbs: MacroGoal
    let fat: MacroGoal
    let protein: MacroGoal

    var isToday: Bool { day == CheckInDate.today() }
}

/// ml → "500ml" / "16.9oz" / "0.31L", matching the phone app's own
/// conventions (`WATER_UNIT_LABELS`, `formatUnitVolume`): no space before the
/// unit, and decimals that make sense for the unit's usual precision.
/// Shared by `WaterContainer.displayVolume` and `WaterSnapshot.formattedAmount`
/// — the only two places that turn a raw ml figure into user-facing text.
private func formatWaterMl(_ ml: Double, unit: String) -> String {
    let converted: Double
    let decimals: Int
    let label: String
    switch unit {
    case "oz":
        converted = ml / 29.5735
        decimals = 1
        label = "oz"
    case "liter":
        converted = ml / 1000
        decimals = 2
        label = "L"
    default:
        converted = ml
        decimals = 0
        label = "ml"
    }
    return "\(String(format: "%.\(decimals)f", converted))\(label)"
}

/// One water container configured on the server — a tappable square on the
/// Water page. There is no per-container image on the server side, only a
/// name and a volume, which is why every square uses the same glyph and leans
/// on the name (and `displayVolume`) to tell them apart.
struct WaterContainer: Codable, Equatable, Identifiable {
    let id: Int
    let name: String
    /// This container's per-tap amount, already in ml with servings divided
    /// out on the phone (`getServingVolume`) — tapping the square adds
    /// exactly this much, nothing left for the watch to compute.
    let servingVolumeMl: Double
    /// Display only — `ml` | `oz` | `liter`. `servingVolumeMl` above is
    /// always ml regardless of this.
    let unit: String

    /// "500ml" / "16.9oz" / "0.31L" — `servingVolumeMl` converted into this
    /// container's own configured unit.
    var displayVolume: String { formatWaterMl(servingVolumeMl, unit: unit) }
}

/// One individual logged drink, for the water log view.
///
/// Manual entries only — the phone filters out synced records before sending,
/// since those have no container behind them and nothing the wearer would
/// recognize as theirs to delete.
struct WaterLogEntry: Codable, Equatable, Identifiable {
    /// The server row id. This is what a delete request names, so it has to
    /// survive the round trip intact.
    let id: String
    let name: String
    let volumeMl: Double
    /// Already formatted by the phone in the account's configured 12/24-hour
    /// convention — the watch renders it as given rather than re-deriving it.
    let time: String
}

/// Today's water totals for the Water page — the bottle's fill and the goal
/// it fills toward. Mirrored from the phone's Dashboard, same as
/// `NutritionSnapshot`.
/// Deliberately does NOT carry the container list. Containers are
/// configuration, not a measurement: they don't stop being true at midnight,
/// and bundling them in here meant the day rollover took them with it — see
/// `WatchContext.waterContainers`.
struct WaterSnapshot: Codable, Equatable {
    let day: String
    let consumedMl: Double
    let goalMl: Double
    /// Today's individual drinks, newest first. Empty is a real state (nothing
    /// logged yet), distinct from the whole snapshot being nil.
    let log: [WaterLogEntry]
    /// The app's globally configured water display unit — independent of any
    /// one container's own `unit` — for the label above the bottle. The watch
    /// builds this whole struct itself, so it defaults to `ml` (the phone's
    /// own fallback) rather than needing to be Optional.
    let displayUnit: String

    var progress: Double { goalMl > 0 ? max(0, min(1, consumedMl / goalMl)) : 0 }
    var isToday: Bool { day == CheckInDate.today() }

    /// `ml` formatted in `displayUnit` — used for a specific amount (which may
    /// include a not-yet-confirmed tap) rather than always `consumedMl`
    /// itself, so the label above the bottle can track the same optimistic
    /// bump the fill does.
    func formattedAmount(ml: Double) -> String {
        formatWaterMl(ml, unit: displayUnit)
    }
}

/// One container tap captured on the watch, sent straight to the phone. There
/// is no queued/saved/failed state kept for these on the watch the way there
/// is for `CheckIn` — see `WatchSessionManager.sendWaterTap`.
struct WaterTap: Codable, Equatable {
    let id: String
    let entryDate: String
    let containerId: Int
}

/// A request to delete one logged drink, sent to the phone (which owns the
/// API call). Same fire-and-reconcile shape as `WaterTap`: the watch removes
/// the row optimistically and the next context push is the authority.
struct WaterDeleteRequest: Codable, Equatable {
    let id: String
    let entryId: String
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
    /// Today's nutrition totals for the Goals page. Optional for the same
    /// Codable reason as `weightUnit`: a context blob persisted before this
    /// existed still decodes, with nil meaning "the phone hasn't said yet" —
    /// which the Goals page renders as dashes rather than zeros.
    ///
    /// The complication does not read this. It is fed separately by
    /// `ComplicationPublisher`, straight from the raw payload into shared App
    /// Group storage, because a widget extension can't see this app's own
    /// storage.
    var nutrition: NutritionSnapshot?
    /// Today's water totals, for the Water page's bottle. Optional for the
    /// same Codable reason as `nutrition` — nil means "the phone hasn't said
    /// yet", rendered as an empty/dash state rather than a convincing-looking
    /// zero. Expires at midnight, unlike `waterContainers` below.
    var water: WaterSnapshot?

    /// The containers configured on the server — the Water page's tappable
    /// squares.
    ///
    /// Held here rather than inside `water` because it is configuration, not
    /// a measurement: a container doesn't stop existing at midnight. It used
    /// to live in the snapshot, which meant the day rollover deleted it and
    /// the page came up with no squares at all until the phone was back in
    /// range — exactly when logging from the wrist matters most.
    ///
    /// Three distinct states, so keep it Optional: nil = never synced, []
    /// = synced and the server genuinely has none configured, non-empty =
    /// usable. The page says something different for each.
    var waterContainers: [WaterContainer]?

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
        weightUnit: nil,
        nutrition: nil,
        water: nil,
        waterContainers: nil
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
