import Foundation

/// The URLs complications hand back to the watch app when tapped, so each one
/// opens the page it is about.
///
/// Mirror of `WatchDeepLink` in targets/watch — each `expo-target` is its own
/// compiled module, so the two can't share a file. The app side owns parsing;
/// this side only needs to produce. If the scheme or a case changes here,
/// change it there (and in `WATCH_URL_SCHEME` in
/// targets/watch/expo-target.config.js, which registers the scheme).
enum ComplicationLink: String {
    /// Daily Energy Goal → the Goals summary page.
    case goals
    /// Water intake → the water page. Both still to be built; the case exists
    /// so a new water complication only has to reference it.
    case water

    static let scheme = "sparkyfitness-watch"

    var url: URL? { URL(string: "\(Self.scheme)://\(rawValue)") }
}
