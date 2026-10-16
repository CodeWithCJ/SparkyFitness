import WatchKit

/// Tap feedback for the watch's buttons. On the wrist a press is easy to miss
/// — a sweaty finger, a glance away mid-set — so every button confirms it
/// registered, and all of them feel the same because they go through here.
///
/// Presses that already play something stay as they are: a container square
/// clicks on its own, and a check-in save plays `.success` once it is sent.
///
/// Follows the phone's Settings → Haptics switch, which rides in the watch
/// context (`WatchContext.effectiveHapticsEnabled`).
enum Haptics {
    /// An ordinary button press.
    static func tap() {
        play(.click)
    }

    /// Logging a set, the one press that records something, so it reads
    /// differently from moving around.
    static func setLogged() {
        play(.success)
    }

    /// An interval plan moved to its next step. Two firm taps so it reads on
    /// a moving wrist, and differs from a button press.
    static func step() {
        play(.notification)
    }

    /// The pace has left the wearer's range. Down means ease off, up means
    /// speed up, so it can be read without looking.
    static func pace(tooFast: Bool) {
        play(tooFast ? .directionDown : .directionUp)
    }

    /// The heart rate has left the wearer's range. Down means ease off, up
    /// means speed up, the same as the pace alert's taps.
    static func heartRate(tooHigh: Bool) {
        play(tooHigh ? .directionDown : .directionUp)
    }

    /// Called from button actions and the recording store, which run on the main actor.
    private static func play(_ type: WKHapticType) {
        MainActor.assumeIsolated {
            guard CheckInStore.shared.context.effectiveHapticsEnabled else { return }
            WKInterfaceDevice.current().play(type)
        }
    }

    /// `action`, preceded by a tap, for buttons built as `Button(action:)`.
    static func tapping(_ action: @escaping () -> Void) -> () -> Void {
        {
            tap()
            action()
        }
    }
}
