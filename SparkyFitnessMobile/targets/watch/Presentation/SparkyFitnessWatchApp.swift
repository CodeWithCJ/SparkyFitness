import SwiftUI

@main
struct SparkyFitnessWatchApp: App {
    // Both are @MainActor singletons: the session must be activated as early as
    // possible so queued check-ins from a previous launch start delivering
    // before the wearer taps anything.
    @StateObject private var session = WatchSessionManager.shared
    @StateObject private var store = CheckInStore.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(session)
                .environmentObject(store)
        }
    }
}
