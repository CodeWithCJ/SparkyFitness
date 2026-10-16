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
