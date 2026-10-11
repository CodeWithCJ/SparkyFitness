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

/// One row of the Goals page, as the phone's Settings → Apple Watch lists it:
/// any nutrient, not just the three macros. Built on the phone from the same
/// summary as the calorie figures, so the two never disagree.
struct NutrientRow: Codable, Equatable, Identifiable {
    /// The phone's nutrient key (`protein`, `dietary_fiber`, …) or a custom
    /// nutrient's name. Picks the row's colour.
    let key: String
    let label: String
    let unit: String
    let consumed: Double
    /// Nil when no goal is set: the row shows the amount alone.
    let goal: Double?
    /// Clamped 0...1 by the phone; 0 without a goal.
    let progress: Double

    var id: String { key }
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
    /// The rows to list under the ring, in order. Nil from a phone build that
    /// doesn't send them, which keeps the fixed protein, carbs and fat rows;
    /// empty means the wearer chose to list none.
    var rows: [NutrientRow]? = nil

    var isToday: Bool { day == CheckInDate.today() }
}

/// ml → "500ml" / "16.9oz" / "0.31L", matching the phone app's own
/// conventions (`WATER_UNIT_LABELS`, `formatUnitVolume`): no space before the
/// unit, and decimals that make sense for the unit's usual precision.
/// Shared by `WaterContainer.displayVolume` and `WatchContext.formattedWater`
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
/// What was drunk today. Deliberately holds no goal and no unit: both of those
/// are account configuration that outlives the day, and keeping them in here
/// meant a morning with no snapshot yet had no goal either — so `progress` was
/// a hard zero and the bottle could not render an optimistic tap at all. Same
/// mistake `waterContainers` used to have. They live on `WatchContext` now.
struct WaterSnapshot: Codable, Equatable {
    let day: String
    let consumedMl: Double
    /// Today's individual drinks, newest first. Empty is a real state (nothing
    /// logged yet), distinct from the whole snapshot being nil.
    let log: [WaterLogEntry]

    var isToday: Bool { day == CheckInDate.today() }
}

/// A container tap the wearer has made but the phone hasn't confirmed.
///
/// Lives in `CheckInStore` rather than the Water page's own `@State` so it
/// survives leaving the page and relaunching the app: the tap is realistically
/// made with the phone in another room, where confirmation is minutes away.
struct PendingWaterTap: Codable, Equatable, Identifiable {
    /// Also the `clientId` sent to the phone, which is what the acknowledgement
    /// comes back naming. One id from tap to ack.
    let id: String
    let volumeMl: Double
    /// Kept so a failed tap can be sent again without the wearer re-finding the
    /// square they pressed.
    let containerId: Int
    /// When the wearer tapped, so an inbound total can be asked whether it is
    /// old enough to have missed this tap. See `CheckInStore.apply(context:)`.
    let createdAt: Date
    /// The day the tap was made. Needed because a tap outlives the app now: a
    /// glass logged at 23:58 and still unconfirmed at 00:02 belongs to
    /// yesterday, and must not pre-fill the new day's bottle.
    let day: String
    /// `.queued` draws the line above the fill; `.saved` joins the fill;
    /// `.failed` draws nothing and turns the page's status pill red.
    var state: SyncState = .queued

    var isToday: Bool { day == CheckInDate.today() }
}

/// A delete the wearer has confirmed but the phone hasn't written yet.
///
/// The sibling of `PendingWaterTap`, and for the same reason: the only record
/// that a delete happened used to be a `@State` set inside the log view, which
/// died when the page went away and was never resent. A lost delete simply
/// undid itself on the next push.
struct PendingWaterDelete: Codable, Equatable, Identifiable {
    /// The `clientId` the phone acknowledges — not the row being deleted.
    let id: String
    /// The `water_intake_entries` row this removes.
    let entryId: String
    let createdAt: Date
    let day: String
    var state: SyncState = .queued

