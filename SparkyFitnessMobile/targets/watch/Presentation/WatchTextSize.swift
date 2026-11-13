import SwiftUI

/// Whether the watch uses the larger text the Goals, Water, Workout and other
/// pages were given (#3191). Off (the default) is the original, smaller type.
/// `ContentView` sets it from the phone's "Larger text on the watch" setting
/// (`largerText` in the context).
private struct WatchLargeTextKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var watchLargeText: Bool {
        get { self[WatchLargeTextKey.self] }
        set { self[WatchLargeTextKey.self] = newValue }
    }
}

private struct WatchFontModifier: ViewModifier {
    let font: Font
    let classic: Font

    @Environment(\.watchLargeText) private var large

    func body(content: Content) -> some View {
        content.font(large ? font : classic)
    }
}

extension View {
    /// `font` while larger text is on, `classic` (the original size) while off.
    func watchFont(_ font: Font, classic: Font) -> some View {
        modifier(WatchFontModifier(font: font, classic: classic))
    }
}
