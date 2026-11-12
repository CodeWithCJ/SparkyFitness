import CoreGraphics

/// Where a scroll of the workout's vertical pages may come to rest: the
/// metrics, the set screen and the top of the More list are each one screen
/// apart and snap; below `moreTop` the More list scrolls freely.
enum WorkoutPageSnap {
    static func snapped(_ y: CGFloat, moreTop: CGFloat, pageHeight: CGFloat) -> CGFloat {
        guard pageHeight > 0, moreTop > 0, y < moreTop else { return y }
        let pages = ((moreTop - y) / pageHeight).rounded()
        return Swift.max(0, moreTop - pages * pageHeight)
    }
}