    var isToday: Bool { day == CheckInDate.today() }
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

/// A saved workout the wearer can start from the wrist. The phone still
/// creates the session; this is only the name to tap.
struct StartableWorkout: Codable, Equatable, Identifiable {
    let presetId: String
    let name: String

    var id: String { presetId }
}

/// A workout the active plans put on today, shown first on the workout page.
/// It is also a saved workout, so a tap starts it by `presetId`.
struct ScheduledWorkout: Codable, Equatable, Identifiable {
    let presetId: String
    let name: String
    let planName: String
    /// "Scheduled Today", or the session a sequential plan is on. Already
    /// translated by the phone.
    let caption: String

    var id: String { "\(planName):\(presetId)" }
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
    /// Client ids the phone tried to write and couldn't. Travels beside
    /// `ackedClientIds` so a failure reaches a watch whose phone was never
    /// reachable — an immediate `sendMessage` ack can't do that, and "queued
    /// forever" would be the only other story the watch could tell.
    var failedClientIds: [String]
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
    /// Today's water target, and the unit to draw amounts in. Account
    /// configuration, not day data — see `WaterSnapshot` for why they moved
    /// out of it — so both are carried forward when a push omits them.
    var waterGoalMl: Double?
    var waterDisplayUnit: String?
    /// When the phone built this payload (its `pushedAt`), as opposed to
    /// `updatedAt` above, which is when this watch received it. Needed to tell
    /// a genuinely fresh push from `adoptReceivedContext()` replaying a cached
    /// one — the two are indistinguishable by arrival time.
    var generatedAt: Date?
    /// The phone's Settings → Haptics switch, and whether its rest-complete
    /// alert is on (notifications and rest-timer notifications both enabled).
    /// Optional for the same Codable reason as `weightUnit`; nil means the
    /// phone hasn't said, which reads as on. Use the `effective…` accessors.
    var hapticsEnabled: Bool?
    var restAlertsEnabled: Bool?
    /// The phone's Settings → Apple Watch choices: page names in swipe order,
    /// and the ones turned off. Optional for the same Codable reason as
    /// `weightUnit`; nil means the phone hasn't said, which reads as the
    /// factory order with every page shown. Read through `visiblePages`.
    var pageOrder: [String]?
    var hiddenPages: [String]?
    /// How the workout page takes a set's weight and reps (`keypad` or
    /// `crown`). Optional for the same Codable reason as `weightUnit`; read
    /// `effectiveSetInputStyle`.
    var setInputStyle: String?
    /// Saved workouts the wearer can start here. Nil until the phone has
    /// said; empty means there are none. Optional so an older context blob
    /// still decodes.
    var startableWorkouts: [StartableWorkout]? = nil
    /// Today's planned workouts. Nil until the phone has said, empty when no
    /// plan has one due.
    var scheduledWorkouts: [ScheduledWorkout]? = nil
    /// The phone's active server when `startableWorkouts` was built. Sent
    /// back with a start request. Nil on a context from before this field.
    var workoutServerId: String? = nil
    /// The phone's distance unit (`km` or `miles`). Decides whether a weighted
    /// carry's distance is shown in metres or yards. Nil reads as metres.
    var distanceUnit: String? = nil
    /// The phone's Settings → Apple Watch → Double-tap switch. Defaulted so the
    /// existing initializer calls need not pass it; nil reads as on.
    var doubleTapEnabled: Bool? = nil
    /// Phone's Settings → Apple Watch → effort (RPE) switch. Nil reads as off.
    var rpeEnabled: Bool? = nil

