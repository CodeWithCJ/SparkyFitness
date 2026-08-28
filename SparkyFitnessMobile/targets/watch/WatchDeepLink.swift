import Foundation

/// Destinations this app can be opened straight to from outside itself — today
/// that means tapping one of its complications on the watch face.
///
/// URLs look like `sparkyfitness-watch://goals`: the scheme identifies us, the
/// host names the destination. The scheme is registered in this target's
/// Info.plist, which `expo-target.config.js` writes.
///
/// There are two other copies of that scheme string, because a JS config and
/// two separately-compiled Swift targets have no way to share a constant:
///   - `WATCH_URL_SCHEME` in targets/watch/expo-target.config.js
///   - `ComplicationLink` in targets/watch-widget/ComplicationLinks.swift
/// Change one, change all three.
enum WatchDeepLink: String {
    /// Daily Energy Goal complication → the Goals summary page.
    case goals
    /// Water intake complication → the water page.
    ///
    /// Neither the complication nor the page exists yet; the case is here so
    /// the scheme registration, the widget-side link and the routing switch
    /// are already in place when they land. Until then `ContentView` maps this
    /// to no page, so a link arriving early does nothing rather than jumping
    /// somewhere wrong.
    case water

    static let scheme = "sparkyfitness-watch"

    /// Nil for anything that isn't one of our links — a scheme we don't own, or
    /// a destination this build doesn't know. Both are ignored rather than
    /// guessed at.
    /// Reads the destination out via `URLComponents` rather than `URL.host`:
    /// the property form is soft-deprecated on current SDKs while its
    /// replacement `host()` needs watchOS 9+, and this target's deployment
    /// target is explicitly documented as lowerable.
    init?(url: URL) {
        guard
            url.scheme == Self.scheme,
            let host = URLComponents(url: url, resolvingAgainstBaseURL: false)?.host,
            !host.isEmpty
        else { return nil }
        self.init(rawValue: host)
    }

    var url: URL? { URL(string: "\(Self.scheme)://\(rawValue)") }
}
