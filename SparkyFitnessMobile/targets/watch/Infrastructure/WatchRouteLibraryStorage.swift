import Foundation

/// The route library on disk, so it outlives the app being closed or killed.
/// A file of its own in Application Support (routes are up to ~20 KB each),
/// next to `watch-run-route.json`, which holds the one route a run in
/// progress is following (`WatchRouteStorage`).
enum WatchRouteLibraryStorage {
    private static var url: URL? {
        try? FileManager.default
            .url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("watch-route-library.json")
    }

    static func load() -> WatchRouteLibrary {
        guard let url, let data = try? Data(contentsOf: url) else { return WatchRouteLibrary() }
        return (try? JSONDecoder().decode(WatchRouteLibrary.self, from: data)) ?? WatchRouteLibrary()
    }

    /// False when the file could not be written, so the caller does not tell
    /// the phone a route is stored when it is not.
    @discardableResult
    static func save(_ library: WatchRouteLibrary) -> Bool {
        guard let url, let data = try? JSONEncoder().encode(library) else { return false }
        do {
            try data.write(to: url, options: .atomic)
            return true
        } catch {
            return false
        }
    }
}
