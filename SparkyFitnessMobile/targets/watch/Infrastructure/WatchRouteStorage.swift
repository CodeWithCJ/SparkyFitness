import Foundation

/// The route the current run is following, kept on disk while it runs.
///
/// The run itself survives the app being killed (`WatchRunSnapshotStore`), so
/// the route has to as well, or a relaunch would carry on recording with the
/// map and directions gone. A file of its own rather than a field of the run
/// snapshot: the snapshot is rewritten on every GPS fix, and a route is up to
/// ~20 KB that never changes. Written when a run starts, removed when it ends.
enum WatchRouteStorage {
    private static var url: URL? {
        try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("watch-run-route.json")
    }

    static func load() -> WatchRoute? {
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(WatchRoute.self, from: data)
    }

    static func save(_ route: WatchRoute) {
        guard let url, let data = try? JSONEncoder().encode(route) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func clear() {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }
}
