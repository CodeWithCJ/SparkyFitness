import CoreGraphics

/// The vertical pages of the new workout view, from the top: the exercise's
/// demo (only when it has pictures), the live metrics and the set screen, then
/// the More list below.
enum WorkoutPageSnap {
    enum Page: Equatable { case demo, metrics, set }

    /// The snapping pages above More, in order.
    static func pages(hasDemo: Bool) -> [Page] {
        hasDemo ? [.demo, .metrics, .set] : [.metrics, .set]
    }

    /// Where a scroll of the pages may come to rest: the demo, the metrics, the
    /// set screen and the top of the More list are each one screen apart and
    /// snap; below `moreTop` the More list scrolls freely. A demo page is one
    /// more screen above the metrics, which the rounding already allows for.
    static func snapped(_ y: CGFloat, moreTop: CGFloat, pageHeight: CGFloat) -> CGFloat {
        guard pageHeight > 0, moreTop > 0, y < moreTop else { return y }
        let pages = ((moreTop - y) / pageHeight).rounded()
        return Swift.max(0, moreTop - pages * pageHeight)
    }

    /// The scroll offset of `page`, measured from the top of the first page.
    static func offset(of page: Page, hasDemo: Bool, pageHeight: CGFloat) -> CGFloat {
        CGFloat(pages(hasDemo: hasDemo).firstIndex(of: page) ?? 0) * pageHeight
    }
}
