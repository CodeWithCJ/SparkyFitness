import WatchKit

/// Tap feedback for the watch's buttons. On the wrist a press is easy to miss
/// — a sweaty finger, a glance away mid-set — so every button confirms it
/// registered, and all of them feel the same because they go through here.
///
/// Everything the watch plays goes through here, so the phone's Settings →
/// Haptics switch (`WatchContext.effectiveHapticsEnabled`, which rides in the
/// watch context) silences all of it. Two exceptions: the Digital Crown's own
/// detent feedback is switched by the same setting where a view turns it on,
/// and the rest-finished buzz in `WatchAppDelegate` also honors the phone's
/// rest-alerts setting (`effectiveRestBuzzEnabled`).
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

    /// A check-in was saved and sent.
    static func saved() {
        play(.success)
    }

    /// A wrist run auto-paused because the wearer stopped moving.
    static func autoPaused() {
        play(.stop)
    }

    /// A wrist run resumed on its own because the wearer started moving again.
    static func autoResumed() {
        play(.start)
    }

    /// An interval plan moved to its next step. Two firm taps so it reads on
    /// a moving wrist, and differs from a button press.
    static func step() {
        play(.notification)
    }

    /// A turn on the followed route is coming up.
    static func routeCue() {
        play(.notification)
    }

    /// The wearer has left the followed route.
    static func offRoute() {
        play(.failure)
    }

    /// Back on the route, or at its end.
    static func onRoute() {
        play(.success)
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
