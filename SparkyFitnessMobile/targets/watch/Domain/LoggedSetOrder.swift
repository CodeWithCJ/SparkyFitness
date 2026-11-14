import Foundation

/// The logged sets in the order they were logged, and the steps `‹` and `›`
/// take through them on Edit previous set.
enum LoggedSetOrder {
    /// `order` without the sets no longer logged, then any newly logged set
    /// after them (several at once, from the phone, in plan order).
    static func synced(_ order: [String], completed: Set<String>, planOrder: [String]) -> [String] {
        var result = order.filter(completed.contains)
        let known = Set(result)
        result += planOrder.filter { completed.contains($0) && !known.contains($0) }
        return result
    }

    /// The set logged before the one at `index`; nil at the oldest.
    static func older(than index: Int) -> Int? {
        index > 0 ? index - 1 : nil
    }

    enum Newer: Equatable {
        case set(Int)
        /// Past the newest logged set: back to the current set.
        case current
    }

    static func newer(than index: Int, count: Int) -> Newer {
        index + 1 < count ? .set(index + 1) : .current
    }
}
