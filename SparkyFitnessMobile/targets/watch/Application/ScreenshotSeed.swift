#if DEBUG
import Foundation
import SwiftUI

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
        /// A set already logged and its rest skipped, so Edit previous has one.
        case logged
        /// A finished workout that changed from its saved one: the summary.
        case summary
        /// Nothing armed — what the tab shows until the phone starts a workout.
        case none
    }

    /// Set when seeding writes persisted state, so a later normal launch can drop it.
    static let seededKey = "sparky.screenshotSeeded"

    static var isEnabled: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SEED"] == "1"
    }

    /// Page to land on, as a `ContentView.Page` raw name. Nil leaves the
    /// normal landing logic alone.
    static var requestedPage: String? {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_PAGE"]
    }

    /// Settings the phone would send, as a comma list in
    /// `SPARKY_SCREENSHOT_OPTIONS`: `nometrics`, `upnext`, `large`, `lbs` (pounds, with the bench at 105 lb), `fast`, `demo` (demo pictures for the mockup plan's bench press), `longname`, `newworkout`, `countdown`, `topmetrics` (the new view's top line starts on
    /// heart rate and calories), `dimmed` (the new view as the always-on display draws it).
    static func has(_ option: String) -> Bool {
        (ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_OPTIONS"] ?? "")
            .split(separator: ",")
            .contains { $0 == option }
    }

    /// Opens the exercise picker on appear. A sheet cannot be driven from
    /// `simctl` the way a launch environment can, so the view checks this.
    static var opensExerciseList: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "exercises"
    }

    /// Which scroll page of the active workout to land on: setoptions,
    /// exerciseoptions or actions.
    static var workoutPage: String? {
        let v = ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"]
        return ["upnext", "swap", "metrics", "demo", "setoptions", "exerciseoptions", "actions", "plates"].contains(v) ? v : nil
    }

    /// The mockup plan's Incline Bench Press gets demo pictures (`demo` option or
    /// `SPARKY_SCREENSHOT_SHEET=demo`, which also scrolls to the page).
    static var showsDemo: Bool {
        has("demo") || ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "demo"
    }
    static let demoImageKey = "sample-incline-bench-press"

    /// Opens the plates detail from More (`SPARKY_SCREENSHOT_SHEET=plates`).
    static var opensPlates: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "plates"
    }

    /// Shows the New PR screen over the set on appear (`SPARKY_SCREENSHOT_SHEET=newpr`).
    static var opensNewPr: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "newpr"
    }

    /// Opens Edit previous set on appear (`SPARKY_SCREENSHOT_SHEET=editprevious`,
    /// with workout state `logged`).
    static var opensEditPrevious: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "editprevious"
    }

    /// Opens the effort screen for the current set on appear.
    static var opensSwap: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "swap"
    }

    static var opensRpe: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "rpe"
    }

    /// Opens the first dose still due on the Medications page.
    static var opensMedicationDose: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "dose"
    }

    /// Opens the "Update Workout?" question on appear.
    static var opensPresetUpdate: Bool {
        ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_SHEET"] == "updatealert"
    }

    /// Frozen readings for a pixel-for-pixel comparison with the design mockups
    /// (`mockup` option): elapsed time, and the rest's time left.
    static var frozen: Bool { has("mockup") && !has("live") }
    static var elapsedOverride: Int? { frozen ? 24 * 60 + 18 : nil }
    static var restRemainingOverride: Int? { frozen ? 78 : nil }

    static var holdRemainingOverride: Int? { frozen ? 32 : nil }
    /// The Get ready screen as the mockup draws it: a 3, the ring two thirds full.
    static var getReadyFrozen: (number: Int, fraction: Double)? { has("holdcountdown") ? (3, 2.0 / 3.0) : nil }

    /// `SPARKY_SCREENSHOT_AT`: the mockup plan's block to land on (1...6, with
    /// 6 the superset), or a set id.
    private static var landingSetId: String {
        switch ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_AT"] ?? "2" {
        case "1": return "m1a"
        case "3": return "m30"
        case "4": return "m42"
        case "5": return "m51"
        case "6": return "m6a"
        default: return "m2b"
        }
    }

    @MainActor
    private static func seedMockup(_ workout: WorkoutSessionStore) {
        workout.start(with: SampleDay.mockupPlan)
        workout.recordHeartRate(bpm: Double(ProcessInfo.processInfo.environment["SPARKY_SCREENSHOT_BPM"] ?? "") ?? 141)
        workout.recordActiveEnergy(kcal: 186)
        // Logged before the screen under test: both band sets, the first
        // bench set, a carry pair, the first pull-up.
        for id in ["m1a", "m1b", "m2a", "m40", "m41", "m50"] {
            workout.goToStep(setId: id)
            workout.completeCurrentSet()
            workout.skipRest()
        }
        workout.goToStep(setId: landingSetId)
        if has("pr") { workout.setValue(for: "m2b", weightKg: 85, reps: 8) }
        if has("holdrunning") { workout.startHold(for: "m30", seconds: 60) }
        // Long enough that the screenshot is taken while it is still counting.
        if has("holdcountdown") {
            // The app delegate's hook may not be set yet this early.
            workout.holdCountdownEnabled = { true }
            workout.beginHold(for: "m30", seconds: 60, getReady: 3600)
        }
        if workoutState == .resting {
            workout.completeCurrentSet()
        }
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
        UserDefaults.standard.set(true, forKey: seededKey)
        CheckInStore.shared.apply(context: SampleDay.context)

        // As if the phone had sent them: files in the watch's cache.
        if showsDemo {
            ExerciseDemoStore.shared.seed(key: demoImageKey, jpegs: ScreenshotDemoImages.inclineBenchPress)
        }

        let workout = WorkoutSessionStore.shared
        // The app delegate's hook may not be set yet this early, and a rest
        // seeded here schedules its countdown cues at once.
        workout.countdownSeconds = { CheckInStore.shared.context.effectiveWorkoutCountdown }
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
        case .logged:
            workout.start(with: SampleDay.workoutPlan)
            workout.recordHeartRate(bpm: SampleDay.workoutBpm)
            workout.recordActiveEnergy(kcal: SampleDay.workoutKcal)
            workout.completeCurrentSet()
            workout.skipRest()
        case .summary:
            workout.reset()
            workout.recordSummary(SampleDay.workoutSummary)
        case .active where has("mockup"), .resting where has("mockup"):
            seedMockup(workout)
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

/// Draws the app as the always-on display does, for a screenshot with the
/// `dimmed` option: the simulator has no wrist-down state to wait for.
struct ForcedDimming: ViewModifier {
    @Environment(\.isLuminanceReduced) private var real

    func body(content: Content) -> some View {
        content.environment(\.isLuminanceReduced, real || (ScreenshotSeed.isEnabled && ScreenshotSeed.has("dimmed")))
    }
}
#endif
