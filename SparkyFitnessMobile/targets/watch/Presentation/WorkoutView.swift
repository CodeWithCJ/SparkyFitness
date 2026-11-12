import SwiftUI
import WatchKit

/// Whether the Workout page is the one on screen. A page-style `TabView` keeps
/// neighbouring pages alive, and a double-tap must not log a set from, say,
/// the Water page. `ContentView` sets it from its page selection.
private struct WorkoutPageActiveKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var workoutPageActive: Bool {
        get { self[WorkoutPageActiveKey.self] }
        set { self[WorkoutPageActiveKey.self] = newValue }
    }
}

private extension View {
    /// The watch's double-tap gesture (watchOS 11 and a supporting model)
    /// presses this button. Older systems have no such gesture, so the button
    /// is left alone.
    @ViewBuilder
    func doubleTapGesture(enabled: Bool) -> some View {
        if #available(watchOS 11.0, *), enabled {
            self.handGestureShortcut(.primaryAction)
        } else {
            self
        }
    }
}

/// Dark-theme category colours, in the same order as `SUPERSET_PALETTE_VARS`
/// (`workoutSupersets.ts`). Run 0 is blue, then orange, violet, green, pink,
/// teal, amber, slate. Values are the dark `--color-cat-*` tokens from
/// `global.css`, not the light ones — the watch UI is always dark.
enum SetSupersetPalette {
    private static let rgb: [(Double, Double, Double)] = [
        (186, 117, 237), (209, 138, 97), (145, 102, 204), (106, 164, 111),
        (204, 102, 136), (90, 173, 175), (212, 169, 84), (110, 118, 135),
    ]

    /// The mockup draws a superset in one light colour throughout (lilac
    /// #D9B3F5 for the first), so text, bars and the pill share the tint.
    static func color(for run: Int) -> Color { tint(for: run).color }

    /// The set screen's colour for a superset member: its category colour
    /// lightened so text in it reads on the dark tiles.
    static func tint(for run: Int) -> SetTint {
        let c = rgb[abs(run) % rgb.count]
        func light(_ v: Double) -> Double { (v + (255 - v) * 0.45) / 255 }
        return SetTint(r: light(c.0), g: light(c.1), b: light(c.2))
    }
}

/// The Workout tab. With no session running, the saved workouts the phone
/// last sent are listed here; tapping one asks the phone to start it and
/// arm this tab. Once a session is running, one set is on screen at a time.
///
/// Laid out one set at a time rather than as a list of an exercise's sets:
/// the wearer is mid-lift looking at a 40mm screen, so the two numbers they
/// might change are big enough to hit, and everything else pages out of the
/// way. `<` and `>` walk the whole workout's sets in order.
struct WorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var run: WatchRunStore
    @EnvironmentObject private var recording: RecordingStore

    @EnvironmentObject private var checkIn: CheckInStore

    /// "85 kg × 8": what the set that set the record was.
    private var prDetail: String? {
        guard let id = store.prBannerSetId, let step = store.steps.first(where: { $0.plannedSet.setId == id }) else { return nil }
        return SetValueText.target(for: step, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit, spaced: true)
    }

    var body: some View {
        Group {
            if store.isActive {
                ActiveWorkoutView()
                    .overlay {
                        if let exercise = store.prBannerExercise {
                            NewPrView(exercise: exercise, detail: prDetail) { store.dismissPrBanner() }
                                .transition(.opacity)
                        }
                    }
                    .animation(.easeOut(duration: 0.25), value: store.prBannerExercise)
            } else if run.isActive {
                // A walk or run recorded on the wrist alone, started from the
                // Cardio row below.
                WatchRunView()
            } else if recording.isActive {
                // A walk, run or ride the phone is recording with its GPS.
                // It is the workout going on, so it shows here rather than on
                // a page of its own.
                RecordingView()
            } else if let summary = store.lastSummary {
                WorkoutFinishSummaryView(summary: summary)
            } else {
                WaitingForWorkoutView()
            }
        }
    }
}

private struct WaitingForWorkoutView: View {
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var run: WatchRunStore
    /// The singleton, not an environment object: a screen that renders this
    /// view without injecting one (a preview, the screenshot harness) still works.
    @ObservedObject private var routeLibrary = WatchRouteLibraryStore.shared
    /// Whether the Cardio choices are up.
    @State private var choosingCardio = false
    /// The preset just tapped. Blocks a second tap from starting two
    /// sessions before the first one arrives. Cleared after a few seconds
    /// so a start the phone could not finish can be tried again.
    @State private var startingId: String?

    var body: some View {
        VStack(spacing: WatchStyle.s(4)) {
            // One row for every walk and run; the four choices are behind it
            // so they do not crowd out the saved workouts. Hidden while
            // something else holds the watch's single workout session.
            if run.canStart {
                Button {
                    Haptics.tap()
                    choosingCardio = true
                } label: {
                    Label(String(localized: "watch.cardio.title", defaultValue: "Cardio"), systemImage: "figure.run")
                        .font(.system(size: WatchStyle.s(19), weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12)
                        .padding(.vertical, WatchStyle.s(12))
                        .background(Color.green.opacity(0.25), in: WatchStyle.shape)
                        .contentShape(WatchStyle.shape)
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 4)
            }
            workoutPicker
        }
        .sheet(isPresented: $choosingCardio) {
            CardioChoicesView(
                plans: checkIn.context.runPlans ?? [],
                routes: routeLibrary.routes,
                usesMiles: checkIn.context.distanceUnit == "miles",
                suggestedPace: checkIn.context.runPaceBand ?? .standard,
                suggestedHeartRate: checkIn.context.runHeartRateBand ?? .standard,
                onChoose: { kind, place, plan, alerts in
                    choosingCardio = false
                    run.start(kind, place: place, plan: plan, alerts: alerts)
                },
                // A stored route needs nothing from the phone: the line and
                // its turns are already on the watch.
                onChooseRoute: { kind, route, alerts in
                    choosingCardio = false
                    run.start(kind, place: .outdoor, alerts: alerts, route: route)
                }
            )
        }
    }

    @ViewBuilder
    private var workoutPicker: some View {
        let all = checkIn.context.startableWorkouts ?? []
        // Today's planned workouts come first. Only ones the phone can start
        // (it lists them among the saved workouts), and not again below.
        let startableIds = Set(all.map(\.presetId))
        let scheduled = (checkIn.context.scheduledWorkouts ?? [])
            .filter { startableIds.contains($0.presetId) }
        let scheduledIds = Set(scheduled.map(\.presetId))
        let workouts = all.filter { !scheduledIds.contains($0.presetId) }
        if workouts.isEmpty && scheduled.isEmpty {
            VStack(spacing: 6) {
                Image(systemName: "figure.strengthtraining.traditional")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text(String(localized: "watch.workout.startOnPhone", defaultValue: "Start a workout on your phone"))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, 8)
        } else {
            // The same flat squircles as the set screens, rather than the
            // stock list, so the first screen matches the ones after it.
            ScrollView {
                VStack(spacing: 6) {
                    // By position: two plans can share a name and a workout.
                    ForEach(Array(scheduled.enumerated()), id: \.offset) { _, workout in
                        Button {
                            Haptics.tap()
                            start(presetId: workout.presetId)
                        } label: {
                            scheduledRow(workout)
                        }
                        .buttonStyle(.plain)
                        .disabled(startingId != nil && startingId != workout.presetId)
                        .opacity(startingId != nil && startingId != workout.presetId ? 0.4 : 1)
                    }
                    ForEach(workouts) { workout in
                        Button {
                            Haptics.tap()
                            start(presetId: workout.presetId)
                        } label: {
                            Text(startingId == workout.presetId ? "Starting…" : workout.name)
                                .font(.system(size: WatchStyle.s(19), weight: .semibold))
                                .foregroundStyle(.white)
                                .multilineTextAlignment(.leading)
                                .lineLimit(2)
                                .minimumScaleFactor(0.8)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .padding(.vertical, WatchStyle.s(12))
                                .background(WatchStyle.fill, in: WatchStyle.shape)
                                .contentShape(WatchStyle.shape)
                        }
                        .buttonStyle(.plain)
                        .disabled(startingId != nil && startingId != workout.presetId)
                        .opacity(startingId != nil && startingId != workout.presetId ? 0.4 : 1)
                    }
                }
                .padding(.horizontal, 4)
                // A scrolling page already starts below the clock.
                .padding(.top, WatchStyle.s(4))
            }
        }
    }

    /// Today's planned workout: the plan and what it is on, over the workout's
    /// name, with a play mark. Tinted blue like the phone's plan card.
    private func scheduledRow(_ workout: ScheduledWorkout) -> some View {
        let blue = Color(red: 0.31, green: 0.51, blue: 0.96)
        return VStack(alignment: .leading, spacing: 4) {
            // On its own line, across the whole row: beside the play mark
            // there was no room for it on a 40 mm watch.
            HStack(spacing: 4) {
                Image(systemName: "calendar")
                // The caption alone ("Scheduled Today"): the plan's name
                // beside it did not fit, and the workout's name says enough.
                Text(workout.caption)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(blue)
            HStack(spacing: 8) {
                Text(startingId == workout.presetId ? "Starting…" : workout.name)
                    .font(.system(size: WatchStyle.s(19), weight: .semibold))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.leading)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "play.fill")
                    .font(.system(size: WatchStyle.s(13), weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: WatchStyle.s(30), height: WatchStyle.s(30))
                    .background(blue, in: Circle())
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, WatchStyle.s(10))
        .background(blue.opacity(0.18), in: WatchStyle.shape)
        .contentShape(WatchStyle.shape)
    }

    private func start(presetId: String) {
        guard startingId == nil else { return }
        startingId = presetId
        session.requestWorkoutStart(
            presetId: presetId,
            serverId: checkIn.context.workoutServerId
        )
        DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
            if startingId == presetId {
                startingId = nil
            }
        }
    }
}

/// Format name and time left on the cap. Nil for an ordinary set workout.
/// Rounds added on the phone are not in this yet: the watch still has only
/// the sets it was armed with.
private func intervalCaption(plan: ActiveWorkoutPlan?, now: Date) -> String? {
    guard let format = plan?.workoutFormat?.lowercased(), format != "standard" else {
        return nil
    }
    let name: String
    switch format {
    case "amrap": name = "AMRAP"
    case "emom": name = "EMOM"
    case "tabata": name = "TABATA"
    case "for_time": name = "FOR TIME"
    default: name = format.uppercased()
    }
    guard
        let cap = plan?.timeCapSeconds, cap > 0
    else { return name }
    let clock = plan?.pausedAt ?? now
    let pausedAlready = plan?.excludedPauseSeconds ?? 0
    let left: Int
    if let capEnds = plan?.capEndsAt {
        let end = capEnds.addingTimeInterval(TimeInterval(pausedAlready))
        left = max(0, Int(end.timeIntervalSince(clock).rounded()))
    } else if let started = plan?.startedAt {
        let elapsed = Int(clock.timeIntervalSince(started)) - pausedAlready
        left = max(0, cap - max(0, elapsed))
    } else {
        return name
    }
    let minutes = left / 60
    let seconds = left % 60
    return String(format: "%@ %d:%02d", name, minutes, seconds)
}

/// Ticks once a second. `intervalCaption` reads `now` itself, so it has to
/// live in a view that redraws on a clock — the parent only redraws when the
/// store changes, which left the cap sitting still between sets.
///
/// Uses `TimelineView` rather than a `Timer.publish` stored on the view: the
/// store republishes `elapsedSeconds` every second, which re-creates this
/// struct and with it a fresh publisher that never gets to fire.
private struct IntervalCaptionView: View {
    let plan: ActiveWorkoutPlan?

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            if let caption = intervalCaption(plan: plan, now: context.date) {
                Text(caption)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.yellow)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
    }
}

