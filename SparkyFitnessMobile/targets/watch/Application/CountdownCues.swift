import Foundation

/// The audible countdown: one-shot timers that fire a cue at each of the last
/// seconds before a deadline. Scheduled against the deadline rather than
/// counted off a repeating timer, so a late tick cannot skip or double a cue.
/// They run on the main run loop, which keeps going with the wrist down while
/// the workout's `HKWorkoutSession` is active, as the rest and hold timers do.
@MainActor
final class CountdownCues {
    private var timers: [Timer] = []

    /// Replaces any scheduled cues with one for each of the last `seconds`
    /// seconds before `endsAt` that is still ahead. `seconds` of 0 schedules none.
    func schedule(endsAt: Date, seconds: Int, cue: @escaping () -> Void) {
        cancel()
        guard seconds > 0 else { return }
        let now = Date()
        for remaining in 1...seconds {
            let fireAt = endsAt.addingTimeInterval(-TimeInterval(remaining))
            guard fireAt > now else { continue }
            let timer = Timer(fire: fireAt, interval: 0, repeats: false) { _ in
                Task { @MainActor in cue() }
            }
            RunLoop.main.add(timer, forMode: .common)
            timers.append(timer)
        }
    }

    func cancel() {
        timers.forEach { $0.invalidate() }
        timers.removeAll()
    }
}
