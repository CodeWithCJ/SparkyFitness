import Foundation

/// The audible countdown: one-shot timers that fire a tick at each of the last
/// seconds before a deadline and a final cue at zero. Scheduled against the
/// deadline rather than counted off a repeating timer, so spacing is exact and
/// a late poll cannot skip or double a cue. They run on the main run loop,
/// which keeps going with the wrist down while the workout's `HKWorkoutSession`
/// is active, as the rest and hold timers do.
@MainActor
final class CountdownCues {
    private var timers: [Timer] = []

    /// Replaces any scheduled cues with a `tick` for each of the last `seconds`
    /// seconds before `endsAt` that is still ahead, then `end` at `endsAt`.
    /// `seconds` of 0 schedules nothing: the caller buzzes the end itself.
    func schedule(endsAt: Date, seconds: Int, tick: @escaping () -> Void, end: @escaping () -> Void) {
        cancel()
        guard seconds > 0 else { return }
        let now = Date()
        for remaining in 0...seconds {
            let fireAt = endsAt.addingTimeInterval(-TimeInterval(remaining))
            guard fireAt > now else { continue }
            let cue = remaining == 0 ? end : tick
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