private struct ActiveWorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore

    @State private var showingExercises = false
    /// Nil until the view appears: set to `.set` then, so the scroll moves
    /// to the set screen even with the metrics page above it. Starting at
    /// `.set` asked for nothing and left the scroll at the top page.
    @State private var page: WorkoutPageID?
    /// A logged set held back while the wearer picks an effort. Held here and
    /// not in `CurrentSetView`: logging a set starts the rest, which swaps that
    /// view for `RestView` and would take the screen, and the set with it,
    /// away before anything was sent. Sent once, on save, skip or dismissal.
    @State private var pendingRpe: PendingRpe?
    /// Edit previous set, over the whole page like the effort prompt: a sheet
    /// brings the system's close button over the exercise name.
    @State private var editingPrevious = false
    @Environment(\.isLuminanceReduced) private var reducedLuminance
    private var dimmedBrightness: Color { reducedLuminance || WatchStyle.forcedDimming ? Color(white: 0.55) : .white }

    /// Always available, including during rest: Finish lives in the picker
    /// sheet, and hiding the chevron while resting left no way to end the
    /// HealthKit session from the wrist.
    private var openExerciseList: (() -> Void)? {
        { showingExercises = true }
    }

    var body: some View {
        // From the top: the More list (taller than the screen, scrolled freely),
        // then the set screen and the metrics, one screen tall each and snapped
        // to. The crown scrolls only while no value box has claimed it for
        // adjusting a number.
        GeometryReader { geo in
            let pageHeight = geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
            ScrollView {
                VStack(spacing: 0) {
                    VStack(spacing: WatchStyle.m(6)) {
                        WorkoutMoreUpNextPage(onOpenList: { showingExercises = true })
                            .id(WorkoutPageID.moreUpNext)
                        if let step = store.currentStep {
                            WorkoutMoreExercisePage(step: step, onOpenList: { showingExercises = true })
                                .id(WorkoutPageID.moreExercise)
                        }
                        WorkoutMoreWorkoutPage()
                            .id(WorkoutPageID.moreWorkout)
                    }
                    .scrollTargetLayout()
                    .padding(.top, WatchStyle.top)
                    // Room under the last button and the page dots.
                    .padding(.bottom, WatchStyle.m(30))
                    setScreen
                        .workoutPage(geo, alignment: .top, fromScreenTop: true)
                        .id(WorkoutPageID.set)
                    WorkoutMetricsPage()
                        .workoutPage(geo, alignment: .top, fromScreenTop: true)
                        .id(WorkoutPageID.metrics)
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $page)
            .scrollTargetBehavior(WorkoutScrollBehavior(pageHeight: pageHeight))
            .scrollIndicators(.hidden)
            // Pages are laid out against the whole screen, so each snaps to
            // exactly one screen; `workoutPage` puts the content back inside
            // the area the clock and page dots leave free.
            .ignoresSafeArea(edges: .vertical)
            // The effort prompt and the record screen sit over these pages, so
            // only they own the double tap while they are up.
            .transformEnvironment(\.workoutPageActive) { active in
                active = active && pendingRpe == nil && store.prBannerExercise == nil
            }
        }
        // A set logged here or on the phone, an edit, or a jump from the
        // list moves the cursor: back to the set screen.
        .onChange(of: store.currentStep?.plannedSet.setId) { page = .set }
        .onAppear { page = .set }
        .padding(.horizontal, 4)
        .overlay {
            if showingExercises {
                ExerciseListView(onSelect: { store.jumpToExercise($0) }, onClose: { showingExercises = false })
                    .background(Color.black.ignoresSafeArea())
            }
        }
        // Over the whole page rather than a sheet: a sheet brings the system's
        // close button, which sat on top of the exercise name and left no room
        // on a 40 mm screen. Skip closes it, and a set waits here until then.
        .overlay {
            if editingPrevious {
                EditPreviousSetView(startingAt: EditPreviousSetView.startIndex(in: store)) { editingPrevious = false }
                    .background(Color.black.ignoresSafeArea())
            }
        }
        .overlay {
            if let pending = pendingRpe {
                RpePickerView(
                    summary: String(localized: "watch.rpe.setDone", defaultValue: "Set \(pending.step.setNumber) done"),
                    hapticsEnabled: checkIn.context.effectiveHapticsEnabled
                ) { rpe in
                    store.markPendingReadyToSend(rpe: rpe)
                    let held = store.pendingSetCompletion
                    let sent = session.sendSetCompleted(
                        pending.step,
                        values: pending.values,
                        rpe: rpe,
                        completedAt: pending.completedAt,
                        durationSeconds: held?.durationSeconds,
                        useCapturedDuration: held != nil,
                        requireDurable: true
                    )
                    if sent {
                        store.clearPendingSetCompletion()
                        pendingRpe = nil
                    }
                }
                .background(Color.black.ignoresSafeArea())
            }
        }
        .onAppear {
            if pendingRpe == nil, let pending = store.pendingSetCompletion,
               let step = store.steps.first(where: { $0.plannedSet.setId == pending.setId }) {
                pendingRpe = PendingRpe(
                    step: step,
                    values: pending.values,
                    completedAt: pending.completedAt
                )
            }
            session.retryPendingSetCompletion()
            if store.pendingSetCompletion == nil { pendingRpe = nil }
            #if DEBUG
            if ScreenshotSeed.opensExerciseList {
                showingExercises = true
            }
            if ScreenshotSeed.opensEditPrevious { editingPrevious = true }
            switch ScreenshotSeed.workoutPage {
            case "upnext": page = .moreUpNext
            case "swap", "setoptions", "exerciseoptions", "plates": page = .moreExercise
            case "metrics": page = .metrics
            case "actions": page = .moreWorkout
            default: break
            }
            if ScreenshotSeed.opensNewPr { store.seedPrBanner(ScreenshotSeed.has("mockup") ? "Incline Bench Press" : "Barbell Bench Press", setId: ScreenshotSeed.has("mockup") ? "m2b" : nil) }
            if ScreenshotSeed.opensRpe, let step = store.currentStep {
                pendingRpe = PendingRpe(
                    step: step,
                    values: store.values(for: step),
                    completedAt: Date()
                )
            }
            #endif
        }
        .onChange(of: store.pendingSetCompletion) {
            if store.pendingSetCompletion == nil { pendingRpe = nil }
        }
    }

    private var setScreen: some View {
        // The exercise pill and, under it, the time (or heart rate and
        // calories); the heart rate is also inside the rest ring.
        let holdRunning = store.currentStep.map { store.isHoldRunning($0) || store.isGetReady($0) } ?? false
        return VStack(spacing: 0) {
            if let step = store.currentStep {
                HStack(spacing: 0) {
                    SetPill(step: step) { showingExercises = true }
                    Spacer(minLength: 0)
                }
                .frame(height: WatchStyle.m(42))
            }
            // During a rest too: the ring shows the heart rate, but not the
            // elapsed time or calories.
            if !store.isResting, !holdRunning, store.currentStep != nil {
                WorkoutTopLine()
            }
            if let format = store.plan?.workoutFormat?.lowercased(), format != "standard" {
                IntervalCaptionView(plan: store.plan)
            }

            Group {
                if store.isResting {
                    RestView(onOpenList: { showingExercises = true })
                } else if let step = store.currentStep {
                    CurrentSetView(
                        step: step,
                        onOpenList: { showingExercises = true },
                        onAwaitRpe: { pendingRpe = $0 },
                        onEditPrevious: { editingPrevious = true }
                    )
                } else {
                    WorkoutCompleteView()
                }
            }
        }
        // The mockups' side margin on the 45 mm screen is 29 px; the page
        // already keeps 4 pt of its own.
        .padding(.horizontal, WatchStyle.side)
        .padding(.bottom, WatchStyle.bottom)
        .frame(maxHeight: .infinity, alignment: .top)
        // Dimmed (always-on), the screen keeps its layout at 55% brightness.
        .colorMultiply(dimmedBrightness)
    }
}

/// Free scrolling through the More list, and a snap to a whole page from the
/// set screen on: the set and the metrics are the last two pages, one screen
/// tall each, and everything above them is the list.
private struct WorkoutScrollBehavior: ScrollTargetBehavior {
    let pageHeight: CGFloat

    func updateTarget(_ target: inout ScrollTarget, context: TargetContext) {
        guard pageHeight > 0 else { return }
        let setTop = context.contentSize.height - 2 * pageHeight
        let y = target.rect.minY
        // Half a page above the set screen the list hands over to paging.
        guard y > setTop - pageHeight / 2 else {
            target.rect.origin.y = max(0, y)
            return
        }
        let pages = ((y - setTop) / pageHeight).rounded().clamped(to: 0...1)
        target.rect.origin.y = setTop + pages * pageHeight
    }
}

private extension CGFloat {
    func clamped(to range: ClosedRange<CGFloat>) -> CGFloat { Swift.min(range.upperBound, Swift.max(range.lowerBound, self)) }
}

private enum WorkoutPageID: Hashable {
    case moreUpNext, moreExercise, moreWorkout, set, metrics
}

/// Shown after the last set is logged. Finish used to live only in the
/// exercise-picker sheet, which was easy to miss.
private struct WorkoutCompleteView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        VStack(spacing: 8) {
            Spacer()
            Text(String(localized: "watch.workout.complete", defaultValue: "Workout complete"))
                .font(.headline)
            Button(String(localized: "watch.common.finish", defaultValue: "Finish")) {
                Haptics.tap()
                if !store.askPresetUpdateBeforeFinish() { session.endWorkout() }
            }
            .buttonStyle(.borderedProminent)
            .tint(.green)
            Spacer()
        }
    }
}

/// Every exercise in the preset, so the wearer can work out of order — skip
/// ahead when a machine is taken, or come back to something left half done.
/// Selecting one resumes it at its first unlogged set rather than restarting.
///
/// Text-only, unlike Hevy's thumbnails: exercise images live behind the
/// server's authenticated `/file/{id}` route, and the watch has no
/// credentials of its own to fetch them with.
private struct ExerciseListView: View {
    let onSelect: (String) -> Void
    let onClose: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore

    private var exercises: [PlannedExercise] { store.plan?.exercises ?? [] }

    var body: some View {
        // Drawn over the whole page, as the mockup shows it: the workout's name
        // in the tint where a sheet would put its close button (a tap on it
        // closes the list), then one tall row per exercise. Finish, Discard and
        // Add Exercise are on More.
        let current = store.currentStep?.exerciseEntryId
        VStack(spacing: 0) {
            Button(action: Haptics.tapping(onClose)) {
                Text(store.plan?.workoutName ?? String(localized: "watch.workout.title", defaultValue: "Workout"))
                    .font(.system(size: WatchStyle.m(18), weight: .semibold))
                    .foregroundStyle(SetTint.blue.color)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, WatchStyle.m(7))
                    .frame(height: WatchStyle.m(42))
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "watch.workout.closeList", defaultValue: "Close exercise list"))
            ScrollView {
                VStack(spacing: WatchStyle.m(6)) {
                    ForEach(exercises) { exercise in
                        Button {
                            Haptics.tap()
                            onSelect(exercise.exerciseEntryId)
                            onClose()
                        } label: {
                            ExerciseRow(exercise: exercise, isCurrent: exercise.exerciseEntryId == current)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.bottom, WatchStyle.bottom)
            }
            .scrollIndicators(.hidden)
        }
        .padding(.horizontal, WatchStyle.overlaySide)
        .padding(.top, WatchStyle.top)
        .frame(maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .vertical)
    }
}

private struct ExerciseRow: View {
    let exercise: PlannedExercise
    let isCurrent: Bool

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        let done = store.completedSetCount(for: exercise)
        let isDone = store.isComplete(exercise)
        let tint = SetTint.blue
        let shape = RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous)
        HStack(spacing: WatchStyle.m(8)) {
            Text(exercise.name)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .frame(maxWidth: .infinity, alignment: .leading)
            // Sets logged over sets planned; green once all are in.
            Text("\(done)/\(exercise.sets.count)")
                .monospacedDigit()
                .foregroundStyle(isDone ? Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255) : (isCurrent ? tint.color : Color.white))
                .fixedSize()
        }
        .font(.system(size: WatchStyle.m(16), weight: .medium))
        .foregroundStyle(isCurrent ? tint.color : Color.white)
        .padding(.horizontal, WatchStyle.m(12))
        .frame(maxWidth: .infinity)
        .frame(height: WatchStyle.m(54))
        .background(isCurrent ? tint.mixed(0.26) : WatchStyle.surface, in: shape)
        // A superset's members carry its colour as a bar down the left edge.
        .overlay(alignment: .leading) {
            if let run = exercise.supersetRun {
                SetSupersetPalette.color(for: run).frame(width: WatchStyle.m(3))
            }
        }
        .clipShape(shape)
        .contentShape(shape)
        .accessibilityElement(children: .combine)
    }
}

/// The colour the new set, rest and effort screens are drawn in: blue, or a
/// superset's colour. The mockup derives every surface from it by mixing it
/// into black (or the dark navy of a value tile) at a fixed share.
struct SetTint {
    let r: Double, g: Double, b: Double

    static let blue = SetTint(r: 90 / 255, g: 176 / 255, b: 255 / 255)

    /// This colour at `share` over a base colour.
    func mixed(_ share: Double, over base: (Double, Double, Double) = (0, 0, 0)) -> Color {
        Color(
            red: r * share + base.0 * (1 - share),
            green: g * share + base.1 * (1 - share),
            blue: b * share + base.2 * (1 - share)
        )
    }

    var color: Color { Color(red: r, green: g, blue: b) }
    /// The clock line: half way to white.
    var light: Color { mixed(0.5, over: (1, 1, 1)) }
    /// The exercise pill, and the circle inside it.
    var pill: Color { mixed(0.24) }
    var pillIcon: Color { mixed(0.22) }
    /// A value tile, and its small edit badge.
    var tile: Color { mixed(0.28, over: (4 / 255, 18 / 255, 46 / 255)) }
    var badge: Color { mixed(0.45) }
}

private struct SetTintKey: EnvironmentKey {
    static let defaultValue = SetTint.blue
}

extension EnvironmentValues {
    var setTint: SetTint {
        get { self[SetTintKey.self] }
        set { self[SetTintKey.self] = newValue }
    }
}

/// The one control shape on the workout screens: a flat dark squircle with a
/// glyph in it. Big enough to hit with a thumb (44 pt tall in a row, 34 pt in
/// the header), the same fill as the value cards, and dimmed while disabled.
/// `prominent` is the single main action on a screen: white with a black glyph.
enum WatchStyle {
    /// Screen height of the 44 mm watch the sizes below were drawn for. A 40 mm
    /// screen is 12% shorter, so fixed sizes made the page taller than the
    /// screen and pushed it up under the clock; a 49 mm one has room to spare.
    private static let referenceHeight: CGFloat = 224
    static let scale: CGFloat = {
        let height = WKInterfaceDevice.current().screenBounds.height
        return min(1.1, max(0.82, height / referenceHeight))
    }()

    /// A size drawn for the reference watch, fitted to this one.
    static func s(_ value: CGFloat) -> CGFloat { (value * scale).rounded() }

    static let fill = Color(white: 0.14)
    /// The main action on the new workout view's set screen.
    static let accent = Color(red: 0.353, green: 0.690, blue: 1)

    /// The design mockups are drawn on a 264 px wide screen for the 45 mm
    /// watch (198 pt), so a mockup px is 0.75 pt there and scales with the
    /// screen's width on the other sizes.
    static let mockScale: CGFloat = 0.75 * WKInterfaceDevice.current().screenBounds.width / 198
    /// A size taken straight from the mockup's CSS, in px.
    static func m(_ px: CGFloat) -> CGFloat { px * mockScale }
    /// The mockup's raised surface and its two greys.
    static let surface = Color(red: 31 / 255, green: 32 / 255, blue: 35 / 255)
    static let grey = Color(red: 166 / 255, green: 169 / 255, blue: 176 / 255)
    static let lightGrey = Color(red: 199 / 255, green: 202 / 255, blue: 209 / 255)
    /// The `dimmed` screenshot option stands in for the wrist-down state the
    /// simulator cannot enter.
    static var forcedDimming: Bool {
        #if DEBUG
        ScreenshotSeed.isEnabled && ScreenshotSeed.has("dimmed")
        #else
        false
        #endif
    }
    /// Spare height below the mockups' 305 px screen on this watch: the real
    /// screen is taller than the mockups', so bottom-anchored rows add it.
    static var mockSlack: CGFloat {
        max(0, WKInterfaceDevice.current().screenBounds.height - m(305))
    }
    /// The revised mockups' edge-to-edge insets, 11 px at the sides and top and
    /// 10 px at the bottom. `side` is for a page inside the workout scroll,
    /// which already keeps about 5.5 pt of its own at each side.
    static var side: CGFloat { max(0, m(11) - 5.5) }
    /// For a page laid over the scroll (effort, edit previous, record), with no padding of its own.
    static var overlaySide: CGFloat { max(0, m(11) - 1.5) }
    static var top: CGFloat { m(11) }
    static var bottom: CGFloat { m(10) }
    static let heart = Color(red: 237 / 255, green: 94 / 255, blue: 99 / 255)
    /// The mockups are set in SF Pro, whose numerals draw about 12% larger than
    /// the watch's own font at the same size; large numerals use this.
    static func num(_ px: CGFloat) -> CGFloat { m(px) * 1.12 }
    static let numWeight = Font.Weight.semibold
    static let corner: CGFloat = WatchStyle.s(20)
    static var shape: RoundedRectangle {
        RoundedRectangle(cornerRadius: corner, style: .continuous)
    }
}

struct SquircleButton: View {
    let systemImage: String
    var prominent = false
    /// A round button for the header.
    var circular = false
    /// The glyph's colour on a dark box, for a control that needs telling
    /// apart at a glance (a red finish). Ignored when `prominent`.
    var tint: Color?
    /// The height of a box in a row, drawn for the reference watch; a compact
    /// screen such as the run's passes a smaller one.
    var height: CGFloat = 44
    let action: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            SquircleLabel(systemImage: systemImage, prominent: prominent, circular: circular, tint: tint, height: height)
        }
        .buttonStyle(.plain)
    }
}

