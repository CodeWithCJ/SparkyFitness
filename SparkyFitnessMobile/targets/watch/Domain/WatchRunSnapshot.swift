import Foundation

/// What a wrist-only recording needs to carry on after the watch app is
/// killed mid-run: the Health session itself survives, but the route, the
/// heart-rate readings and the run's identity live only in memory.
///
/// Written while a run is going and removed when it ends. Its existence at
/// launch is what says a run was left going.
struct WatchRunSnapshot: Codable {
    var clientId: String
    var kind: String
    var place: String
    var startedAt: Date
    var routeSegment: Double
    var pausedByAutoPause: Bool
    var routeRows: [[Double]]
    var heartRateRows: [[Double]]
    var distanceMeters: Double
    var activeEnergyKcal: Double
    /// Active seconds when this was written, so a run that cannot be
    /// re-attached is still sent with roughly the right length.
    var elapsed: TimeInterval
    var savedAt: Date
    /// Lap presses (epoch ms). Optional so a snapshot written before laps existed still decodes.
    var lapMarks: [Double]?
    var lapDistances: [Double]?
    /// `[active seconds, metres]` rows for the pace chart. Optional for older snapshots.
    var distanceSeries: [[Double]]?
    /// The plan being followed, so a relaunch keeps following it. Optional for older snapshots.
    var plan: WatchRunPlan?
    /// Where the plan's current step began. Optional for older snapshots,
    /// whose plans were all timed and are placed again from `elapsed`.
    var planCursor: WatchRunPlan.Cursor?
    /// Auto-pause and voice cues as last set. Optional for older snapshots.
    var settings: WatchRunSettings?
    /// Where the route tracker stood. Separate from `routeSegment`, which
    /// counts pause segments of the recorded route. Optional for older snapshots.
    var routeProgress: WatchRouteTracker.State?
    /// Whether this indoor run writes its own distance (system collection
    /// off, pedometer distance instead), so a relaunch turns collection off
    /// again rather than letting Health replace the pedometer's figure.
    /// Optional for older snapshots, which never did.
    var selfWrittenDistance: Bool?
    /// Metres recorded before the system's distance collection was switched
    /// back on mid-run, which Health does not hold. Optional for older snapshots.
    var systemDistanceOffset: Double?
    /// When the pedometer reading behind `distanceMeters` was taken, so a
    /// relaunch can ask the pedometer for the distance covered since (pauses
    /// left out) instead of losing it. Optional for older snapshots.
    var pedometerReadAt: Date?
    /// Set when an indoor run has ended and its Health workout is held for
    /// the treadmill answer. The session is paused, not ended, until the
    /// workout is saved, so a relaunch finds it again (`recoverIfNeeded`).
    /// The held fields are all optional for older snapshots.
    var heldEndedAt: Date?
    /// Active seconds and steps at the end, for the run sent to the phone.
    var heldElapsed: TimeInterval?
    var heldSteps: Int?
    /// The distance sample is already in the held workout, so a retry after
    /// a relaunch does not add it twice.
    var heldDistanceAdded: Bool?
    /// The wearer has answered: `confirmedMeters` is what the machine showed
    /// (nil to keep the watch's figure), `finalDistanceMeters` the distance
    /// written to Health and `heldScale` the indoor factor the run used, so the
    /// same settled run is rebuilt after a relaunch.
    var distanceConfirmed: Bool?
    var confirmedMeters: Double?
    var finalDistanceMeters: Double?
    var heldScale: Double?
    /// The settled run is queued for the phone; only Health is left.
    var phoneQueued: Bool?

    /// A run left this long ago is not one the wearer is still doing.
    static let maxAge: TimeInterval = 12 * 60 * 60
    /// A run shorter than this is not worth sending when it has to be salvaged.
    static let minimumKeptSeconds: TimeInterval = 60
}

/// The snapshot on disk. A file rather than defaults: an hour's route is
/// hundreds of kilobytes.
enum WatchRunSnapshotStore {
    private static var url: URL? {
        try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("watch-run-snapshot.json")
    }

    static func load() -> WatchRunSnapshot? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WatchRunSnapshot.self, from: data)
    }

    static func save(_ snapshot: WatchRunSnapshot) {
        guard let url, let data = try? JSONEncoder().encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    static var exists: Bool { load() != nil }
}

/// A finished run the watch could not hand to `transferUserInfo` yet, because
/// `WCSession` was not activated. The file is the durable queue: the Health
/// workout is already stamped, so this message is the only copy that reaches
/// the diary. The recovery snapshot can be removed once this write succeeds.
enum WatchRunOutbox {
    private static var url: URL? {
        try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("watch-run-outbox.json")
    }

    static func load() -> [[String: Any]] {
        guard let url, let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else { return [] }
        return raw.compactMap { $0 as? [String: Any] }
    }

    /// False when the file could not be written. A client id already queued
    /// counts as kept.
    static func append(_ payload: [String: Any]) -> Bool {
        var rows = load()
        if let id = payload["clientId"] as? String, !id.isEmpty,
           rows.contains(where: { ($0["clientId"] as? String) == id }) {
            return true
        }
        rows.append(payload)
        return save(rows)
    }

    static func save(_ rows: [[String: Any]]) -> Bool {
        guard let url, JSONSerialization.isValidJSONObject(rows),
              let data = try? JSONSerialization.data(withJSONObject: rows)
        else { return false }
        do {
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }

    static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
