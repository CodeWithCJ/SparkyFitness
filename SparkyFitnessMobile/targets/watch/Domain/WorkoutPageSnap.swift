import CoreGraphics

/// Where the workout's vertical pages come to rest. The pages above the More
/// list (the exercise's demo when it has pictures, the live metrics, the set
/// screen) and the top of More are each a stop, taken from where those views
/// actually sit in the scroll rather than worked out from a screen height, so a
/// stop can never be off from its page. Above the last stop a scroll ends on
/// the nearest one; below it the More list scrolls freely.
enum WorkoutPageSnap {
    static func snapped(_ y: CGFloat, stops: [CGFloat]) -> CGFloat {
        guard let last = stops.max(), y < last else { return y }
        return stops.min { abs($0 - y) < abs($1 - y) } ?? y
    }
}