private struct SquircleLabel: View {
    let systemImage: String
    let prominent: Bool
    let circular: Bool
    var tint: Color?
    var height: CGFloat = 44

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let shape = RoundedRectangle(
            cornerRadius: circular ? WatchStyle.s(14) : WatchStyle.corner,
            style: .continuous
        )
        Image(systemName: systemImage)
            .font(.system(size: WatchStyle.s(circular ? 14 : 20), weight: .semibold))
            .foregroundStyle(prominent ? Color.black : (tint ?? Color.white.opacity(0.6)))
            .frame(maxWidth: circular ? WatchStyle.s(28) : CGFloat.infinity)
            .frame(height: WatchStyle.s(circular ? 28 : height))
            .background(prominent ? Color.white : WatchStyle.fill, in: shape)
            .opacity(isEnabled ? 1 : 0.35)
            // The whole box takes the tap, not only the glyph's pixels.
            .contentShape(shape)
    }
}

/// The next exercise, one swipe up from the set screen, so what comes after
/// this one can be checked without opening the list: its name, how many sets
/// and the first set's target, and the exercise after it. A tap opens the list.
struct UpNextPage: View {
    let onOpenList: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore

    @State private var swapping = false

    var body: some View {
        let upcoming = store.upcomingExercises
        VStack(spacing: 6) {
            upNext(upcoming)
            // A busy machine: do another exercise now and come back to this one.
            if !upcoming.isEmpty, checkIn.context.exerciseDoNow == true {
                Button {
                    Haptics.tap()
                    swapping = true
                } label: {
                    Label(String(localized: "watch.workout.swap", defaultValue: "Swap"), systemImage: "arrow.left.arrow.right")
                        .frame(maxWidth: .infinity)
                }
            }
        }
        .sheet(isPresented: $swapping) { SwapExerciseSheet() }
        #if DEBUG
        .onAppear {
            // After the launch scroll to this page, which a sheet would stop.
            if ScreenshotSeed.opensSwap {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { swapping = true }
            }
        }
        #endif
    }

