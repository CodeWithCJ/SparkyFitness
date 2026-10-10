#if DEBUG
import Foundation

/// Fills the stores with `SampleDay` data at launch so a simulator with no
/// paired phone can still render populated pages for screenshots.
///
/// Driven by launch environment variables rather than a deep link: `simctl
/// openurl` is unreliable against a watchOS simulator, while `simctl launch`
/// passes environment straight through via `SIMCTL_CHILD_*`. It also keeps
/// `WatchDeepLink` alone, which would otherwise need a fourth copy of its
/// scheme string kept in sync.
///
/// `#if DEBUG` so none of this reaches a release build. The CI job in
/// `.github/workflows/ios-build.yml` is the only caller.
enum ScreenshotSeed {

    /// Which workout state to render.
    enum WorkoutState: String {
        /// Mid-workout with a live heart rate.
        case active
        /// A set just logged, so the rest countdown is on screen.
        case resting
        /// A countdown hold beside a weight box.
        case timed
        /// A hold with no planned length: the stopwatch.
        case stopwatch
        /// An AMRAP, so the interval caption shows.
        case interval
        /// Nothing armed — what the tab shows until the phone starts a workout.
        case none
    }

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SEED"] == "1"
    }

    /// Page to land on, as a `ContentView.Page` raw name. Nil leaves the
    /// normal landing logic alone.
    static var requestedPage: String? {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_PAGE"]
    }

    /// Opens the exercise picker on appear. A sheet cannot be driven from
    /// `simctl` the way a launch environment can, so the view checks this.
    static var opensExerciseList: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "exercises"
    }

    /// Opens the effort screen for the current set on appear.
    static var opensRpe: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "rpe"
    }

    /// Opens the "Update Workout?" question on appear.
    static var opensPresetUpdate: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "updatealert"
    }

    private static var workoutState: WorkoutState {
        WorkoutState(
            rawValue: ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_WORKOUT"] ?? ""
        ) ?? .none
    }

    /// Seeds both stores. Safe to call once, from `ContentView.onAppear`.
    ///
    /// The check-in context matters even for a workout screenshot: without a
    /// seed weight `needsFirstRunEntry` is true and `ContentView` shows the
    /// first-run gate instead of the tabs, so every screenshot would be of
    /// that one screen.
    @MainActor
    static func apply() {
        CheckInStore.shared.apply(context: SampleDay.context)

        let workout = WorkoutSessionStore.shared
        switch workoutState {
        case .none:
            workout.reset()
        case .timed, .stopwatch, .interval:
            switch workoutState {
            case .timed: workout.start(with: SampleDay.timedPlan)
            case .stopwatch: workout.start(with: SampleDay.stopwatchPlan)
            default: workout.start(with: SampleDay.intervalPlan)
            }
            workout.recordHeartRate(bpm: SampleDay.workoutBpm)
            workout.recordActiveEnergy(kcal: SampleDay.workoutKcal)
        case .active, .resting:
            workout.start(with: SampleDay.workoutPlan)
            workout.recordHeartRate(bpm: SampleDay.workoutBpm)
            workout.recordActiveEnergy(kcal: SampleDay.workoutKcal)
            if workoutState == .resting {
                // Completing a set is what starts its rest, so this is also
                // how the rest screen gets on screen.
                workout.completeCurrentSet()
            }
        }
    }
}
#endif
