import Foundation

/// The routes stored on the watch for runs without the phone. The phone adds
/// and removes them with `routeSync` / `routeRemove`; after every change, and
/// whenever the session activates, the watch tells the phone what it holds
/// (`routeLibrary`), which is how the phone knows a route really arrived and
/// that a full library turned one away.
@MainActor
final class WatchRouteLibraryStore: ObservableObject {
    static let shared = WatchRouteLibraryStore()

    @Published private(set) var library: WatchRouteLibrary
    /// Routes the last sync could not store, for the next report to the phone.
    private var rejected: [String: String] = [:]

    private init() {
        library = WatchRouteLibraryStorage.load()
    }

    /// The routes to list on the wrist, by name.
    var routes: [WatchRoute] { library.sortedByName.map(\.route) }

    /// A route from the phone. Not stored (and said so) if the file cannot be written.
    func apply(sync: WatchRouteSync) {
        var updated = library
        let result = updated.add(sync.route, updatedAt: sync.updatedAt, now: Date())
        switch result {
        case .added, .replaced:
            guard WatchRouteLibraryStorage.save(updated) else {
                rejected[sync.route.id] = "storage"
                break
            }
            library = updated
            rejected[sync.route.id] = nil
        case .unchanged:
            rejected[sync.route.id] = nil
        case .full:
            rejected[sync.route.id] = "full"
        }
        report()
    }

    /// The phone dropping a route. One being followed stays until the run ends.
    func apply(remove routeId: String) {
        var updated = library
        updated.remove(id: routeId, followingId: WatchRunStore.shared.route?.id)
        if updated != library, WatchRouteLibraryStorage.save(updated) { library = updated }
        rejected[routeId] = nil
        report()
    }

    /// A run ended: removals held back for its route can go now.
    func runEnded() {
        var updated = library
        guard updated.finishedFollowing() else { return }
        if WatchRouteLibraryStorage.save(updated) {
            library = updated
            report()
        }
    }

    /// Tells the phone what is stored and what was turned away.
    func report() {
        WatchSessionManager.shared.sendRouteLibrary(
            OutboundPayloads.routeLibrary(
                stored: library.entries.map { (id: $0.id, updatedAt: $0.updatedAt) },
                rejected: rejected,
                capacity: WatchRouteLibrary.capacity
            )
        )
    }
}