    private func upNext(_ upcoming: [WorkoutStep]) -> some View {
        Button(action: Haptics.tapping(onOpenList)) {
            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "watch.workout.upNextTitle", defaultValue: "Up Next"))
                    .watchFont(.footnote.weight(.semibold), classic: .caption2)
                    .foregroundStyle(.secondary)
                if let next = upcoming.first {
                    Text(next.exerciseName)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(next.supersetRun.map(SetSupersetPalette.color(for:)) ?? Color.primary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    // One dot per set: a count without a plural to translate.
                    HStack(spacing: 4) {
                        ForEach(0..<next.setCount, id: \.self) { _ in
                            Circle()
                                .fill(Color.secondary)
                                .frame(width: WatchStyle.s(7), height: WatchStyle.s(7))
                        }
                    }
                    .accessibilityElement()
                    .accessibilityLabel(String(localized: "watch.workout.upNextSetCount", defaultValue: "Sets: \(next.setCount)"))
                    if let target = SetValueText.target(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit) {
                        Text(target)
                            .watchFont(.body, classic: .footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    if upcoming.count > 1 {
                        Text(String(localized: "watch.workout.upNextThen", defaultValue: "Then \(upcoming[1].exerciseName)"))
                            .watchFont(.footnote, classic: .caption2)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                            .padding(.top, 4)
                    }
                } else {
                    Text(String(localized: "watch.workout.lastExercise", defaultValue: "This is the last exercise"))
                        .watchFont(.body, classic: .footnote)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// The exercises still to come, to do one now instead of the current one (its
/// machine is taken, say). The phone moves the picked exercise in front of the
/// current one, so the current one comes straight after; the watch jumps to it
/// at once rather than waiting for the updated plan.
struct SwapExerciseSheet: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(store.upcomingExercises) { step in
                Button {
                    Haptics.tap()
                    if let anchor = store.currentStep?.exerciseEntryId {
                        session.sendWorkoutEdit(.doExerciseNow(exerciseEntryId: step.exerciseEntryId, anchorEntryId: anchor))
                        store.jumpToExercise(step.exerciseEntryId)
                    }
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.exerciseName)
                            .font(.body)
                            .lineLimit(2)
                        if let target = SetValueText.target(for: step, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit) {
                            Text(target)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationTitle(String(localized: "watch.workout.doNowTitle", defaultValue: "Do Now"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

/// Time, heart rate and calories, one big reading per line as on Apple's
/// Workout app. A swipe up from the set screen, so the set screen can stay
/// about the set.
struct WorkoutMetricsPage: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @Environment(\.setTint) private var tint

    private var elapsed: Int {
        #if DEBUG
        if let frozen = ScreenshotSeed.elapsedOverride { return frozen }
        #endif
        return store.elapsedSeconds
    }

    var body: some View {
        let kcalUnit = CheckInStore.shared.context.usesKilojoules
            ? String(localized: "watch.workout.kj", defaultValue: "KJ")
            : String(localized: "watch.workout.kcal", defaultValue: "KCAL")
        VStack(alignment: .leading, spacing: 0) {
            Text(String(localized: "watch.workout.metricsTitle", defaultValue: "Live"))
                .font(.system(size: WatchStyle.m(18), weight: .semibold))
                .frame(height: WatchStyle.m(42))
                .accessibilityAddTraits(.isHeader)
            Text(Self.elapsed(elapsed))
                .font(.system(size: WatchStyle.num(36), weight: WatchStyle.numWeight))
                .foregroundStyle(tint.light)
                .frame(height: WatchStyle.m(48), alignment: .leading)
            // A dash until the first sample arrives, so the layout does not jump.
            HStack(spacing: WatchStyle.m(6)) {
                Text(bpmText)
                    .font(.system(size: WatchStyle.num(36), weight: WatchStyle.numWeight))
                Image(systemName: "heart.fill")
                    .font(.system(size: WatchStyle.m(30)))
            }
            .foregroundStyle(WatchStyle.heart)
            .frame(height: WatchStyle.m(48), alignment: .leading)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "watch.workout.heartRateReading", defaultValue: "Heart rate \(bpmText)"))
            HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(6)) {
                Text(store.activeEnergyKcal.map { "\(Int(CheckInStore.shared.context.energyFromKcal($0)))" } ?? "--")
                    .font(.system(size: WatchStyle.num(36), weight: WatchStyle.numWeight))
                Text(kcalUnit)
                    .font(.system(size: WatchStyle.m(14), weight: .bold))
                    .foregroundStyle(SetTint.hold.color)
            }
            .frame(height: WatchStyle.m(48), alignment: .leading)
            if !store.steps.isEmpty {
                let counts = setCounts
                HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(6)) {
                    Text(String(localized: "watch.workout.setsProgress", defaultValue: "\(counts.done) of \(counts.total)"))
                        .font(.system(size: WatchStyle.num(28), weight: WatchStyle.numWeight))
                    Text(String(localized: "watch.workout.setsUnit", defaultValue: "SETS"))
                        .font(.system(size: WatchStyle.m(14), weight: .bold))
                        .foregroundStyle(tint.color)
                }
                .frame(height: WatchStyle.m(40), alignment: .leading)
                .padding(.top, WatchStyle.m(4))
            }
            Spacer(minLength: 0)
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .padding(.leading, WatchStyle.m(7))
        .padding(.horizontal, WatchStyle.side)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var bpmText: String { store.latestBpm.map { "\(Int($0.rounded()))" } ?? "--" }

    private var setCounts: (done: Int, total: Int) {
        #if DEBUG
        if ScreenshotSeed.has("mockup") { return (6, 21) }
        #endif
        return (store.steps.filter(store.isCompleted).count, store.steps.count)
    }

    static func elapsed(_ seconds: Int) -> String {
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        let secs = seconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, secs)
            : String(format: "%d:%02d", minutes, secs)
    }
}

private struct CurrentSetView: View {
    let step: WorkoutStep
    /// Opens the exercise list, from a tap on the exercise's name.
    let onOpenList: () -> Void
    /// Hands a logged set up to the workout page to hold until an effort is
    /// picked (only called while the phone's effort setting is on).
    let onAwaitRpe: (PendingRpe) -> Void
    /// Opens Edit previous set over the workout page.
    let onEditPrevious: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore

    /// Which field the keypad is editing, if any.
    @State private var editing: EditableField?

    /// Crown mode: the field the crown and a drag adjust in place, Hevy-style.
    @State private var crownField: EditableField?
    /// The value on screen while `crownField` is being adjusted. Written to
    /// the store once it settles rather than per detent: every write persists
    /// the workout snapshot, and a fast spin is dozens of detents a second.
    @State private var crownValue: Double = 0
    /// The stored number when the box was selected, then the number the crown
    /// or drag has stepped to. Above the crown's range this stays on the real
    /// value; the binding itself cannot.
    @State private var crownBaseline: Double = 0
    /// The same number without rounding. The crown reports in-between values
    /// while it turns (10.3 reps), and a whole rep only shows up once enough of
    /// them add up, so the turns are summed here and `crownBaseline` is this
    /// rounded to a step. Stepping from the rounded number alone drops every
    /// turn smaller than half a step, which is how reps stopped moving.
    @State private var crownExact: Double = 0
    /// Last binding sample. A rebase writes this before moving the binding so
    /// that correction is not counted as a turn.
    @State private var crownSeen: Double?
    /// True only after the crown or a drag changes the value. Selecting a field
    /// must not write, or a target the crown cannot show gets saved as the cap.
    @State private var crownAdjusted = false
    /// The set being edited. `step` can already be the next one when a settle
    /// or an external cursor move commits, and that write has to stay here.
    @State private var crownStep: WorkoutStep?
    @State private var pendingCommit: Task<Void, Never>?
    /// `crownValue` when the current drag began.
    @State private var dragStartValue: Double?
    /// Steps the current drag has moved, so each new step clicks once.
    @State private var dragSteps: Double = 0
    @FocusState private var crownFocused: Bool
    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }
    private var carryUnit: CarryUnit { checkIn.context.effectiveCarryUnit }
    private var inputStyle: SetInputStyle { checkIn.context.effectiveSetInputStyle }

    private var supersetColor: Color? {
        guard let run = step.supersetRun else { return nil }
        return SetSupersetPalette.color(for: run)
    }

    private enum EditableField: Identifiable {
        case weight, reps, distance
        var id: Int {
            switch self {
            case .weight: return 0
            case .reps: return 1
            case .distance: return 2
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            if store.isGetReady(step), let endsAt = store.getReadyEndsAt {
                HoldGetReady(step: step, endsAt: endsAt)
            } else if let seconds = store.targetDurationSec(for: step), store.isHoldRunning(step) {
                HoldRunning(step: step, totalSeconds: seconds, onEnd: logSet)
            } else {
            SetTitle(name: step.exerciseName)
            SetDetailRow(step: step) { setId in
                endCrownEditing()
                store.goToStep(setId: setId)
            }
            .padding(.top, WatchStyle.m(2))
            .padding(.bottom, WatchStyle.m(6))

            let values = store.values(for: step)
            let holdSeconds = store.targetDurationSec(for: step)
            let timed = store.isTimed(step)
            HStack(spacing: WatchStyle.m(6)) {
                if !timed || values.weightKg != nil || store.isWeightedHold(step) {
                    valueBox(.weight)
                }
                if let holdSeconds {
                    HoldCountdown(setId: step.plannedSet.setId, totalSeconds: holdSeconds)
                } else if timed {
                    HoldStopwatch(setId: step.plannedSet.setId)
                } else if store.isCarry(step) {
                    valueBox(.distance)
                } else {
                    valueBox(.reps)
                }
            }
            .focusable(crownField != nil)
            .focused($crownFocused)
            .digitalCrownRotation(
                $crownValue,
                from: minValue(for: crownField ?? .weight),
                through: maxValue(for: crownField ?? .weight),
                by: stepSize(for: crownField ?? .weight),
                // Low: at medium a small turn ran several plates past the one
                // wanted.
                sensitivity: .low,
                isContinuous: false,
                isHapticFeedbackEnabled: checkIn.context.effectiveHapticsEnabled
            )
            .onChange(of: crownValue) { noteCrownChange() }

            if crownField != nil {
                Text(String(localized: "watch.workout.crownHint", defaultValue: "Crown or drag · tap again to type"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }

            // Edit the previous set beside the wide Log set; the dots above
            // jump to a set of this exercise. Pinned to the bottom edge.
            Spacer(minLength: WatchStyle.m(8))
            HStack(spacing: WatchStyle.m(6)) {
                RoundBackButton {
                    endCrownEditing()
                    onEditPrevious()
                }
                .disabled(!store.steps.contains(where: store.isCompleted))
                .accessibilityLabel(String(localized: "watch.workout.editPreviousSet", defaultValue: "Edit previous set"))
                LogSetButton(
                    isCompleted: store.isCompleted(step),
                    restSeconds: store.restAfterCurrentSet(),
                    thenLabel: store.supersetPartnerNext(after: step)
                ) {
                    endCrownEditing()
                    if store.uncompleteStep(step) {
                        session.sendSetUncompleted(step)
                    }
                } onComplete: {
                    logSet()
                }
            }
            }
        }
        // The phone logging this set, or a jump from the exercise list, has
        // already swapped `step` by the time this runs. The commit uses
        // `crownStep`, captured when the box was selected.
        .onChange(of: step.plannedSet.setId) { endCrownEditing() }
        // crownValue is a number in the unit it was selected in. Committing
        // after the phone switches kg/lb or m/yd would save that number in the new unit.
        .onChange(of: unit) { discardCrownEdit(for: .weight) }
        .onChange(of: carryUnit) {
            discardCrownEdit(for: .distance)
            // The keypad keeps the number typed in the old unit. Dismiss it
            // instead of letting OK write that number through the new one.
            if editing == .distance { editing = nil }
        }
        .onDisappear { endCrownEditing() }
        // A running hold that reaches 0:00 logs the set on its own.
        .onChange(of: store.holdFinishedSetId) {
            if store.holdFinishedSetId == step.plannedSet.setId, !store.isCompleted(step) { logSet() }
        }
        .sheet(item: $editing) { field in
            NumericKeypadView(
                title: title(for: field),
                initial: storedValue(for: field),
                allowsDecimal: field == .weight || field == .distance,
                allowsNegative: field == .weight && store.isBodyweight(step)
            ) { entered in
                write(entered, to: field)
                editing = nil
            }
        }
    }

    /// Logs the set on screen, with the value on screen, settled or not. From
    /// Log set, double tap, or a hold ring tapped early or run out.
    private func logSet() {
        endCrownEditing()
        if checkIn.context.effectiveRpeEnabled {
            if let completed = store.completeCurrentSet(holdForEffort: true),
               let pending = store.pendingSetCompletion {
                onAwaitRpe(
                    PendingRpe(
                        step: completed,
                        values: pending.values,
                        completedAt: pending.completedAt
                    )
                )
            }
        } else if let completed = store.completeCurrentSet() {
            session.sendSetCompleted(completed, values: store.values(for: completed))
        }
    }

    /// The standard reps set keeps the navy tile with its edit badge.
    private var standardTiles: Bool {
        !(store.isTimed(step) || store.isCarry(step) || store.isBodyweight(step) || step.supersetRun != nil)
    }

    private func valueBox(_ field: EditableField) -> some View {
        let isSelected = crownField == field
        let shown = isSelected && crownAdjusted
            ? editedValue(for: field)
            : storedValue(for: field)
        let bodyweight = field == .weight && store.isBodyweight(step)
        let text = bodyweight
            ? Self.bodyweightText(shown)
            : SetValueText.format(shown)
        return ValueBox(
            value: text,
            label: label(for: field),
            suffix: bodyweight && (shown ?? 0) == 0 ? nil : suffix(for: field),
            isSelected: isSelected,
            // The mockup's timed, carry, bodyweight and superset screens use a
            // darker tile (the tint at 26% over black) and no edit badge.
            fill: standardTiles ? nil : (step.supersetRun.map(SetSupersetPalette.tint(for:)) ?? SetTint.blue).mixed(0.26),
            badge: standardTiles
        ) {
            tapped(field)
        }
        // Drag up to raise, down to lower, one step per 12pt — only on the
        // box being adjusted, so a stray swipe elsewhere changes nothing.
        .highPriorityGesture(
            DragGesture(minimumDistance: 4)
                .onChanged { gesture in
                    guard isSelected else { return }
                    let start = dragStartValue ?? editedValue(for: field)
                    if dragStartValue == nil {
                        dragStartValue = start
                        dragSteps = 0
                    }
                    let steps = (-gesture.translation.height / 12).rounded()
                    guard steps != dragSteps else { return }
                    dragSteps = steps
                    crownBaseline = max(start + steps * stepSize(for: field), minValue(for: field))
                    crownExact = crownBaseline
                    crownAdjusted = true
                    if crownSeen == nil {
                        crownSeen = min(max(crownValue, minValue(for: field)), maxValue(for: field))
                    }
                    parkCrown(for: field)
                    scheduleCommit()
                    // The crown clicks each detent by itself; a drag has to
                    // be told to.
                    Haptics.tap()
                }
                .onEnded { _ in dragStartValue = nil },
            including: isSelected ? .all : .subviews
        )
    }

    /// Keypad mode opens the keypad. Crown mode selects the box for the crown;
    /// tapping the selected box again opens the keypad for an exact value.
    private func tapped(_ field: EditableField) {
        guard inputStyle == .crown else {
            editing = field
            return
        }
        if crownField == field {
            endCrownEditing()
            editing = field
            return
        }
        endCrownEditing()
        let stored = storedValue(for: field)
        crownStep = step
        crownBaseline = stored ?? 0
        crownExact = stored ?? 0
        crownAdjusted = false
        // Sit the sample on the cap when the stored number is above it, so
        // the clamp that follows is not counted as a turn. The first real
        // detent then steps from the stored number.
        let floor = minValue(for: field)
        crownSeen = min(max(stored ?? 0, floor), maxValue(for: field))
        crownValue = stored ?? 0
        crownField = field
        // Next turn of the run loop: the row only becomes focusable once
        // `crownField` is set, and focus asked for before that is dropped.
        DispatchQueue.main.async { crownFocused = true }
    }

    /// Each crown event is a step from the stored number. The binding clamps
    /// an above-range value onto its ceiling, and that jump is not a turn.
    /// When the binding then runs out of room at its floor, it is parked back
    /// on the value so the same gesture can keep stepping down to that floor.
    private func noteCrownChange() {
        guard let field = crownField else { return }
        let ceiling = maxValue(for: field)
        let floor = minValue(for: field)
        let crown = min(max(crownValue, floor), ceiling)
        let previous = crownSeen
        crownSeen = crown
        guard let previous else { return }

        let delta = crown - previous
        if abs(delta) < 0.000_1 {
            parkCrown(for: field)
            return
        }
        if !crownAdjusted, crownBaseline > ceiling, crown >= ceiling - 0.000_1 {
            return
        }

        let step = stepSize(for: field)
        crownExact = max(crownExact + delta, floor)
        let next = max((crownExact / step).rounded() * step, floor)
        guard abs(next - crownBaseline) >= 0.000_1 else { return }
        crownBaseline = next
        crownAdjusted = true
        scheduleCommit()
        parkCrown(for: field)
    }

    /// The binding spans floor...max. Park it on the current value once it
    /// hits the floor while that value is still above it, so the next detent
    /// is another single step and the edit can reach the floor. The floor is
    /// zero, or the negative cap for a bodyweight weight.
    private func parkCrown(for field: EditableField) {
        let ceiling = maxValue(for: field)
        let floor = minValue(for: field)
        let step = stepSize(for: field)
        let value = editedValue(for: field)
        let crown = min(max(crownValue, floor), ceiling)
        guard value > floor + step, crown <= floor + step * 0.5 else { return }
        let parked = min(max(value, floor), ceiling)
        guard parked > crown + 0.000_1 else { return }
        crownSeen = parked
        crownValue = parked
    }

    private func scheduleCommit() {
        guard let field = crownField else { return }
        let unitAtSchedule = unit
        let carryUnitAtSchedule = carryUnit
        pendingCommit?.cancel()
        pendingCommit = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            // The unit may have changed during the wait. A number from the
            // old unit must not be written through the new one.
            if field == .weight && unitAtSchedule != unit {
                discardCrownEdit(for: .weight)
                return
            }
            if field == .distance && carryUnitAtSchedule != carryUnit {
                discardCrownEdit(for: .distance)
                return
            }
            commitCrownValue()
        }
    }

    private func commitCrownValue() {
        guard crownAdjusted, let field = crownField, let editing = crownStep else { return }
        let value = editedValue(for: field)
        if value != storedValue(for: field, on: editing) {
            write(value, to: field, on: editing)
        }
    }

    /// Saves the value being adjusted and deselects it.
    private func endCrownEditing() {
        pendingCommit?.cancel()
        pendingCommit = nil
        commitCrownValue()
        crownField = nil
        crownFocused = false
        dragStartValue = nil
        crownAdjusted = false
        crownSeen = nil
        crownStep = nil
    }

    /// Drops an in-progress crown edit without saving. Used when the display
    /// unit changes under a selected weight or distance box.
    private func discardCrownEdit(for field: EditableField) {
        guard crownField == field else { return }
        pendingCommit?.cancel()
        pendingCommit = nil
        crownField = nil
        crownFocused = false
        dragStartValue = nil
        crownAdjusted = false
        crownSeen = nil
        crownStep = nil
    }

    private func storedValue(for field: EditableField) -> Double? {
        storedValue(for: field, on: step)
    }

    private func storedValue(for field: EditableField, on step: WorkoutStep) -> Double? {
        let values = store.values(for: step)
        switch field {
        case .weight: return values.weightKg.map(unit.fromKg)
        case .reps: return values.reps
        case .distance:
            // Rounded to a tenth so a stored km value does not show float dust
            // ("35.00000001") after a round trip through the unit.
            return values.distanceKm.map { (carryUnit.fromKm($0) * 10).rounded() / 10 }
        }
    }

    private func write(_ value: Double, to field: EditableField) {
        write(value, to: field, on: step)
    }

    private func write(_ value: Double, to field: EditableField, on step: WorkoutStep) {
        switch field {
        case .weight:
            store.setValue(for: step.plannedSet.setId, weightKg: unit.toKg(value))
        case .reps:
            store.setValue(for: step.plannedSet.setId, reps: value)
        case .distance:
            // Entered in metres or yards; the phone and the diary store km.
            store.setValue(for: step.plannedSet.setId, distanceKm: carryUnit.toKm(value))
        }
    }

    private func title(for field: EditableField) -> String {
        switch field {
        case .weight: return unit == .lbs ? "LB" : "KG"
        case .reps: return "REPS"
        case .distance: return carryUnit.title
        }
    }

    /// The tile's caption: "WEIGHT", "REPS", "DISTANCE", or for a bodyweight
    /// movement what the number is, "ADDED" or "ASSISTED".
    private func label(for field: EditableField) -> String {
        switch field {
        case .weight:
            if store.isBodyweight(step) {
                let value = editedOrStored(.weight) ?? 0
                return value < 0
                    ? String(localized: "watch.workout.field.assisted", defaultValue: "Assisted").uppercased()
                    : String(localized: "watch.workout.field.added", defaultValue: "Added").uppercased()
            }
            return String(localized: "watch.workout.field.weight", defaultValue: "Weight").uppercased()
        case .reps: return String(localized: "watch.workout.field.reps", defaultValue: "Reps").uppercased()
        case .distance: return String(localized: "watch.workout.field.distance", defaultValue: "Distance").uppercased()
        }
    }

    private func suffix(for field: EditableField) -> String? {
        switch field {
        case .weight: return unit == .lbs ? "lb" : "kg"
        case .reps: return nil
        case .distance: return carryUnit.suffix
        }
    }

    private func editedOrStored(_ field: EditableField) -> Double? {
        crownField == field && crownAdjusted ? editedValue(for: field) : storedValue(for: field)
    }

    /// Half a pound or kilo per crown detent, as Hevy does; a rep at a time.
    private func stepSize(for field: EditableField) -> Double {
        switch field {
        case .weight: return 0.5
        case .reps: return 1
        case .distance: return 5
        }
    }

    private func maxValue(for field: EditableField) -> Double {
        switch field {
        case .weight: return unit == .lbs ? 1500 : 700
        case .reps: return 200
        case .distance: return 5000
        }
    }

    /// The number the crown or drag has stepped to. Not capped at the crown's
    /// max: a stored value above that max stays there until a step moves it.
    private func editedValue(for field: EditableField) -> Double {
        let step = stepSize(for: field)
        return max((crownBaseline / step).rounded() * step, minValue(for: field))
    }

    /// Bodyweight weight is a signed change. Everything else stops at zero.
    private func minValue(for field: EditableField) -> Double {
        field == .weight && store.isBodyweight(step) ? -maxValue(for: .weight) : 0
    }

    /// A bodyweight set's weight as a change to body weight: "+10", "−20", or
    /// plain "BW" when nothing is added or taken off.
    private static func bodyweightText(_ value: Double?) -> String {
        guard let value, value != 0 else { return "BW" }
        let magnitude = SetValueText.format(abs(value))
        return value > 0 ? "+\(magnitude)" : "−\(magnitude)"
    }
}

@MainActor
enum SetValueText {
    /// Whole numbers lose the decimal point — "60kg", not "60.0kg" — but a
    /// real fraction keeps it, since plate maths routinely lands on 2.5s.
    nonisolated static func format(_ value: Double?) -> String {
        guard let value else { return "–" }
        return value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }

    /// `30s`, `1m`, `1h`; with a remainder, `1:30` or `1:01:30`.
    nonisolated static func short(_ seconds: Int) -> String {
        let s = max(0, seconds)
        if s < 60 { return "\(s)s" }
        if s % 3600 == 0 { return "\(s / 3600)h" }
        if s % 60 == 0 && s < 3600 { return "\(s / 60)m" }
        return s >= 3600
            ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String(format: "%d:%02d", s / 60, s % 60)
    }

    /// "40kg × 10" alone; nil when the set has no values yet.
    static func target(for step: WorkoutStep, store: WorkoutSessionStore, unit: WeightUnit, carry: CarryUnit, spaced: Bool = false) -> String? {
        let values = store.values(for: step)
        let gap = spaced ? " " : ""
        let weight = values.weightKg.map { "\(weightText($0, unit: unit))\(gap)\(unit.suffix)" }
        if let seconds = store.targetDurationSec(for: step) {
            let clock = String(format: "%d:%02d", seconds / 60, seconds % 60)
            return weight.map { "\($0) × \(clock)" } ?? clock
        }
        if store.isCarry(step), let km = values.distanceKm {
            let distance = "\(Int(carry.fromKm(km).rounded())) \(carry.suffix)"
            return weight.map { "\($0) × \(distance)" } ?? distance
        }
        switch (weight, values.reps) {
        case let (weight?, reps?): return "\(weight) × \(Int(reps))"
        case let (nil, reps?): return "\(Int(reps)) reps"
        default: return nil
        }
    }

    /// "20 kg".
    static func weightLabel(_ kg: Double, unit: WeightUnit) -> String {
        "\(weightText(kg, unit: unit)) \(unit.suffix)"
    }

    private static func weightText(_ kg: Double, unit: WeightUnit) -> String {
        let shown = unit.fromKg(kg)
        return shown == shown.rounded()
            ? String(Int(shown))
            : String(format: "%.1f", shown)
    }
}

/// The amber the timer tiles are drawn in.
private extension SetTint {
    static let hold = SetTint(r: 245 / 255, g: 177 / 255, b: 61 / 255)
}

/// A timer card beside the weight: the same tile as a value, in amber, with a
/// round Start (green) or Stop (red) button in its corner.
private struct HoldTile: View {
    let label: String
    let value: String
    var suffix: String?
    let running: Bool
    let accessibilityHint: String
    let action: () -> Void

    var body: some View {
        let amber = SetTint.hold
        Button(action: Haptics.tapping(action)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(.system(size: WatchStyle.m(14), weight: .semibold))
                Spacer(minLength: 0)
                HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(3)) {
                    Text(value)
                        .font(.system(size: WatchStyle.num(32), weight: WatchStyle.numWeight))
                        .monospacedDigit()
                    if let suffix {
                        Text(suffix).font(.system(size: WatchStyle.m(16), weight: .medium))
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            }
            .foregroundStyle(amber.color)
            .padding(.horizontal, WatchStyle.m(10))
            .padding(.vertical, WatchStyle.m(8))
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: WatchStyle.m(76))
            .background(amber.mixed(0.26), in: RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous))
            .overlay(alignment: .topTrailing) {
                Image(systemName: running ? "stop.fill" : "play.fill")
                    .font(.system(size: WatchStyle.m(12), weight: .bold))
                    .foregroundStyle(Color.black)
                    .frame(width: WatchStyle.m(28), height: WatchStyle.m(28))
                    .background(running ? Color.red : Color(red: 52 / 255, green: 199 / 255, blue: 89 / 255), in: Circle())
                    .padding(.top, WatchStyle.m(18))
                    .padding(.trailing, WatchStyle.m(10))
                    .accessibilityHidden(true)
            }
            .contentShape(RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label.capitalized), \(value)\(suffix.map { " \($0)" } ?? "")")
        .accessibilityHint(accessibilityHint)
    }
}

/// The planned hold, beside the weight, before it starts: a tap starts the
/// countdown. While it runs the set screen shows `HoldRunning` instead.
private struct HoldCountdown: View {
    let setId: String
    let totalSeconds: Int

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        let parts = Self.parts(totalSeconds)
        HoldTile(
            label: String(localized: "watch.workout.holdLabel", defaultValue: "Hold").uppercased(),
            value: parts.value,
            suffix: parts.suffix,
            running: false,
            accessibilityHint: String(localized: "watch.workout.holdStartHint", defaultValue: "Starts the hold")
        ) {
            store.beginHold(for: setId, seconds: totalSeconds)
        }
    }

    /// 45 s, 1 m, 1:30.
    static func parts(_ seconds: Int) -> (value: String, suffix: String?) {
        if seconds < 60 { return ("\(seconds)", "s") }
        if seconds % 60 == 0 { return ("\(seconds / 60)", "m") }
        return (String(format: "%d:%02d", seconds / 60, seconds % 60), nil)
    }
}

/// "Get ready": the 3-2-1 before a timed hold, in place of the set's values. A
/// ring that empties over the three seconds, the number in it and the exercise
/// under it; the hold starts when it ends, or at once on a tap anywhere.
/// `ticks` and the start cue come from the store (`beginHold`).
private struct HoldGetReady: View {
    let step: WorkoutStep
    let endsAt: Date

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore

    private let amber = SetTint.hold

    var body: some View {
        TimelineView(.animation) { context in
            let total = Double(WorkoutSessionStore.getReadySeconds)
            let (number, fraction) = reading(now: context.date, total: total)
            let size = WatchStyle.m(144)
            let line = size * 12 / 136
            let weight = store.values(for: step).weightKg
            Button(action: Haptics.tapping(store.skipGetReady)) {
                VStack(spacing: 0) {
                    ZStack {
                        Circle().inset(by: size * 8 / 136)
                            .stroke(amber.mixed(0.26), lineWidth: line)
                        Circle().inset(by: size * 8 / 136)
                            .trim(from: 0, to: CGFloat(fraction))
                            .stroke(amber.color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            Text("\(number)")
                                .font(.system(size: WatchStyle.num(64), weight: WatchStyle.numWeight))
                                .monospacedDigit()
                                .foregroundStyle(amber.color)
                                .frame(height: WatchStyle.m(66))
                            Text(String(localized: "watch.workout.getReady", defaultValue: "Get ready"))
                                .font(.system(size: WatchStyle.m(14), weight: .semibold))
                                .foregroundStyle(WatchStyle.lightGrey)
                                .frame(height: WatchStyle.m(18))
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                    }
                    .frame(width: size, height: size)
                    (Text(step.exerciseName).foregroundColor(.white)
                     + Text(weight.map { " " + SetValueText.weightLabel($0, unit: checkIn.context.effectiveWeightUnit) } ?? "")
                        .font(.system(size: WatchStyle.m(18), weight: .medium))
                        .foregroundColor(WatchStyle.grey))
                        .font(.system(size: WatchStyle.m(18), weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .frame(height: WatchStyle.m(24))
                        .padding(.top, WatchStyle.m(6))
                    Text(String(localized: "watch.workout.getReadySkip", defaultValue: "Tap to skip"))
                        .font(.system(size: WatchStyle.m(14), weight: .medium))
                        .foregroundStyle(WatchStyle.lightGrey)
                        .frame(height: WatchStyle.m(18))
                        .padding(.top, WatchStyle.m(6))
                }
                .frame(maxWidth: .infinity)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "watch.workout.getReadyA11y", defaultValue: "Get ready, \(number)"))
            .accessibilityHint(String(localized: "watch.workout.getReadySkipHint", defaultValue: "Skips the countdown and starts the hold"))
        }
    }

    /// The number on screen and how full the ring is, which empties smoothly.
    private func reading(now: Date, total: Double) -> (number: Int, fraction: Double) {
        #if DEBUG
        if let frozen = ScreenshotSeed.getReadyFrozen { return frozen }
        #endif
        let left = max(0, endsAt.timeIntervalSince(now))
        return (max(1, Int(left.rounded(.up))), min(1, left / total))
    }
}

/// The hold while it runs, in place of the set's values: a ring that empties
/// with the time left and the heart rate in it. A tap ends the hold early and
/// logs the set (`onEnd`), and at 0:00 the set screen logs it on its own. It
/// buzzes at the end through the rest-finished hook. `TimelineView` rather
/// than a stored timer publisher: the store republishes every second and would
/// freeze a `Timer.publish` the way the rest screen used to.
private struct HoldRunning: View {
    let step: WorkoutStep
    let totalSeconds: Int
    let onEnd: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore

    private let amber = SetTint.hold

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let setId = step.plannedSet.setId
            let remaining = remaining(setId: setId, now: context.date)
            let fraction = totalSeconds > 0 ? Double(remaining) / Double(totalSeconds) : 0
            let size = WatchStyle.m(130)
            let line = size * 12 / 136
            let weight = store.values(for: step).weightKg
            VStack(spacing: 0) {
                Button(action: Haptics.tapping(onEnd)) {
                    ZStack {
                        Circle().inset(by: size * 8 / 136)
                            .stroke(amber.mixed(0.26), lineWidth: line)
                        Circle().inset(by: size * 8 / 136)
                            .trim(from: 0, to: CGFloat(fraction))
                            .stroke(amber.color, style: StrokeStyle(lineWidth: line, lineCap: .round))
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(2)) {
                                Text("\(remaining)")
                                    .font(.system(size: WatchStyle.num(42), weight: WatchStyle.numWeight))
                                    .monospacedDigit()
                                Text("s").font(.system(size: WatchStyle.m(26), weight: WatchStyle.numWeight)) // i18n-ignore
                            }
                            .foregroundStyle(amber.color)
                            if let bpm = store.latestBpm {
                                HStack(spacing: WatchStyle.m(3)) {
                                    Image(systemName: "heart.fill")
                                    Text("\(Int(bpm.rounded()))").monospacedDigit()
                                }
                                .font(.system(size: WatchStyle.m(19), weight: .semibold))
                                .foregroundStyle(WatchStyle.heart)
                            }
                        }
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .padding(line + WatchStyle.m(2))
                    }
                    .frame(width: size, height: size)
                    .contentShape(Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "watch.workout.holdRunning", defaultValue: "\(remaining) seconds left"))
                .accessibilityHint(String(localized: "watch.workout.holdEndHint", defaultValue: "Ends the hold and logs the set"))
                SetProgressRow(step: step, centered: true)
                    .frame(height: WatchStyle.m(8))
                    .padding(.top, WatchStyle.m(7))
                (Text(step.exerciseName).foregroundColor(.white)
                 + Text(weight.map { " " + SetValueText.weightLabel($0, unit: checkIn.context.effectiveWeightUnit) } ?? "")
                    .font(.system(size: WatchStyle.m(18), weight: .medium))
                    .foregroundColor(WatchStyle.grey))
                    .font(.system(size: WatchStyle.m(18), weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .frame(height: WatchStyle.m(24))
                    .padding(.top, WatchStyle.m(5))
                Text(String(localized: "watch.workout.holdTapToEnd", defaultValue: "Tap the ring to end early"))
                    .font(.system(size: WatchStyle.m(14), weight: .medium))
                    .foregroundStyle(WatchStyle.lightGrey)
                    .frame(height: WatchStyle.m(18))
                    .padding(.top, WatchStyle.m(6))
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func remaining(setId: String, now: Date) -> Int {
        #if DEBUG
        if let frozen = ScreenshotSeed.holdRemainingOverride { return frozen }
        #endif
        return store.holdRemaining(for: setId, now: now) ?? 0
    }
}

/// Count-up timer for a duration set with no planned length, as a timer card
/// with Start and Stop in its corner; ticking the set logs the elapsed
/// seconds. Double-tap stops a running one.
private struct HoldStopwatch: View {
    let setId: String

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.workoutPageActive) private var workoutPageActive

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = store.stopwatchElapsed(for: setId, now: context.date)
            let running = store.isStopwatchRunning(for: setId)
            HoldTile(
                label: String(localized: "watch.workout.timeLabel", defaultValue: "Time").uppercased(),
                value: Self.clock(elapsed ?? 0),
                suffix: nil,
                running: running,
                accessibilityHint: running
                    ? String(localized: "watch.workout.holdStop", defaultValue: "Stop")
                    : String(localized: "watch.workout.holdStart", defaultValue: "Start")
            ) {
                if running {
                    store.stopStopwatch(for: setId)
                } else if elapsed == nil {
                    store.startStopwatch(for: setId)
                }
            }
            // While the stopwatch runs the double-tap stops it; the set's
            // tick takes the gesture back once it has stopped.
            .doubleTapGesture(enabled: running && workoutPageActive && checkIn.context.effectiveDoubleTapEnabled)
        }
    }

    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}

/// The plain value card the effort picker still uses: the number, its unit
/// under it, a white border while selected.
struct PlainValueBox: View {
    let value: String
    let unit: String
    var isSelected = false
    /// Colours the line under the number; nil keeps it the quiet secondary grey.
    var unitColor: Color? = nil
    let onTap: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(onTap)) {
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: WatchStyle.s(36), weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(unit)
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(unitColor.map(AnyShapeStyle.init) ?? AnyShapeStyle(.secondary))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WatchStyle.s(8))
            .background(WatchStyle.fill, in: WatchStyle.shape)
            .overlay(
                WatchStyle.shape.strokeBorder(
                    Color.white,
                    lineWidth: isSelected ? 2.5 : 0
                )
            )
        }
        .buttonStyle(.plain)
    }
}

/// One big tappable number with its unit underneath. Outlined while the crown
/// is adjusting it.
struct ValueBox: View {
    let value: String
    /// The caption in the top left: "WEIGHT", "REPS".
    let label: String
    /// The unit after the number: "kg".
    var suffix: String? = nil
    var isSelected = false
    /// The tile's fill: the set screen's blue tile unless a screen asks for another.
    var fill: Color? = nil
    /// The small edit badge in the corner. The mockup leaves it off the
    /// timed, carry, bodyweight and superset screens.
    var badge = true
    let onTap: () -> Void