    static let empty = WatchContext(
        today: nil,
        todayWeightKg: nil,
        todayBodyFatPercentage: nil,
        lastWeightKg: nil,
        lastBodyFatPercentage: nil,
        lastEntryDate: nil,
        history: [],
        ackedClientIds: [],
        failedClientIds: [],
        updatedAt: nil,
        weightUnit: nil,
        nutrition: nil,
        water: nil,
        waterContainers: nil,
        waterGoalMl: nil,
        waterDisplayUnit: nil,
        generatedAt: nil,
        hapticsEnabled: nil,
        restAlertsEnabled: nil,
        pageOrder: nil,
        hiddenPages: nil,
        setInputStyle: nil,
        startableWorkouts: nil,
        scheduledWorkouts: nil,
        workoutServerId: nil
    )

    /// True when there is no value to anchor the Digital Crown to, which is the
    /// one case where typing beats the crown (see `FirstRunEntryView`).
    /// Fraction of today's goal, for the bottle and the complication. Nil when
    /// no goal has ever been synced — distinct from 0, which is a real "none
    /// drunk yet".
    func waterProgress(ml: Double) -> Double? {
        guard let goal = waterGoalMl, goal > 0 else { return nil }
        return max(0, min(1, ml / goal))
    }

    /// `ml` in the account's configured unit. Falls back to the phone's own
    /// default rather than being Optional at the call site.
    func formattedWater(ml: Double) -> String {
        formatWaterMl(ml, unit: waterDisplayUnit ?? "ml")
    }

    /// The keypad until the phone says otherwise, or when it names a style
    /// this build doesn't know.
    var effectiveSetInputStyle: SetInputStyle {
        setInputStyle.flatMap(SetInputStyle.init(rawValue:)) ?? .keypad
    }

    /// The pages to swipe between, in order — see `WatchPage.visible`.
    func visiblePages(workoutActive: Bool) -> [WatchPage] {
        WatchPage.visible(order: pageOrder, hidden: hiddenPages, workoutActive: workoutActive)
    }

    var hasSeed: Bool { todayWeightKg != nil || lastWeightKg != nil }

    /// `weightUnit`, defaulted to kg — the same fallback used everywhere else
    /// (a fresh watch install before first phone sync, or an unrecognized value).
    var effectiveWeightUnit: WeightUnit { weightUnit ?? .kg }

    /// The unit a weighted carry's distance is shown in: metres, or yards when
    /// the phone's distance unit is miles.
    var effectiveCarryUnit: CarryUnit { distanceUnit == "miles" ? .yards : .meters }

    /// Whether button presses on the watch play a haptic. On until the phone
    /// says otherwise.
    var effectiveHapticsEnabled: Bool { hapticsEnabled ?? true }

    /// Whether a rest running out buzzes the wrist: needs both the phone's
    /// haptics and its rest-complete alert on, the same switches that silence
    /// the phone's own cue.
    var effectiveRestBuzzEnabled: Bool {
        effectiveHapticsEnabled && (restAlertsEnabled ?? true)
    }

    /// Whether the double-tap gesture logs a set. On until the phone says
    /// otherwise.
    var effectiveDoubleTapEnabled: Bool { doubleTapEnabled ?? true }

    var effectiveRpeEnabled: Bool { rpeEnabled ?? false }

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
/// How a weighted carry's distance is shown and entered. The wire and the diary
/// always hold km; this only decides the unit on screen.
enum CarryUnit {
    case meters
    case yards

    private static let yardsPerKm = 1093.6133

    /// Units shown per km.
    var perKm: Double { self == .yards ? Self.yardsPerKm : 1000 }
    var title: String { self == .yards ? "YD" : "M" }
    var suffix: String { self == .yards ? "yd" : "m" }

    func fromKm(_ km: Double) -> Double { km * perKm }
    func toKm(_ value: Double) -> Double { value / perKm }
}

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
enum SyncState: String, Codable, Equatable {
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

/// How a set's weight and reps are entered on the workout page. Raw values are
/// the wire strings (`WATCH_SET_INPUT_STYLES` on the phone).
enum SetInputStyle: String {
    /// A number keypad: exact values, typed.
    case keypad
    /// The Digital Crown, turned in plate steps (Hevy-style).
    case crown
}
