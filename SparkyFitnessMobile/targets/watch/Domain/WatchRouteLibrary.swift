import Foundation

// The routes the phone has put on the watch ahead of a run, so one can be
// followed with the phone left behind. Pure Swift like `WatchRoute.swift`
// (no WatchConnectivity, SwiftUI or file access), so the rules can be tested
// off the watch (see `watch-tests/`). `WatchRouteLibraryStorage` keeps it on
// disk and `WatchRouteLibraryStore` applies the phone's messages to it.

/// One route in the library with the phone's revision stamp.
struct WatchStoredRoute: Codable, Equatable, Identifiable {
    let route: WatchRoute
    /// The route's `updatedAt` on the phone in epoch ms. A copy that is not
    /// newer than this one does not replace it, so a late duplicate or an
    /// out-of-order delivery of an older edit changes nothing.
    let updatedAt: Double
    /// When it reached the watch.
    let addedAt: Date

    var id: String { route.id }
}

/// A route the phone sent to keep on the watch.
struct WatchRouteSync: Equatable {
    let route: WatchRoute
    /// The phone's `updatedAt` for it, epoch ms.
    let updatedAt: Double
}

struct WatchRouteLibrary: Codable, Equatable {
    /// A route per id, at most this many. A full library refuses a new route
    /// rather than dropping one the wearer may be counting on; replacing a
    /// route already stored always works.
    static let capacity = 10

    private(set) var entries: [WatchStoredRoute] = []
    /// Removals asked for while that route was being followed. Applied by
    /// `finishedFollowing()` so a run's route is never pulled out from under it.
    private(set) var pendingRemovals: Set<String> = []

    enum AddResult: Equatable {
        case added
        case replaced
        /// Already stored at this revision or a newer one.
        case unchanged
        /// A new route and no room for it.
        case full
    }

    /// Stores `route`, replacing the stored copy when this one is newer. A
    /// route that was marked for removal while being followed is kept: sending
    /// it again is the phone changing its mind.
    mutating func add(_ route: WatchRoute, updatedAt: Double, now: Date) -> AddResult {
        pendingRemovals.remove(route.id)
        let stored = WatchStoredRoute(route: route, updatedAt: updatedAt, addedAt: now)
        if let index = entries.firstIndex(where: { $0.id == route.id }) {
            guard updatedAt > entries[index].updatedAt else { return .unchanged }
            entries[index] = stored
            return .replaced
        }
        guard entries.count < Self.capacity else { return .full }
        entries.append(stored)
        return .added
    }

    /// Removes the route, unless it is `followingId`: then the removal waits
    /// for `finishedFollowing()`. True when it went now.
    @discardableResult
    mutating func remove(id: String, followingId: String?) -> Bool {
        guard entries.contains(where: { $0.id == id }) else {
            pendingRemovals.remove(id)
            return false
        }
        if id == followingId {
            pendingRemovals.insert(id)
            return false
        }
        entries.removeAll { $0.id == id }
        pendingRemovals.remove(id)
        return true
    }

    /// Applies the removals that were held back. True when any route went.
    @discardableResult
    mutating func finishedFollowing() -> Bool {
        guard !pendingRemovals.isEmpty else { return false }
        let before = entries.count
        entries.removeAll { pendingRemovals.contains($0.id) }
        pendingRemovals.removeAll()
        return entries.count != before
    }

    func route(id: String) -> WatchStoredRoute? {
        entries.first { $0.id == id }
    }

    /// Name order, so the wrist list does not reshuffle when a route is re-sent.
    var sortedByName: [WatchStoredRoute] {
        entries.sorted {
            let order = $0.route.name.localizedCaseInsensitiveCompare($1.route.name)
            return order == .orderedSame ? $0.id < $1.id : order == .orderedAscending
        }
    }

    var isFull: Bool { entries.count >= Self.capacity }
}

extension WatchRoute {
    /// Length of the line in metres.
    var lengthMeters: Double {
        WatchRouteTracker.cumulativeDistances(points).last ?? 0
    }
}