    @Environment(\.setTint) private var tint

    var body: some View {
        Button(action: Haptics.tapping(onTap)) {
            VStack(alignment: .leading, spacing: 0) {
                Text(label)
                    .font(.system(size: WatchStyle.m(14), weight: .semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Spacer(minLength: 0)
                HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(3)) {
                    Text(value)
                        .font(.system(size: WatchStyle.num(32), weight: WatchStyle.numWeight))
                        .monospacedDigit()
                    if let suffix {
                        Text(suffix)
                            .font(.system(size: WatchStyle.m(16), weight: .medium))
                    }
                }
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            }
            .foregroundStyle(tint.color)
            .padding(.horizontal, WatchStyle.m(10))
            .padding(.vertical, WatchStyle.m(8))
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(height: WatchStyle.m(76))
            .background(fill ?? tint.tile, in: RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous))
            // The "edit" badge: the tile opens its value for change.
            .overlay(alignment: .topTrailing) {
                if badge { Image(systemName: "plusminus")
                    .font(.system(size: WatchStyle.m(8), weight: .bold))
                    .foregroundStyle(Color.black)
                    .frame(width: WatchStyle.m(14), height: WatchStyle.m(14))
                    .background(tint.badge, in: Circle())
                    .padding(.top, WatchStyle.m(6))
                    .padding(.trailing, WatchStyle.m(7))
                    .accessibilityHidden(true)
                }
            }
            // The card being adjusted by the crown or a drag.
            .overlay(
                RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous)
                    .strokeBorder(tint.light, lineWidth: isSelected ? WatchStyle.m(2) : 0)
            )
            .contentShape(RoundedRectangle(cornerRadius: WatchStyle.m(16), style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label.capitalized), \(value)\(suffix.map { " \($0)" } ?? "")")
    }
}

/// The round "previous set" button at the left of the bottom row.
struct RoundBackButton: View {
    var glyph = "‹"
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.isLuminanceReduced) private var reducedLuminance
    private var dimmed: Bool { reducedLuminance || WatchStyle.forcedDimming }

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            Text(glyph)
                .font(.system(size: WatchStyle.m(28), weight: .medium))
                .foregroundStyle(dimmed ? WatchStyle.lightGrey : Color.white)
                .padding(.bottom, WatchStyle.m(3))
                .frame(width: WatchStyle.m(44), height: WatchStyle.m(44))
                .background(WatchStyle.surface, in: Circle())
                .opacity(isEnabled ? 1 : 0.35)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
    }
}

/// The set's one main action, beside the edit-previous button at the bottom
/// where a thumb lands: Log set in white with the rest it starts, or once the
/// set is logged, Undo in orange, so a second tap does not read as logging it
/// again. Double tap presses it where the watch has the gesture.
private struct LogSetButton: View {
    let isCompleted: Bool
    let restSeconds: Int
    /// "A2": the next member of a superset, shown instead of a rest.
    var thenLabel: String? = nil
    let onUncomplete: () -> Void
    let onComplete: () -> Void

