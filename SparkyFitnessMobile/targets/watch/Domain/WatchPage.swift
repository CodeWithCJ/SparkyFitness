import Foundation

/// A swipeable page of the watch app.
///
/// The raw values are wire strings: the phone's Settings → Apple Watch screen
/// sends its order and hidden set as these names (`WATCH_PAGE_KEYS` in
/// `src/constants/watchPages.ts`), so renaming a case on one side alone makes
/// the other drop it. Case order is the factory swipe order.
enum WatchPage: String, CaseIterable {
    case goals, water, medications, entry, trend, workout, fasting, steps
    /// System Now Playing. Not arrangeable: it sits right after the Workout
    /// page, and only while a workout is running.
    case nowPlaying
    /// The phone's GPS recording used to have a page of its own here. It now
    /// shows on the Workout page, so this is never put in the page list; the
    /// case stays so a stored or phone-sent page name still decodes.
    case recording

    /// The pages to show, in swipe order.
    ///
    /// Names the watch doesn't know, and repeats, are dropped; a page the saved
    /// order doesn't mention (one added in a later build) goes on the end, so a
    /// new page is never hidden just because the order predates it.
    ///
    /// A hidden Workout page still shows while a workout is running: the phone
    /// starts workouts on the wrist, and hiding the page it lands on would
    /// leave that workout with nowhere to be tracked. An order that hides
    /// everything shows everything — the phone won't send one, but a watch with
    /// no pages at all would be stuck.
    static func visible(
        order: [String]?,
        hidden: [String]?,
        workoutActive: Bool
    ) -> [WatchPage] {
        var ordered: [WatchPage] = []
        for name in order ?? [] {
            guard let page = WatchPage(rawValue: name), page != .nowPlaying,
                  page != .recording, !ordered.contains(page) else { continue }
            ordered.append(page)
        }
        for page in allCases where page != .nowPlaying && page != .recording && !ordered.contains(page) {
            ordered.append(page)
        }

        let hiddenPages = Set((hidden ?? []).compactMap(WatchPage.init(rawValue:)))
        let shown = ordered.filter { page in
            !hiddenPages.contains(page) || (page == .workout && workoutActive)
        }
        let pages = shown.isEmpty ? ordered : shown
        guard workoutActive else { return pages }
        // Next to the workout, wherever the wearer put that page. Workout is
        // always in `pages` while a workout is active (see above).
        var withMusic = pages
        let after = withMusic.firstIndex(of: .workout).map { $0 + 1 } ?? withMusic.count
        withMusic.insert(.nowPlaying, at: after)
        return withMusic
    }
}