    @Environment(\.setTint) private var tint
    @Environment(\.isLuminanceReduced) private var reducedLuminance
    private var dimmed: Bool { reducedLuminance || WatchStyle.forcedDimming }
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.workoutPageActive) private var workoutPageActive

    /// The current set's stopwatch is counting. Its Stop button holds the
    /// double-tap while it is.
    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private var stopwatchRunning: Bool {
        guard store.steps.indices.contains(store.currentStepIndex) else { return false }
        return store.isStopwatchRunning(
            for: store.steps[store.currentStepIndex].plannedSet.setId
        )
    }

    var body: some View {
        Button {
            if isCompleted {
                Haptics.tap()
                onUncomplete()
            } else {
                Haptics.setLogged()
                onComplete()
            }
        } label: {
            HStack(spacing: WatchStyle.m(7)) {
                Text(isCompleted
                     ? String(localized: "watch.workout.undo", defaultValue: "Undo")
                     : String(localized: "watch.workout.logSetButton", defaultValue: "Log set"))
                    .font(.system(size: WatchStyle.m(18), weight: .bold))
                if !isCompleted, let thenLabel {
                    Text(String(localized: "watch.workout.thenNext", defaultValue: "then \(thenLabel)"))
                        .font(.system(size: WatchStyle.m(13), weight: .semibold))
                        .opacity(0.62)
                } else if !isCompleted, restSeconds > 0 {
                    Text(String(localized: "watch.workout.restTime", defaultValue: "Rest \(Self.clock(restSeconds))"))
                        .font(.system(size: WatchStyle.m(13), weight: .semibold))
                        .monospacedDigit()
                        .opacity(0.62)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            // Spelled `Color.x` rather than `.x`: the parameter is an opaque
            // `some ShapeStyle`, which gives a ternary's two branches nothing
            // to infer a shared type from.
            .foregroundStyle(isCompleted ? Color.orange : (dimmed ? WatchStyle.lightGrey : Color.black))
            .frame(maxWidth: .infinity)
            .frame(height: WatchStyle.m(44))
            .background(
                isCompleted ? Color.orange.opacity(0.2) : (dimmed ? WatchStyle.surface : tint.color),
                in: Capsule()
            )
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // Double-tap logs the set, but only while this page is showing and
        // there is a set left to log. A running stopwatch owns the gesture
        // (it stops the timer first) so a hold is not logged mid-count.
        .doubleTapGesture(
            enabled: workoutPageActive && !isCompleted
                && !stopwatchRunning
                && checkIn.context.effectiveDoubleTapEnabled
        )
    }
}

/// One line of text that keeps its size down to 85% to fit, then scrolls
/// (`MarqueeText`, with its pauses at the ends). Dimmed (always-on) it does not
/// move: the start of the text is shown, cut with an ellipsis, to spare the
/// battery.
struct FitName: View {
    let text: String
    /// Mockup px at full size.
    let size: CGFloat
    var weight: Font.Weight = .semibold
    var color: Color = .white
    /// The share of the available width the text may use.
    var widthFraction: CGFloat = 1
    let height: CGFloat

    @Environment(\.isLuminanceReduced) private var reducedLuminance
    @State private var natural: CGFloat = 0

    private static let floor: CGFloat = 0.85

    var body: some View {
        let font = Font.system(size: WatchStyle.m(size), weight: weight)
        GeometryReader { proxy in
            let available = proxy.size.width * widthFraction
            let overflows = natural * Self.floor > available + 0.5
            Group {
                if overflows && (reducedLuminance || WatchStyle.forcedDimming) {
                    Text(text)
                        .font(.system(size: WatchStyle.m(size) * Self.floor, weight: weight))
                        .lineLimit(1)
                        .truncationMode(.tail)
                } else if overflows {
                    MarqueeText(text: text)
                        .font(.system(size: WatchStyle.m(size) * Self.floor, weight: weight))
                } else {
                    Text(text)
                        .font(font)
                        .lineLimit(1)
                        .minimumScaleFactor(Self.floor)
                }
            }
            .foregroundStyle(color)
            .frame(width: available, height: proxy.size.height, alignment: .leading)
            .clipped()
        }
        .frame(height: height)
        .clipped()
        // The name's width at full size, to know whether it needs to scroll.
        .background(alignment: .leading) {
            Text(text)
                .font(font)
                .lineLimit(1)
                .fixedSize()
                .hidden()
                .background(GeometryReader { proxy in
                    Color.clear
                        .onAppear { natural = proxy.size.width }
                        .onChange(of: proxy.size.width) { natural = proxy.size.width }
                })
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}

/// The exercise's name, as large as 38 px and within 97% of the row; a long
/// one shrinks a little, then scrolls (`FitName`).
struct SetTitle: View {
    let name: String
    var maxSize: CGFloat = 38

    var body: some View {
        FitName(text: name, size: maxSize, widthFraction: 0.97, height: WatchStyle.m(44))
            .padding(.leading, WatchStyle.m(4))
            .accessibilityAddTraits(.isHeader)
    }
}

/// The dumbbell figure in the exercise pill, drawn as in the mockups.
struct StrengthFigure: View {
    var body: some View {
        let side = WatchStyle.m(22)
        let k = side / 24
        ZStack(alignment: .topLeading) {
            Circle()
                .frame(width: 4.8 * k, height: 4.8 * k)
                .offset(x: (12 - 2.4) * k, y: (6 - 2.4) * k)
            Path { p in
                p.move(to: CGPoint(x: 3, y: 10)); p.addLine(to: CGPoint(x: 21, y: 10))
                p.move(to: CGPoint(x: 5, y: 8)); p.addLine(to: CGPoint(x: 5, y: 12))
                p.move(to: CGPoint(x: 19, y: 8)); p.addLine(to: CGPoint(x: 19, y: 12))
                p.move(to: CGPoint(x: 8.5, y: 10)); p.addLine(to: CGPoint(x: 10, y: 15)); p.addLine(to: CGPoint(x: 8, y: 21))
                p.move(to: CGPoint(x: 15.5, y: 10)); p.addLine(to: CGPoint(x: 14, y: 15)); p.addLine(to: CGPoint(x: 16, y: 21))
                p.move(to: CGPoint(x: 10, y: 15)); p.addLine(to: CGPoint(x: 14, y: 15))
            }
            .applying(CGAffineTransform(scaleX: k, y: k))
            .stroke(style: StrokeStyle(lineWidth: 2.2 * k, lineCap: .round))
        }
        .frame(width: side, height: side, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// The exercise pill at the top left, in the clock's row: the exercise's
/// position among the workout's blocks ("2/6"; a tap opens the exercise
/// list). A superset member shows its place in the superset ("A1") in the
/// circle instead of the dumbbell.
struct SetPill: View {
    let step: WorkoutStep
    let action: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @Environment(\.setTint) private var blue

    /// A superset member wears its superset's colour.
    private var tint: SetTint { step.supersetRun.map(SetSupersetPalette.tint(for:)) ?? blue }

    var body: some View {
        let position = store.exercisePosition(of: step)
        Button(action: Haptics.tapping(action)) {
            HStack(spacing: WatchStyle.m(7)) {
                ZStack {
                    Circle().fill(tint.pillIcon)
                    if let badge = store.supersetBadge(for: step) {
                        Text(badge)
                            .font(.system(size: WatchStyle.m(13), weight: .semibold))
                    } else {
                        StrengthFigure()
                    }
                }
                .frame(width: WatchStyle.m(34), height: WatchStyle.m(34))
                Text("\(position.index)/\(position.total)")
                    .font(.system(size: WatchStyle.m(17), weight: .semibold))
                    .monospacedDigit()
            }
            .foregroundStyle(tint.color)
            .padding(.leading, WatchStyle.m(4))
            .padding(.trailing, WatchStyle.m(13))
            .frame(height: WatchStyle.m(42))
            .background(tint.pill, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "watch.workout.exerciseOf", defaultValue: "Exercise \(position.index) of \(position.total)"))
        .accessibilityHint(String(localized: "watch.workout.showExercises", defaultValue: "Shows all exercises"))
    }
}

/// The line under the exercise's name: its equipment (or, without it, which
/// set this is; a superset says who it alternates with) at the left and the
/// set dots at the right.
private struct SetDetailRow: View {
    let step: WorkoutStep
    var onSelect: ((String) -> Void)?

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack(spacing: WatchStyle.m(8)) {
            FitName(
                text: captionText,
                size: 15,
                weight: .regular,
                color: step.supersetRun.map { SetSupersetPalette.tint(for: $0).color } ?? WatchStyle.grey,
                height: WatchStyle.m(18)
            )
            SetProgressRow(step: step, onSelect: onSelect)
                .fixedSize()
        }
        .padding(.leading, WatchStyle.m(4))
        .frame(height: WatchStyle.m(18))
    }

    private var captionText: String {
        let base: String
        if let partner = step.supersetWith {
            base = String(localized: "watch.workout.superset", defaultValue: "Superset · \(partner)")
        } else {
            base = step.equipment ?? SetProgressRow.title(for: step)
        }
        return store.isCompleted(step)
            ? base + " · " + String(localized: "watch.workout.logged", defaultValue: "logged")
            : base
    }
}

/// Set progress: one dot per set of this exercise (filled in the screen's
/// colour once logged, larger and white for the one on screen, orange for a
/// warm-up) up to 6 sets, then text such as "Set 2/8". A tap on a dot moves
/// to that set, which is how to go back to one or skip ahead; without
/// `onSelect` the dots only show.
private struct SetProgressRow: View {
    let step: WorkoutStep
    var onSelect: ((String) -> Void)?
    var centered = false
    /// Dots against the left edge rather than the right.
    var leading = false

    @EnvironmentObject private var store: WorkoutSessionStore
    @Environment(\.setTint) private var tint

    var body: some View {
        let sets = store.steps.filter { $0.exerciseEntryId == step.exerciseEntryId }
        HStack(spacing: 0) {
            if !leading { Spacer(minLength: 0) }
            if sets.count <= 6 {
                HStack(spacing: 0) {
                    ForEach(sets) { set in
                        if let onSelect {
                            Button {
                                guard set.id != step.id else { return }
                                Haptics.tap()
                                onSelect(set.id)
                            } label: {
                                dot(for: set)
                                    // A finger-sized target around a small dot.
                                    .frame(width: WatchStyle.m(10), height: WatchStyle.m(28))
                                    .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Self.title(for: set))
                        } else {
                            dot(for: set).frame(width: WatchStyle.m(10))
                        }
                    }
                }
                .padding(.vertical, onSelect == nil ? 0 : -WatchStyle.m(5))
                .padding(.trailing, centered || leading ? 0 : -WatchStyle.m(4))
            } else {
                Text(step.label)
                    .font(.system(size: WatchStyle.m(14), weight: .semibold))
                    .foregroundStyle(Self.isWarmup(step) ? Color.orange : tint.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            if centered || leading { Spacer(minLength: 0) }
        }
        .frame(maxWidth: centered || leading ? .infinity : nil)
    }

    private func dot(for set: WorkoutStep) -> some View {
        let accent = Self.isWarmup(set) ? Color.orange : tint.color
        let current = set.id == step.id
        let size = WatchStyle.m(current ? 8 : 6)
        let fill: Color = current ? .white : (store.isCompleted(set) ? accent : Color.white.opacity(0.26))
        return Circle().fill(fill).frame(width: size, height: size)
    }

    private static func isWarmup(_ step: WorkoutStep) -> Bool {
        step.plannedSet.setType?.lowercased() == "warmup"
    }

    /// "Set 2 of 3", "Warm-up 1 of 2"…
    static func title(for step: WorkoutStep) -> String {
        let n = step.setNumber, count = step.setCount
        switch step.plannedSet.setType?.lowercased() {
        case "warmup":
            return String(localized: "watch.workout.warmupOf", defaultValue: "Warm-up \(n) of \(count)")
        case "drop":
            return String(localized: "watch.workout.dropOf", defaultValue: "Drop \(n) of \(count)")
        case "failure":
            return String(localized: "watch.workout.failureOf", defaultValue: "Failure \(n) of \(count)")
        default:
            return String(localized: "watch.workout.setOf", defaultValue: "Set \(n) of \(count)")
        }
    }
}

/// Rest between sets: how long is left, how far through it is, and what is
/// coming — so the wearer can set up for the next set without paging back.
private struct RestView: View {
    /// Opens the exercise list, from a tap on what is up next.
    let onOpenList: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.workoutPageActive) private var workoutPageActive
    @Environment(\.setTint) private var tint

    /// `TimelineView`, not a stored `Timer.publish`: the store republishes
    /// every second, re-creating this struct and its publisher before it can
    /// fire, which left the countdown frozen at its starting value.
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            content(now: context.date)
        }
    }

    private func content(now: Date) -> some View {
        let paused = store.restPausedRemaining != nil
        let ringSize = WatchStyle.m(114)
        let ringLine = ringSize * 12 / 136
        return VStack(spacing: 0) {
            // A ring that empties as the rest runs down, with the time left in
            // it and the heart rate coming down under that.
            ZStack {
                Circle()
                    .inset(by: ringSize * 8 / 136)
                    .stroke(tint.mixed(0.26), lineWidth: ringLine)
                Circle()
                    .inset(by: ringSize * 8 / 136)
                    .trim(from: 0, to: CGFloat(1 - progress(now: now)))
                    .stroke(tint.color, style: StrokeStyle(lineWidth: ringLine, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(remainingLabel(now: now))
                        .font(.system(size: WatchStyle.num(34), weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(tint.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    if paused {
                        Text(String(localized: "watch.run.paused", defaultValue: "Paused"))
                            .font(.system(size: WatchStyle.m(13), weight: .semibold))
                            .foregroundStyle(Color.orange)
                    } else if let bpm = store.latestBpm {
                        // Not when the top line already shows it.
                        HStack(spacing: WatchStyle.m(3)) {
                            Image(systemName: "heart.fill")
                            Text("\(Int(bpm.rounded()))").monospacedDigit()
                        }
                        .font(.system(size: WatchStyle.m(15), weight: .semibold))
                        .foregroundStyle(WatchStyle.heart)
                    }
                }
                .padding(ringLine + WatchStyle.m(2))
            }
            .frame(width: ringSize, height: ringSize)
            .frame(maxWidth: .infinity)

            // Back 15 s, Skip (a double tap skips too), forward 15 s.
            HStack(spacing: WatchStyle.m(5)) {
                restButton(String(localized: "watch.workout.restBack", defaultValue: "−15"), label: String(localized: "watch.workout.restBackLabel", defaultValue: "Back 15 seconds")) {
                    store.adjustRest(bySeconds: -15)
                }
                Button(action: Haptics.tapping { store.skipRest() }) {
                    Text(String(localized: "watch.workout.skipRest", defaultValue: "Skip"))
                        .font(.system(size: WatchStyle.m(15), weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(46))
                        .background(Color.white, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .doubleTapGesture(enabled: workoutPageActive && checkIn.context.effectiveDoubleTapEnabled)
                restButton(String(localized: "watch.workout.restForward", defaultValue: "+15"), label: String(localized: "watch.workout.restForwardLabel", defaultValue: "Forward 15 seconds")) {
                    store.adjustRest(bySeconds: 15)
                }
            }
            .padding(.top, WatchStyle.m(5))
            // Paused on the phone: it owns the rest until it resumes.
            .disabled(paused)

            if let next = store.currentStep {
                Button(action: Haptics.tapping(onOpenList)) {
                    // The next set reads from across the bench: the exercise,
                    // then its weight and reps in large type, then dots for
                    // where it falls among the exercise's sets.
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: WatchStyle.m(4)) {
                            Text(String(localized: "watch.workout.nextLabel", defaultValue: "Next: "))
                                .font(.system(size: WatchStyle.m(17), weight: .medium))
                                .foregroundStyle(WatchStyle.grey)
                                .fixedSize()
                            FitName(text: next.exerciseName, size: 17, color: nextSupersetColor(next) ?? Color.white, height: WatchStyle.m(21))
                        }
                        .frame(height: WatchStyle.m(21))
                        if let target = SetValueText.target(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit, spaced: true) {
                            Text(target)
                                .font(.system(size: WatchStyle.m(21), weight: .semibold, design: .rounded))
                                .monospacedDigit()
                                .foregroundStyle(tint.light)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                                .frame(height: WatchStyle.m(25))
                        }
                        SetProgressRow(step: next, leading: true)
                            .frame(height: WatchStyle.m(16))
                    }
                    .padding(.leading, WatchStyle.m(6))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .padding(.top, WatchStyle.m(6))
                .accessibilityLabel(String(localized: "watch.workout.upNext", defaultValue: "Up next: \(next.exerciseName)"))
            }
        }
    }

    private func restButton(_ title: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: Haptics.tapping(action)) {
            Text(title)
                .font(.system(size: WatchStyle.m(15), weight: .semibold))
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity)
                .frame(height: WatchStyle.m(46))
                .background(WatchStyle.surface, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func remainingSeconds(now: Date) -> Int {
        #if DEBUG
        if let frozen = ScreenshotSeed.restRemainingOverride { return frozen }
        #endif
        if let paused = store.restPausedRemaining {
            return max(0, Int(paused.rounded()))
        }
        guard let endsAt = store.restEndsAt else { return 0 }
        return max(0, Int(endsAt.timeIntervalSince(now).rounded()))
    }

    private func remainingLabel(now: Date) -> String {
        let remaining = remainingSeconds(now: now)
        return String(format: "%d:%02d", remaining / 60, remaining % 60)
    }

    /// Fills as the rest runs down. Guards the denominator: `adjustRest` can
    /// only ever raise it, but a zero would still be a divide by zero here.
    private func progress(now: Date) -> Double {
        let total = Double(store.restDurationSeconds)
        guard total > 0 else { return 0 }
        return min(1, max(0, 1 - Double(remainingSeconds(now: now)) / total))
    }

    /// True only when this rest stays inside the superset just logged.
    /// Entering a superset, or leaving one for another, is still "Next set".
    private func continuesSuperset(_ next: WorkoutStep) -> Bool {
        guard let nextRun = next.supersetRun, store.currentStepIndex > 0 else {
            return false
        }
        return store.steps[store.currentStepIndex - 1].supersetRun == nextRun
    }

    private func nextSupersetColor(_ step: WorkoutStep) -> Color? {
        guard continuesSuperset(step), let run = step.supersetRun else { return nil }
        return SetSupersetPalette.color(for: run)
    }

}

/// Digit pad for one value. watchOS has no usable inline number field, and
/// the Digital Crown alone makes a 60 → 82.5 change a long scroll, so a
/// tapped value opens this instead.
struct NumericKeypadView: View {
    let title: String
    let initial: Double?
    let allowsDecimal: Bool
    /// Shows a ± key so an assisted bodyweight set can be entered below zero.
    var allowsNegative: Bool = false
    let onCommit: (Double) -> Void

    @State private var entry: String = ""
    @Environment(\.dismiss) private var dismiss

    private var keys: [String] {
        ["1", "2", "3", "4", "5", "6", "7", "8", "9", allowsDecimal ? "." : "", "0", "⌫"]
    }

    var body: some View {
        VStack(spacing: 2) {
            // Centered, not leading: the sheet's close button sits in the
            // top-leading corner and covered a left-aligned number.
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(entry.isEmpty ? placeholder : entry)
                    .font(.title3)
                    .monospacedDigit()
                    .foregroundStyle(entry.isEmpty ? Color.secondary : Color.primary)
                Text(title)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if allowsNegative {
                    Button("±", action: Haptics.tapping(toggleSign))
                        .font(.body)
                        .buttonStyle(.plain)
                        .padding(.horizontal, 6)
                        .background(Color.gray.opacity(0.25), in: Capsule())
                }
            }
            .frame(maxWidth: .infinity)

            LazyVGrid(columns: Array(repeating: GridItem(spacing: 2), count: 3), spacing: 2) {
                ForEach(keys, id: \.self) { key in
                    if key.isEmpty {
                        Color.clear.frame(height: 26)
                    } else {
                        Button(key, action: Haptics.tapping { press(key) })
                            .font(.body)
                            .frame(maxWidth: .infinity, minHeight: 26)
                            .buttonStyle(.plain)
                            .background(Color.gray.opacity(0.25), in: RoundedRectangle(cornerRadius: 6))
                    }
                }
            }

            Button(String(localized: "watch.common.ok", defaultValue: "OK")) {
                Haptics.tap()
                // Nothing typed keeps the value shown in grey.
                if let value = Double(entry) {
                    onCommit(value)
                } else if let initial {
                    onCommit(initial)
                } else {
                    dismiss()
                }
            }
            .frame(maxWidth: .infinity)
            .tint(.green)
            .disabled(Double(entry) == nil && initial == nil)
        }
        .padding(.horizontal, 2)
        // Opens empty with the current value in grey rather than filled in,
        // so a new number is typed straight away instead of deleting the old
        // one first; OK with nothing typed keeps the grey value.
    }

    private var placeholder: String {
        guard let initial else { return "0" }
        return initial == initial.rounded()
            ? String(Int(initial))
            : String(format: "%.1f", initial)
    }

    /// Flips the typed value between added (+) and assisted (−). With nothing
    /// typed yet a lone "-" waits for the digits.
    private func toggleSign() {
        if entry.hasPrefix("-") {
            entry.removeFirst()
        } else {
            entry = "-" + entry
        }
    }

    private func press(_ key: String) {
        switch key {
        case "⌫":
            if !entry.isEmpty { entry.removeLast() }
        case ".":
            if !entry.contains(".") {
                entry += (entry.isEmpty || entry == "-") ? "0." : "."
            }
        default:
            entry += key
        }
    }
}

/// A set that has been logged on the watch and is waiting for an effort pick.
private struct PendingRpe: Identifiable {
    let id = UUID()
    let step: WorkoutStep
    let values: SetValues
    /// When the set was ticked, not when its effort was saved: the phone starts
    /// its rest from this, so the two timers end together.
    let completedAt: Date

    /// "Set 1/3: 65.0lbs × 12", with whichever of weight and reps the set has.
    func summary(unit: WeightUnit) -> String {
        var parts: [String] = []
        if let kg = values.weightKg, kg > 0 {
            parts.append("\(SetValueText.format(unit.fromKg(kg))) \(unit.suffix)")
        }
        if let reps = values.reps {
            parts.append(String(format: "%.0f", reps))
        }
        // Just the numbers ("40 kg × 10"): the set's name is on the set
        // screen, and with it the line no longer fit.
        return parts.isEmpty ? SetProgressRow.title(for: step) : parts.joined(separator: " × ")
    }
}

/// One line of text that scrolls sideways to its end and back when it is wider
/// than the space it has, so a long exercise name can be read in full. A name
/// that fits stays still, and with Reduce Motion on it truncates instead.
struct MarqueeText: View {
    let text: String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var textWidth: CGFloat = 0

    private static let pointsPerSecond: Double = 25
    private static let pause: Double = 1.5
    private static let returnDuration: Double = 0.4

    var body: some View {
        Group {
            if reduceMotion {
                Text(text).lineLimit(1)
            } else {
                // The sizing text truncates, so it takes the width it is given
                // and never more; the full-length copy is drawn over it and
                // cannot widen the page (a fixed-size child inside the layout
                // did, and pushed the whole screen off its edges). The room the
                // copy has is read from the overlay's own geometry in the same
                // pass, and the text's own width is written straight into state
                // rather than sent up through a preference, which was not
                // delivered reliably on the workout screen.
                Text(text)
                    .lineLimit(1)
                    .opacity(0)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .leading) {
                        GeometryReader { geo in
                            let overflow = geo.size.width > 0 ? max(0, textWidth - geo.size.width) : 0
                            if overflow > 0.5 {
                                // Redrawn on a clock only while there is
                                // something to scroll; a name that fits is
                                // drawn once.
                                TimelineView(.animation(minimumInterval: 1.0 / 30)) { context in
                                    fullText
                                        .offset(x: offset(at: context.date, overflow: overflow))
                                        .frame(width: geo.size.width, alignment: .leading)
                                }
                            } else {
                                fullText
                                    .frame(width: geo.size.width, alignment: .leading)
                            }
                        }
                    }
                    .clipped()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }

    /// The whole name on one line, at its own width, which it also reports.
    private var fullText: some View {
        Text(text)
            .lineLimit(1)
            .fixedSize()
            .background(GeometryReader { proxy in
                Color.clear
                    .onAppear { textWidth = proxy.size.width }
                    .onChange(of: proxy.size.width) { textWidth = proxy.size.width }
            })
    }

    /// Wait, scroll to the end, wait, then glide back, and again. The phase
    /// comes from the wall clock alone, so a view the workout screen's
    /// once-a-second redraw rebuilt carries on where it was instead of
    /// starting over (and never getting past its first pause).
    private func offset(at date: Date, overflow: CGFloat) -> CGFloat {
        let travel = Double(overflow) / Self.pointsPerSecond
        let cycle = Self.pause + travel + Self.pause + Self.returnDuration
        let t = date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: cycle)
        let fraction: Double
        if t < Self.pause {
            fraction = 0
        } else if t < Self.pause + travel {
            fraction = (t - Self.pause) / travel
        } else if t < Self.pause + travel + Self.pause {
            fraction = 1
        } else {
            fraction = 1 - (t - (Self.pause + travel + Self.pause)) / Self.returnDuration
        }
        return -overflow * CGFloat(min(max(fraction, 0), 1))
    }
}

/// Effort picked after a set: the set it is for, the value with what it means
/// in reps left, and the same segmented track as the workout effort picker, set
/// with the Digital Crown or a drag. Skip / Save; a double tap saves.
/// `onDone(nil)` skips.
private struct RpePickerView: View {
    let summary: String
    let hapticsEnabled: Bool
    let onDone: (Double?) -> Void

    @Environment(\.setTint) private var tint
    @EnvironmentObject private var checkIn: CheckInStore
    private var title: String { String(localized: "watch.effort.setTitle", defaultValue: "How hard?") }
    @Environment(\.workoutPageActive) private var workoutPageActive

    /// Whole numbers from 1 through 6, then half steps through 10.
    private static let values: [Double] = [
        1, 2, 3, 4, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
    ]

    /// Starts on 8, the middle of what most working sets are.
    @State private var index = RpePickerView.values.firstIndex(of: 8) ?? 0

    private var value: Double { Self.values[index] }

    private var valueText: String {
        value.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", value)
            : String(format: "%.1f", value)
    }

    /// How much was left, in Hevy's words.
    private var meaning: String {
        switch value {
        case 10:
            return String(localized: "watch.rpe.meaning.10", defaultValue: "No more reps possible")
        case 9.5:
            return String(localized: "watch.rpe.meaning.9_5", defaultValue: "Could've maybe done 1 more rep")
        case 9:
            return String(localized: "watch.rpe.meaning.9", defaultValue: "Could've done 1 more rep")
        case 8.5:
            return String(localized: "watch.rpe.meaning.8_5", defaultValue: "Could've maybe done 2 more reps")
        case 8:
            return String(localized: "watch.rpe.meaning.8", defaultValue: "Could've done 2 more reps")
        case 7.5:
            return String(localized: "watch.rpe.meaning.7_5", defaultValue: "Could've maybe done 3 more reps")
        case 7:
            return String(localized: "watch.rpe.meaning.7", defaultValue: "Could've done 3 more reps")
        case 6.5:
            return String(localized: "watch.rpe.meaning.6_5", defaultValue: "Could've maybe done 4 more reps")
        case 6:
            return String(localized: "watch.rpe.meaning.6", defaultValue: "Could've done 4+ more reps")
        case 5:
            return String(localized: "watch.rpe.meaning.5", defaultValue: "Could've done 5+ more reps")
        case 4:
            return String(localized: "watch.rpe.meaning.4", defaultValue: "Light effort")
        case 3:
            return String(localized: "watch.rpe.meaning.3", defaultValue: "Very light effort")
        default:
            return String(localized: "watch.rpe.meaning.low", defaultValue: "Little to no effort")
        }
    }

    /// The short form under the number: "2 reps left".
    private var repsLeft: String {
        switch value {
        case 10: return String(localized: "watch.rpe.short.10", defaultValue: "0 reps left")
        case 9.5: return String(localized: "watch.rpe.short.9_5", defaultValue: "0–1 reps left")
        case 9: return String(localized: "watch.rpe.short.9", defaultValue: "1 rep left")
        case 8.5: return String(localized: "watch.rpe.short.8_5", defaultValue: "1–2 reps left")
        case 8: return String(localized: "watch.rpe.short.8", defaultValue: "2 reps left")
        case 7.5: return String(localized: "watch.rpe.short.7_5", defaultValue: "2–3 reps left")
        case 7: return String(localized: "watch.rpe.short.7", defaultValue: "3 reps left")
        case 6.5: return String(localized: "watch.rpe.short.6_5", defaultValue: "3–4 reps left")
        case 6: return String(localized: "watch.rpe.short.6", defaultValue: "4+ reps left")
        case 5: return String(localized: "watch.rpe.short.5", defaultValue: "5+ reps left")
        case 4: return String(localized: "watch.rpe.short.4", defaultValue: "Light")
        case 3: return String(localized: "watch.rpe.short.3", defaultValue: "Very light")
        default: return String(localized: "watch.rpe.short.low", defaultValue: "Easy")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title)
                .font(.system(size: WatchStyle.m(24), weight: .semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .frame(height: WatchStyle.m(28))
                .accessibilityAddTraits(.isHeader)
            Text(summary)
                .font(.system(size: WatchStyle.m(14)))
                .foregroundStyle(WatchStyle.grey)
                .lineLimit(1)
                .frame(height: WatchStyle.m(18))
                .padding(.top, WatchStyle.m(1))
            HStack(alignment: .lastTextBaseline, spacing: WatchStyle.m(10)) {
                Text(valueText)
                    .font(.system(size: WatchStyle.num(68), weight: .semibold))
                    .monospacedDigit()
                    .tracking(-WatchStyle.m(2))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(repsLeft)
                    .font(.system(size: WatchStyle.m(21), weight: .semibold))
                    .foregroundStyle(tint.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
            }
            .padding(.top, WatchStyle.m(16))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "watch.rpe.label", defaultValue: "RPE \(valueText), \(meaning)"))

            EffortTrack(values: Self.values, index: $index, hapticsEnabled: hapticsEnabled, uniform: tint.color)
                .padding(.top, WatchStyle.m(16))

            Spacer(minLength: WatchStyle.m(8))
            HStack(spacing: WatchStyle.m(6)) {
                Button { onDone(nil) } label: {
                    Text(String(localized: "watch.rpe.skip", defaultValue: "Skip"))
                        .font(.system(size: WatchStyle.m(16), weight: .semibold))
                        .foregroundStyle(Color.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(48))
                        .background(WatchStyle.surface, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                Button { onDone(value) } label: {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.system(size: WatchStyle.m(16), weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: WatchStyle.m(48))
                        .background(Color.white, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(.plain)
                .doubleTapGesture(enabled: workoutPageActive && checkIn.context.effectiveDoubleTapEnabled)
            }
            .padding(.bottom, WatchStyle.bottom)
        }
        .padding(.horizontal, WatchStyle.overlaySide)
        .padding(.top, WatchStyle.top)
        .frame(maxHeight: .infinity, alignment: .top)
        .ignoresSafeArea(edges: .top)
    }
}

#if DEBUG
/// A store already mid-workout, for the canvases below. `completedSets` marks
/// that many sets done — one is enough to put the view into its rest state,
/// since completing a set starts that set's rest.
@MainActor
private func previewStore(
    bpm: Double? = SampleDay.workoutBpm,
    completedSets: Int = 0
) -> WorkoutSessionStore {
    let store = WorkoutSessionStore.previewInstance()
    store.start(with: SampleDay.workoutPlan)
    if let bpm {
        store.recordHeartRate(bpm: bpm)
        store.recordActiveEnergy(kcal: 84)
    }
    for _ in 0..<completedSets {
        store.completeCurrentSet()
    }
    return store
}

#Preview("Mid-workout") {
    WorkoutView()
        .environmentObject(previewStore())
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(CheckInStore.shared)
}

#Preview("Resting") {
    WorkoutView()
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(CheckInStore.shared)
}

/// Before the phone has armed anything — what the tab shows most of the time.
#Preview("No workout") {
    WorkoutView()
        .environmentObject(WorkoutSessionStore.previewInstance())
        .environmentObject(WatchSessionManager.shared)
}

/// The no-heart-rate layout, which is also everything a simulator can render.
#Preview("No heart rate") {
    WorkoutView()
        .environmentObject(previewStore(bpm: nil))
        .environmentObject(WatchSessionManager.shared)
        .environmentObject(CheckInStore.shared)
}

/// The picker reached from the back chevron, one exercise part way done.
#Preview("Exercise picker") {
    ExerciseListView(onSelect: { _ in }, onClose: {})
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
}
#endif


private extension View {
    /// One full screen tall, with the content kept inside the safe area, so
    /// it sits where a plain page would.
    /// `fromScreenTop`: the content starts at the top of the screen, under the
    /// clock, as the set screen does.
    func workoutPage(_ geo: GeometryProxy, alignment: Alignment = .center, fromScreenTop: Bool = false) -> some View {
        self
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .padding(.top, fromScreenTop ? WatchStyle.top : geo.safeAreaInsets.top)
            // The page dots sit in the bottom 14 pt of a set page.
            .padding(.bottom, fromScreenTop ? WatchStyle.m(14) : geo.safeAreaInsets.bottom)
            .frame(
                height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom
            )
    }
}

/// The walks and runs the watch can record on its own: Run and Walk side by
/// side under Outdoor and Indoor, then any plans, in the same flat squircles
/// as the workout list. Outdoors uses the watch's GPS and records a route;
/// indoors there is no route and the distance is the watch's own estimate.
private struct CardioChoicesView: View {
    /// Plans from the phone: the training-program workout due, then the
    /// built-in interval plans. Empty until the phone has said.
    let plans: [WatchRunPlan]
    /// Routes the phone put on the watch ahead of time (`WatchRouteLibraryStore`).
    let routes: [WatchRoute]
    let usesMiles: Bool
    /// Where the alert ranges start when turned on: what was last used on the
    /// phone, or a plain default.
    let suggestedPace: WatchPaceBand
    let suggestedHeartRate: WatchHeartRateBand
    let onChoose: (WatchRunKind, WatchRunPlace, WatchRunPlan?, WatchRunAlertSetup) -> Void
    let onChooseRoute: (WatchRunKind, WatchRoute, WatchRunAlertSetup) -> Void
    /// This run's alerts. Fresh each time the sheet opens, so an alert never
    /// carries over to the next run.
    @State private var alerts = WatchRunAlertSetup.off

    private func choose(_ kind: WatchRunKind, _ place: WatchRunPlace, _ plan: WatchRunPlan?) {
        onChoose(kind, place, plan, alerts)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: WatchStyle.s(6)) {
                    alertsRow
                    ForEach([WatchRunPlace.outdoor, .indoor], id: \.self) { place in
                        sectionTitle(place.label)
                        // Two columns, so every tile is the size of a Run or
                        // Walk one. Indoor has three, leaving the last cell
                        // empty rather than stretching a tile across.
                        LazyVGrid(
                            columns: [
                                GridItem(.flexible(), spacing: WatchStyle.s(6)),
                                GridItem(.flexible()),
                            ],
                            spacing: WatchStyle.s(6)
                        ) {
                            tile(.run, place)
                            tile(.walk, place)
                            if place == .indoor {
                                tile(.jumpRope, place)
                            }
                        }
                    }
                    if !routes.isEmpty {
                        sectionTitle(String(localized: "watch.cardio.routes", defaultValue: "Routes"))
                        ForEach(routes) { route in
                            NavigationLink {
                                RouteKindView(route: route, usesMiles: usesMiles) { kind in
                                    onChooseRoute(kind, route, alerts)
                                }
                            } label: {
                                routeRow(route)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if !plans.isEmpty {
                        sectionTitle(String(localized: "watch.cardio.followPlan", defaultValue: "Follow a plan"))
                        ForEach(plans) { plan in
                            NavigationLink {
                                PlanPlaceView(plan: plan, onChoose: choose)
                            } label: {
                                planRow(plan)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, WatchStyle.s(2))
            }
            .navigationTitle(String(localized: "watch.cardio.title", defaultValue: "Cardio"))
        }
    }

    /// "Alerts: Off", or what is on for this run. Opens the setup.
    private var alertsRow: some View {
        NavigationLink {
            RunAlertsView(
                alerts: $alerts,
                usesMiles: usesMiles,
                suggestedPace: suggestedPace,
                suggestedHeartRate: suggestedHeartRate
            )
        } label: {
            HStack(spacing: WatchStyle.s(8)) {
                Image(systemName: "bell.badge")
                    .font(.system(size: WatchStyle.s(15), weight: .semibold))
                    .foregroundStyle(alerts == .off ? Color.secondary : Color.orange)
                VStack(alignment: .leading, spacing: 0) {
                    Text(String(localized: "watch.cardio.alerts", defaultValue: "Alerts"))
                        .font(.system(size: WatchStyle.s(15), weight: .semibold))
                        .foregroundStyle(.white)
                    Text(alertsSummary)
                        .font(.system(size: WatchStyle.s(11)))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.horizontal, WatchStyle.s(12))
            .padding(.vertical, WatchStyle.s(10))
            .background(WatchStyle.fill, in: WatchStyle.shape)
            .contentShape(WatchStyle.shape)
        }
        .buttonStyle(.plain)
    }

    private var alertsSummary: String {
        var parts: [String] = []
        if let pace = alerts.pace {
            parts.append(String(localized: "watch.cardio.summary.pace", defaultValue: "Pace \(RunAlertsView.paceText(pace, usesMiles: usesMiles))"))
        }
        if let hr = alerts.heartRate {
            parts.append(String(localized: "watch.cardio.summary.heartRate", defaultValue: "Heart rate \(Int(hr.minBpm))–\(Int(hr.maxBpm))"))
        }
        return parts.isEmpty ? String(localized: "watch.cardio.off", defaultValue: "Off") : parts.joined(separator: " · ")
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text)
            .font(.system(size: WatchStyle.s(13), weight: .semibold))
            .foregroundStyle(.secondary)
            .padding(.top, WatchStyle.s(4))
            .padding(.leading, WatchStyle.s(4))
    }

    /// Glyph over the word, as a square tile, so "Run" and "Walk" sit side by
    /// side without either being cut short.
    private func tile(_ kind: WatchRunKind, _ place: WatchRunPlace) -> some View {
        Button {
            Haptics.tap()
            choose(kind, place, nil)
        } label: {
            VStack(spacing: WatchStyle.s(4)) {
                Image(systemName: kind.symbol)
                    .font(.system(size: WatchStyle.s(22), weight: .semibold))
                    .foregroundStyle(.green)
                Text(kind.shortLabel)
                    .font(.system(size: WatchStyle.s(15), weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(maxWidth: .infinity)
            .frame(height: WatchStyle.s(64))
            .background(WatchStyle.fill, in: WatchStyle.shape)
            .contentShape(WatchStyle.shape)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(kind.title(place))
    }

    private func routeRow(_ route: WatchRoute) -> some View {
        HStack(spacing: WatchStyle.s(8)) {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                .font(.system(size: WatchStyle.s(15), weight: .semibold))
                .foregroundStyle(.cyan)
            VStack(alignment: .leading, spacing: 0) {
                Text(route.name)
                    .font(.system(size: WatchStyle.s(15), weight: .semibold))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(routeDistance(route, usesMiles: usesMiles))
                    .font(.system(size: WatchStyle.s(11)))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, WatchStyle.s(12))
        .padding(.vertical, WatchStyle.s(10))
        .background(WatchStyle.fill, in: WatchStyle.shape)
        .contentShape(WatchStyle.shape)
    }

    private func planRow(_ plan: WatchRunPlan) -> some View {
        HStack(spacing: WatchStyle.s(8)) {
            Image(systemName: plan.programId == nil ? "timer" : "calendar")
                .font(.system(size: WatchStyle.s(15), weight: .semibold))
                .foregroundStyle(plan.programId == nil ? Color.orange : Color.blue)
            Text(plan.name)
                .font(.system(size: WatchStyle.s(15), weight: .semibold))
                .foregroundStyle(.white)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, WatchStyle.s(12))
        .padding(.vertical, WatchStyle.s(12))
        .background(WatchStyle.fill, in: WatchStyle.shape)
        .contentShape(WatchStyle.shape)
    }
}

/// "5.20 km" / "3.23 mi" for a stored route's list row and title.
private func routeDistance(_ route: WatchRoute, usesMiles: Bool) -> String {
    let value = WatchRunMetrics.distanceText(route.lengthMeters, usesMiles: usesMiles)
    return "\(value) \(usesMiles ? String(localized: "watch.unit.mi", defaultValue: "mi") : String(localized: "watch.unit.km", defaultValue: "km"))"
}

/// Run or walk a stored route. Outdoor only: indoors there is no GPS to
/// follow a line with.
private struct RouteKindView: View {
    let route: WatchRoute
    let usesMiles: Bool
    let onChoose: (WatchRunKind) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: WatchStyle.s(6)) {
                Text(routeDistance(route, usesMiles: usesMiles))
                    .font(.system(size: WatchStyle.s(12)))
                    .foregroundStyle(.secondary)
                ForEach([WatchRunKind.run, .walk], id: \.self) { kind in
                    Button {
                        Haptics.tap()
                        onChoose(kind)
                    } label: {
                        Label(kind.title(.outdoor), systemImage: kind.symbol)
                            .font(.system(size: WatchStyle.s(16), weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, WatchStyle.s(12))
                            .padding(.vertical, WatchStyle.s(14))
                            .background(Color.green.opacity(0.25), in: WatchStyle.shape)
                            .contentShape(WatchStyle.shape)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, WatchStyle.s(2))
        }
        .navigationTitle(route.name)
    }
}

/// Where to do a plan: outdoors with the watch's GPS, or indoors. A plan is a
/// run unless the phone says it is a walk (the walking program).
private struct PlanPlaceView: View {
    let plan: WatchRunPlan
    let onChoose: (WatchRunKind, WatchRunPlace, WatchRunPlan?) -> Void

    var body: some View {
        ScrollView {
            VStack(spacing: WatchStyle.s(6)) {
                // Distance steps follow the watch's GPS distance, so a plan with
                // them is outdoor only.
                ForEach(plan.hasDistanceSteps ? [WatchRunPlace.outdoor] : [.outdoor, .indoor], id: \.self) { place in
                    Button {
                        Haptics.tap()
                        onChoose(plan.kind, place, plan)
                    } label: {
                        Label(plan.kind.title(place), systemImage: plan.kind.symbol)
                            .font(.system(size: WatchStyle.s(16), weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, WatchStyle.s(12))
                            .padding(.vertical, WatchStyle.s(14))
                            .background(Color.green.opacity(0.25), in: WatchStyle.shape)
                            .contentShape(WatchStyle.shape)
                    }
                    .buttonStyle(.plain)
                }
                if plan.hasDistanceSteps {
                    Text(String(localized: "watch.cardio.distanceOutdoorOnly", defaultValue: "Distance steps need GPS, so this plan is outdoor only."))
                        .font(.system(size: WatchStyle.s(11)))
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, WatchStyle.s(2))
        }
        .navigationTitle(plan.name)
    }
}

/// Pace and heart-rate alerts for the run about to start. Each is off until
/// turned on here, and only lasts for this run, as in the Workout app. A range
/// is moved with the Digital Crown or the plus and minus buttons.
private struct RunAlertsView: View {
    @Binding var alerts: WatchRunAlertSetup
    let usesMiles: Bool
    let suggestedPace: WatchPaceBand
    let suggestedHeartRate: WatchHeartRateBand

    /// Seconds per kilometre to the phone's unit, and back.
    private var perUnit: Double { usesMiles ? 1.609344 : 1 }
    private var unitLabel: String { usesMiles ? String(localized: "watch.unit.perMi", defaultValue: "/mi") : String(localized: "watch.unit.perKm", defaultValue: "/km") }

    /// "5:00–5:30 /km", in the phone's unit.
    static func paceText(_ band: WatchPaceBand, usesMiles: Bool) -> String {
        let perUnit = usesMiles ? 1.609344 : 1
        let fast = WatchRunMetrics.paceText(band.minSecondsPerKm * perUnit)
        let slow = WatchRunMetrics.paceText(band.maxSecondsPerKm * perUnit)
        return "\(fast)–\(slow) \(usesMiles ? String(localized: "watch.unit.perMi", defaultValue: "/mi") : String(localized: "watch.unit.perKm", defaultValue: "/km"))"
    }

    var body: some View {
        List {
            Toggle(String(localized: "watch.run.paceAlert", defaultValue: "Pace alert"), isOn: Binding(
                get: { alerts.pace != nil },
                set: { alerts.pace = $0 ? suggestedPace : nil }
            ))
            if let pace = alerts.pace {
                Stepper(
                    value: paceEdge(\.minSecondsPerKm, of: pace),
                    in: paceRange(for: pace, fastest: true),
                    step: 5
                ) {
                    edgeLabel(String(localized: "watch.cardio.fastest", defaultValue: "Fastest"), WatchRunMetrics.paceText(pace.minSecondsPerKm * perUnit) + " " + unitLabel)
                }
                Stepper(
                    value: paceEdge(\.maxSecondsPerKm, of: pace),
                    in: paceRange(for: pace, fastest: false),
                    step: 5
                ) {
                    edgeLabel(String(localized: "watch.cardio.slowest", defaultValue: "Slowest"), WatchRunMetrics.paceText(pace.maxSecondsPerKm * perUnit) + " " + unitLabel)
                }
            }
            Toggle(String(localized: "watch.run.heartRateAlert", defaultValue: "Heart rate alert"), isOn: Binding(
                get: { alerts.heartRate != nil },
                set: { alerts.heartRate = $0 ? suggestedHeartRate : nil }
            ))
            if let hr = alerts.heartRate {
                Stepper(
                    value: heartRateEdge(lowest: true),
                    in: WatchHeartRateBand.lowest...(hr.maxBpm - WatchHeartRateBand.minWidth),
                    step: 5
                ) {
                    edgeLabel(String(localized: "watch.cardio.lowest", defaultValue: "Lowest"), "\(Int(hr.minBpm)) \(String(localized: "watch.unit.bpm", defaultValue: "bpm"))")
                }
                Stepper(
                    value: heartRateEdge(lowest: false),
                    in: (hr.minBpm + WatchHeartRateBand.minWidth)...WatchHeartRateBand.highest,
                    step: 5
                ) {
                    edgeLabel(String(localized: "watch.cardio.highest", defaultValue: "Highest"), "\(Int(hr.maxBpm)) \(String(localized: "watch.unit.bpm", defaultValue: "bpm"))")
                }
            }
        }
        .navigationTitle(String(localized: "watch.cardio.alerts", defaultValue: "Alerts"))
    }

    private func edgeLabel(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.footnote).foregroundStyle(.secondary)
            Text(value).font(.system(size: WatchStyle.s(16), weight: .semibold)).monospacedDigit()
        }
    }

    /// The edge in the phone's unit (seconds per km or mile), written back as
    /// seconds per km.
    private func paceEdge(
        _ keyPath: WritableKeyPath<WatchPaceBand, Double>,
        of band: WatchPaceBand
    ) -> Binding<Double> {
        Binding(
            get: { band[keyPath: keyPath] * perUnit },
            set: { newValue in
                guard var current = alerts.pace else { return }
                current[keyPath: keyPath] = (newValue / perUnit).rounded()
                alerts.pace = current
            }
        )
    }

    /// Keeps the two edges at least the minimum width apart.
    private func paceRange(for band: WatchPaceBand, fastest: Bool) -> ClosedRange<Double> {
        let gap = WatchPaceBand.minWidth * perUnit
        if fastest {
            let upper = max(WatchPaceBand.fastest * perUnit, band.maxSecondsPerKm * perUnit - gap)
            return (WatchPaceBand.fastest * perUnit)...upper
        }
        let lower = min(WatchPaceBand.slowest * perUnit, band.minSecondsPerKm * perUnit + gap)
        return lower...(WatchPaceBand.slowest * perUnit)
    }

    private func heartRateEdge(lowest: Bool) -> Binding<Double> {
        Binding(
            get: { (lowest ? alerts.heartRate?.minBpm : alerts.heartRate?.maxBpm) ?? 0 },
            set: { newValue in
                guard var current = alerts.heartRate else { return }
                if lowest { current.minBpm = newValue } else { current.maxBpm = newValue }
                alerts.heartRate = current
            }
        )
    }
}
