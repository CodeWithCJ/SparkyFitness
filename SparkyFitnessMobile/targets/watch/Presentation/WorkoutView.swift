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
private enum SupersetPalette {
    private static let colors: [Color] = [
        Color(red: 105 / 255, green: 146 / 255, blue: 211 / 255),
        Color(red: 209 / 255, green: 138 / 255, blue: 97 / 255),
        Color(red: 145 / 255, green: 102 / 255, blue: 204 / 255),
        Color(red: 106 / 255, green: 164 / 255, blue: 111 / 255),
        Color(red: 204 / 255, green: 102 / 255, blue: 136 / 255),
        Color(red: 90 / 255, green: 173 / 255, blue: 175 / 255),
        Color(red: 212 / 255, green: 169 / 255, blue: 84 / 255),
        Color(red: 110 / 255, green: 118 / 255, blue: 135 / 255),
    ]

    static func color(for run: Int) -> Color {
        colors[abs(run) % colors.count]
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

    var body: some View {
        Group {
            if store.isActive {
                ActiveWorkoutView()
                    .overlay(alignment: .top) {
                        if let exercise = store.prBannerExercise {
                            PersonalRecordBanner(exercise: exercise)
                                .onTapGesture { store.dismissPrBanner() }
                                .transition(.move(edge: .top).combined(with: .opacity))
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
                WorkoutSummaryView(summary: summary)
            } else {
                WaitingForWorkoutView()
            }
        }
    }
}

/// Banner over the active workout when a set logged on the wrist is a record.
private struct PersonalRecordBanner: View {
    let exercise: String

    var body: some View {
        VStack(spacing: 0) {
            Label(String(localized: "watch.workout.newPr", defaultValue: "New PR!"), systemImage: "trophy.fill")
                .font(.headline)
            if !exercise.isEmpty {
                Text(exercise).font(.footnote).lineLimit(1)
            }
        }
        .foregroundStyle(.black)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(Capsule().fill(Color.yellow))
    }
}

/// Shown after a workout ends, until dismissed. Scrolls: the totals do not
/// fit a 40mm screen next to the Done button.
private struct WorkoutSummaryView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    let summary: WorkoutSummary
    private var unit: WeightUnit { checkIn.context.effectiveWeightUnit }

    private var duration: String {
        let s = summary.durationSeconds
        return s >= 3600
            ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String(format: "%d:%02d", s / 60, s % 60)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Label(String(localized: "watch.workout.done", defaultValue: "Workout done"), systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(.green)
                row(String(localized: "watch.summary.time", defaultValue: "Time"), duration)
                row(String(localized: "watch.summary.sets", defaultValue: "Sets"), "\(summary.setsCompleted)")
                if summary.volumeKg > 0 {
                    row(String(localized: "watch.summary.volume", defaultValue: "Volume"), "\(Int(unit.fromKg(summary.volumeKg).rounded())) \(unit.suffix)")
                }
                if let avg = summary.averageBpm {
                    row(String(localized: "watch.summary.avgHr", defaultValue: "Avg HR"), "\(Int(avg.rounded())) bpm")
                }
                if let max = summary.maxBpm {
                    row(String(localized: "watch.summary.maxHr", defaultValue: "Max HR"), "\(Int(max.rounded())) bpm")
                }
                if let kcal = summary.activeEnergyKcal, kcal > 0 {
                    row(String(localized: "watch.summary.active", defaultValue: "Active"), "\(Int(kcal.rounded())) kcal")
                }
                WorkoutEffortPicker { score, done in
                    session.rateWorkoutEffort(score, sessionId: summary.sessionId, completion: done)
                }
                Button(String(localized: "watch.common.done", defaultValue: "Done")) { store.dismissSummary() }
                    .padding(.top, 4)
            }
            .padding(.horizontal, 4)
            // The clock sits over the top of a scrolling page, so the title
            // starts below it.
            .padding(.top, 22)
        }
    }

    private func row(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).font(.body).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.body.weight(.semibold)).monospacedDigit()
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
            }
        }
    }
}

private struct ActiveWorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager
    @EnvironmentObject private var checkIn: CheckInStore

    @State private var showingExercises = false
    @State private var page: WorkoutPageID? = .set
    /// A logged set held back while the wearer picks an effort. Held here and
    /// not in `CurrentSetView`: logging a set starts the rest, which swaps that
    /// view for `RestView` and would take the screen, and the set with it,
    /// away before anything was sent. Sent once, on save, skip or dismissal.
    @State private var pendingRpe: PendingRpe?

    /// Always available, including during rest: Finish lives in the picker
    /// sheet, and hiding the chevron while resting left no way to end the
    /// HealthKit session from the wrist.
    private var openExerciseList: (() -> Void)? {
        { showingExercises = true }
    }

    /// Sends the answer first so the phone has it by the time it hears the
    /// workout ended, then ends the workout.
    private func finish(updatingPreset update: Bool) {
        store.askingPresetUpdate = false
        if let sessionId = store.plan?.sessionId {
            session.sendPresetUpdateAnswer(sessionId: sessionId, update: update)
        }
        session.endWorkout()
    }

    var body: some View {
        // The set screen, then (scrolling up from the bottom, as in Hevy) what
        // can be done to the set, to the exercise, and to the workout. Each is
        // one screen tall and the scroll snaps to it. The crown scrolls only
        // while no value box has claimed it for adjusting a number.
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 0) {
                    setScreen
                        .workoutPage(geo, alignment: .top)
                        .id(WorkoutPageID.set)
                    // Both pages are the wearer's choice (Settings → Apple
                    // Watch on the phone). The metrics page only stands in
                    // for the metrics the set screen is not showing.
                    if checkIn.context.effectiveUpNextPage {
                        UpNextPage(onOpenList: { showingExercises = true })
                            .workoutPage(geo)
                            .id(WorkoutPageID.upNext)
                    }
                    if !checkIn.context.effectiveSetScreenMetrics {
                        WorkoutMetricsPage()
                            .workoutPage(geo)
                            .id(WorkoutPageID.metrics)
                    }
                    if let step = store.currentStep {
                        SetOptionsPage(step: step)
                            .workoutPage(geo)
                            .id(WorkoutPageID.setOptions)
                        ExerciseOptionsPage(step: step)
                            .workoutPage(geo)
                            .id(WorkoutPageID.exerciseOptions)
                    }
                    WorkoutActionsPage()
                        .workoutPage(geo)
                        .id(WorkoutPageID.actions)
                }
                .scrollTargetLayout()
            }
            .scrollPosition(id: $page)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            // Pages are laid out against the whole screen, so each snaps to
            // exactly one screen; `workoutPage` puts the content back inside
            // the area the clock and page dots leave free.
            .ignoresSafeArea(edges: .vertical)
        }
        // A set logged here or on the phone, an edit, or a jump from the
        // list moves the cursor: back to the set screen.
        .onChange(of: store.currentStep?.plannedSet.setId) { page = .set }
        .padding(.horizontal, 4)
        .sheet(isPresented: $showingExercises) {
            ExerciseListView { exerciseEntryId in
                store.jumpToExercise(exerciseEntryId)
            }
        }
        // Over the whole page rather than a sheet: a sheet brings the system's
        // close button, which sat on top of the exercise name and left no room
        // on a 40 mm screen. Skip closes it, and a set waits here until then.
        .overlay {
            if let pending = pendingRpe {
                RpePickerView(
                    title: pending.step.exerciseName,
                    summary: pending.summary(unit: checkIn.context.effectiveWeightUnit),
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
        // Asked when Finish is tapped on a workout that changed from the saved
        // one it started from, as Hevy does. Only buttons close it.
        .alert(
            String(localized: "watch.workout.updatePresetTitle", defaultValue: "Update Workout?"),
            isPresented: Binding(
                get: { store.askingPresetUpdate },
                set: { _ in }
            )
        ) {
            Button(String(localized: "watch.workout.updatePreset", defaultValue: "Update")) { finish(updatingPreset: true) }
            Button(String(localized: "watch.workout.keepOriginal", defaultValue: "Keep Original"), role: .cancel) { finish(updatingPreset: false) }
        } message: {
            Text(String(localized: "watch.workout.updatePresetMessage", defaultValue: "Save the changes you made to \"\(store.plan?.workoutName ?? "")\"?"))
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
            switch ScreenshotSeed.workoutPage {
            case "upnext", "swap": page = .upNext
            case "metrics": page = .metrics
            case "setoptions": page = .setOptions
            case "exerciseoptions": page = .exerciseOptions
            case "actions": page = .actions
            default: break
            }
            if ScreenshotSeed.opensRpe, let step = store.currentStep {
                pendingRpe = PendingRpe(
                    step: step,
                    values: store.values(for: step),
                    completedAt: Date()
                )
            }
            if ScreenshotSeed.opensPresetUpdate {
                store.askingPresetUpdate = true
            }
            #endif
        }
        .onChange(of: store.pendingSetCompletion) {
            if store.pendingSetCompletion == nil { pendingRpe = nil }
        }
    }

    private var setScreen: some View {
        // Time, heart rate and calories sit on one line here when the wearer
        // keeps them on the set screen (the default), else on the metrics
        // page; the heart rate is also inside the rest ring.
        VStack(spacing: 4) {
            if let format = store.plan?.workoutFormat?.lowercased(), format != "standard" {
                IntervalCaptionView(plan: store.plan)
            }
            // During a rest too: the ring shows the heart rate, but not the
            // elapsed time or calories.
            if checkIn.context.effectiveSetScreenMetrics, store.isResting || store.currentStep != nil {
                SetScreenMetricsLine()
            }

            Group {
                if store.isResting {
                    RestView(onOpenList: { showingExercises = true })
                } else if let step = store.currentStep {
                    CurrentSetView(step: step, onOpenList: { showingExercises = true }) { pendingRpe = $0 }
                } else {
                    WorkoutCompleteView()
                }
            }
        }
    }
}

private enum WorkoutPageID: Hashable {
    case set, upNext, metrics, setOptions, exerciseOptions, actions
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

/// Consecutive members of one superset, or a run of exercises that are not.
private struct ExerciseBlock: Identifiable {
    let id: String
    let header: String?
    let supersetRun: Int?
    var exercises: [PlannedExercise]
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

    @EnvironmentObject private var store: WorkoutSessionStore
    @Environment(\.dismiss) private var dismiss

    @State private var confirmingFinish = false
    @State private var confirmingDiscard = false
    @State private var addingExercise = false

    private var exercises: [PlannedExercise] { store.plan?.exercises ?? [] }

    /// Consecutive members of one superset stay together under one header.
    /// Solos stay in the plain list.
    private var blocks: [ExerciseBlock] {
        var blocks: [ExerciseBlock] = []
        for exercise in exercises {
            if let run = exercise.supersetRun,
               let index = blocks.indices.last,
               blocks[index].id == "superset-\(run)" {
                blocks[index].exercises.append(exercise)
                continue
            }
            if exercise.supersetRun == nil,
               let index = blocks.indices.last,
               blocks[index].header == nil {
                blocks[index].exercises.append(exercise)
                continue
            }
            let run = exercise.supersetRun
            if let run {
                blocks.append(
                    ExerciseBlock(
                        id: "superset-\(run)",
                        header: String(localized: "watch.workout.supersetHeader", defaultValue: "Superset"),
                        supersetRun: run,
                        exercises: [exercise]
                    )
                )
            } else {
                blocks.append(
                    ExerciseBlock(
                        id: exercise.exerciseEntryId,
                        header: nil,
                        supersetRun: nil,
                        exercises: [exercise]
                    )
                )
            }
        }
        return blocks
    }

    var body: some View {
        // A stack only to give the sheet a title: watchOS puts it, small and
        // grey, under the clock, which names the workout without a row.
        NavigationStack {
            List {
                ForEach(blocks) { block in
                    Section {
                        ForEach(block.exercises) { exercise in
                            Button {
                                Haptics.tap()
                                onSelect(exercise.exerciseEntryId)
                                dismiss()
                            } label: {
                                ExerciseRow(exercise: exercise)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                        }
                    } header: {
                        if let header = block.header, let run = block.supersetRun {
                            Text(header)
                                .foregroundStyle(SupersetPalette.color(for: run))
                        }
                    }
                }

                Section {
                    Button {
                        Haptics.tap()
                        addingExercise = true
                    } label: {
                        Label(String(localized: "watch.workout.addExercise", defaultValue: "Add Exercise"), systemImage: "plus")
                    }
                    .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                }

                // Finishing lives here rather than on the set screen: this is
                // the workout's overview, and an end-everything button one tap
                // from the tick that logs a set is a mis-tap waiting to happen.
                Section {
                    Button(role: .destructive) {
                        Haptics.tap()
                        confirmingFinish = true
                    } label: {
                        Label(String(localized: "watch.workout.finishWorkout", defaultValue: "Finish Workout"), systemImage: "flag.checkered")
                    }
                    .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                    Button(role: .destructive) {
                        Haptics.tap()
                        confirmingDiscard = true
                    } label: {
                        Label(String(localized: "watch.workout.discardWorkout", defaultValue: "Discard Workout"), systemImage: "trash")
                    }
                    .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                }
            }
            .navigationTitle(store.plan?.workoutName ?? String(localized: "watch.workout.title", defaultValue: "Workout"))
            .navigationBarTitleDisplayMode(.inline)
        }
        .sheet(isPresented: $addingExercise) { AddExerciseSheet() }
        .endWorkoutDialogs(
            confirmingFinish: $confirmingFinish,
            confirmingDiscard: $confirmingDiscard,
            beforeEnding: { dismiss() }
        )
    }
}

private struct ExerciseRow: View {
    let exercise: PlannedExercise

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        let done = store.completedSetCount(for: exercise)
        let isDone = store.isComplete(exercise)
        HStack(spacing: 6) {
            Text(exercise.name)
                .font(.body.weight(.medium))
                .lineLimit(2)
            Spacer(minLength: 0)
            // Sets logged over sets planned: the logged count is the number
            // that changes, so it carries the weight; green once all are in.
            HStack(spacing: 0) {
                Text("\(done)")
                    .fontWeight(.bold)
                    .foregroundStyle(isDone ? Color.green : Color.white)
                Text("/\(exercise.sets.count)")
                    .foregroundStyle(.secondary)
            }
            .font(.body)
            .monospacedDigit()
            .fixedSize()
        }
        .padding(.leading, exercise.supersetRun == nil ? 0 : 8)
        .background(alignment: .leading) {
            if let run = exercise.supersetRun {
                SupersetPalette.color(for: run)
                    .frame(width: 3)
            }
        }
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
                        .foregroundStyle(next.supersetRun.map(SupersetPalette.color(for:)) ?? Color.primary)
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
                    if let target = RestView.target(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit) {
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
                        if let target = RestView.target(for: step, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit) {
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

/// Elapsed time, heart rate and calories on one line over the set, for the
/// wearer who wants them in view while lifting. It sits in the clock's row,
/// where the time sat before, so it costs the set no height.
private struct SetScreenMetricsLine: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    /// The clock's width at the top right, measured on 40 and 46 mm, with a
    /// gap so the calories do not touch its running glyph.
    private static var clockWidth: CGFloat { WatchStyle.s(64) }

    var body: some View {
        // One Text, so a 40 mm screen shrinks the line as a whole rather than
        // cutting off the calories.
        let bpm = store.latestBpm.map { "\(Int($0.rounded()))" } ?? "--"
        let kcal = store.activeEnergyKcal.map { "\(Int($0))" } ?? "--"
        (Text(WorkoutMetricsPage.elapsed(store.elapsedSeconds)).foregroundStyle(.yellow)
            + Text(" ")
            + Text(Image(systemName: "heart.fill")).foregroundStyle(.red)
            + Text("\(bpm) ").foregroundStyle(.red)
            + Text(Image(systemName: "flame.fill")).foregroundStyle(.orange)
            + Text("\(kcal)").foregroundStyle(.orange))
            .font(.footnote.weight(.semibold))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.trailing, Self.clockWidth)
            // Up into the clock's row instead of pushing the set down.
            .padding(.top, -WatchStyle.s(20))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(localized: "watch.workout.metricsLine", defaultValue: "Time \(WorkoutMetricsPage.elapsed(store.elapsedSeconds)), heart rate \(bpm), \(kcal) calories"))
    }
}

/// Time, heart rate and calories, one big reading per line as on Apple's
/// Workout app. A swipe up from the set screen, so the set screen can stay
/// about the set.
struct WorkoutMetricsPage: View {
    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(Self.elapsed(store.elapsedSeconds))
                .font(.system(size: WatchStyle.s(40), weight: .semibold, design: .rounded))
                .foregroundStyle(.yellow)
            reading(
                store.latestBpm.map { "\(Int($0.rounded()))" },
                unit: String(localized: "watch.workout.bpm", defaultValue: "BPM"),
                systemImage: "heart.fill",
                tint: .red
            )
            reading(
                store.activeEnergyKcal.map { "\(Int($0))" },
                unit: String(localized: "watch.workout.kcal", defaultValue: "KCAL"),
                systemImage: "flame.fill",
                tint: .orange
            )
            if !store.steps.isEmpty {
                let done = store.steps.filter(store.isCompleted).count
                Text(String(localized: "watch.workout.setsDone", defaultValue: "\(done) of \(store.steps.count) sets"))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 4)
            }
        }
        .monospacedDigit()
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// A dash until the first sample arrives, so the layout does not jump.
    private func reading(_ value: String?, unit: String, systemImage: String, tint: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
            Text(value ?? "--")
                .font(.system(size: WatchStyle.s(32), weight: .semibold, design: .rounded))
            Text(unit)
                .font(.footnote.weight(.semibold))
            Image(systemName: systemImage)
                .font(.footnote)
        }
        .foregroundStyle(tint)
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
        return SupersetPalette.color(for: run)
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
        VStack(spacing: 4) {
            ExerciseTitle(
                name: step.exerciseName,
                supersetColor: supersetColor,
                supersetWith: step.supersetWith,
                action: onOpenList
            )
            SetProgressRow(step: step) { setId in
                endCrownEditing()
                store.goToStep(setId: setId)
            }

            let values = store.values(for: step)
            let holdSeconds = store.targetDurationSec(for: step)
            let timed = store.isTimed(step)
            HStack(spacing: 4) {
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

            // Previous and next set either side of a still-wide Done: the dots
            // jump within this exercise, these also cross into the next one.
            HStack(spacing: 6) {
                SquircleButton(systemImage: "chevron.left") {
                    endCrownEditing()
                    store.goToPreviousStep()
                }
                .frame(width: WatchStyle.s(40))
                .disabled(store.currentStepIndex == 0)
                .accessibilityLabel(String(localized: "watch.workout.previousSet", defaultValue: "Previous set"))
                DoneButton(isCompleted: store.isCompleted(step)) {
                    endCrownEditing()
                    if store.uncompleteStep(step) {
                        session.sendSetUncompleted(step)
                    }
                } onComplete: {
                    // The value on screen is what gets logged, settled or not.
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
                SquircleButton(systemImage: "chevron.right") {
                    endCrownEditing()
                    store.goToNextStep()
                }
                .frame(width: WatchStyle.s(40))
                .disabled(store.currentStepIndex >= store.steps.count - 1)
                .accessibilityLabel(String(localized: "watch.workout.nextSet", defaultValue: "Next set"))
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

    private func valueBox(_ field: EditableField) -> some View {
        let isSelected = crownField == field
        let shown = isSelected && crownAdjusted
            ? editedValue(for: field)
            : storedValue(for: field)
        let text = field == .weight && store.isBodyweight(step)
            ? Self.bodyweightText(shown)
            : Self.format(shown)
        return ValueBox(
            value: text,
            unit: title(for: field),
            isSelected: isSelected
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

    /// A bodyweight set's weight as a change to body weight: "BW +10",
    /// "BW −20", or plain "BW" when nothing is added or taken off.
    private static func bodyweightText(_ value: Double?) -> String {
        guard let value, value != 0 else { return "BW" }
        let magnitude = format(abs(value))
        return value > 0 ? "BW +\(magnitude)" : "BW −\(magnitude)"
    }

    /// Whole numbers lose the decimal point — "60kg", not "60.0kg" — but a
    /// real fraction keeps it, since plate maths routinely lands on 2.5s.
    static func format(_ value: Double?) -> String {
        guard let value else { return "–" }
        return value == value.rounded()
            ? String(Int(value))
            : String(format: "%.1f", value)
    }
}

/// Start and Stop on the timer cards: a small solid pill that matches the
/// squircles around it. Big enough to hit, and quieter than a bordered button.
private struct HoldPill: View {
    let title: String
    let tint: Color
    /// Whether the watch's double-tap gesture presses this button.
    var doubleTap = false
    let action: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            Text(title)
                .font(.body.weight(.semibold))
                .foregroundStyle(Color.black)
                .lineLimit(1)
                .fixedSize()
                .padding(.horizontal, WatchStyle.s(12))
                .padding(.vertical, 6)
                .background(tint, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .doubleTapGesture(enabled: doubleTap)
    }
}

/// Hold countdown for a duration set. Tap starts it; at 0:00 it buzzes
/// through the same rest-finished hook. `TimelineView` rather than a stored
/// timer publisher: the store republishes every second and would freeze a
/// `Timer.publish` the way the rest screen used to.
private struct HoldCountdown: View {
    let setId: String
    let totalSeconds: Int

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let started = store.holdSetId == setId && store.holdEndsAt != nil
            let remaining = started
                ? (store.holdRemaining(for: setId, now: context.date) ?? 0)
                : totalSeconds
            VStack(spacing: 2) {
                Text(Self.clock(remaining))
                    .font(.system(size: WatchStyle.s(30), weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if !started {
                    HoldPill(title: String(localized: "watch.workout.holdStart", defaultValue: "Start"), tint: .green) {
                        store.startHold(for: setId, seconds: totalSeconds)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WatchStyle.s(8))
            .background(WatchStyle.fill, in: WatchStyle.shape)
        }
    }

    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}

/// Count-up timer for a duration set with no planned length. Start begins it;
/// ticking the set logs the elapsed seconds. Double-tap stops a running one.
private struct HoldStopwatch: View {
    let setId: String

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.workoutPageActive) private var workoutPageActive

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let elapsed = store.stopwatchElapsed(for: setId, now: context.date)
            // Shorter than the other set cards: with the "Last" line it was
            // tall enough to push the page up under the clock.
            VStack(spacing: 1) {
                Text(Self.clock(elapsed ?? 0))
                    .font(.system(size: WatchStyle.s(26), weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                if elapsed == nil {
                    if let previous = store.previousDurationSec(forSetId: setId) {
                        Text(String(localized: "watch.workout.last", defaultValue: "Last \(Self.clock(previous))"))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    HoldPill(title: String(localized: "watch.workout.holdStart", defaultValue: "Start"), tint: .green) {
                        store.startStopwatch(for: setId)
                    }
                } else if store.isStopwatchRunning(for: setId) {
                    // While the stopwatch runs the double-tap stops it; the
                    // set's tick takes the gesture back once it has stopped.
                    HoldPill(
                        title: String(localized: "watch.workout.holdStop", defaultValue: "Stop"),
                        tint: .red,
                        doubleTap: workoutPageActive
                            && checkIn.context.effectiveDoubleTapEnabled
                    ) {
                        store.stopStopwatch(for: setId)
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, WatchStyle.s(6))
            .background(WatchStyle.fill, in: WatchStyle.shape)
        }
    }

    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }
}

/// One big tappable number with its unit underneath. Outlined while the crown
/// is adjusting it.
struct ValueBox: View {
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
            // The card being adjusted by the crown or a drag.
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

/// The set's one main action, full width at the bottom where a thumb lands:
/// Done in white, or once the set is logged, Undo in orange, so a second tap
/// does not read as logging it again.
private struct DoneButton: View {
    let isCompleted: Bool
    let onUncomplete: () -> Void
    let onComplete: () -> Void

    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var checkIn: CheckInStore
    @Environment(\.workoutPageActive) private var workoutPageActive

    /// The current set's stopwatch is counting. Its Stop button holds the
    /// double-tap while it is.
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
            Label(
                isCompleted
                    ? String(localized: "watch.workout.undo", defaultValue: "Undo")
                    : String(localized: "watch.workout.logSet", defaultValue: "Done"),
                systemImage: isCompleted ? "arrow.uturn.backward" : "checkmark"
            )
            .font(.headline)
            // Spelled `Color.x` rather than `.x`: the parameter is an opaque
            // `some ShapeStyle`, which gives a ternary's two branches nothing
            // to infer a shared type from.
            .foregroundStyle(isCompleted ? Color.orange : Color.black)
            .frame(maxWidth: .infinity)
            .frame(height: WatchStyle.s(44))
            .background(
                isCompleted ? Color.orange.opacity(0.2) : Color.white,
                in: WatchStyle.shape
            )
            .contentShape(WatchStyle.shape)
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

/// The exercise's name, one scrolling line, with a chevron: tapping it opens the
/// exercise list, where the other exercises, Add Exercise and Finish are. A
/// superset member wears its superset's colour as a bar beside the name.
private struct ExerciseTitle: View {
    let name: String
    let supersetColor: Color?
    let supersetWith: String?
    let action: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            HStack(alignment: .center, spacing: 6) {
                if let supersetColor {
                    Capsule()
                        .fill(supersetColor)
                        .frame(width: 4)
                }
                VStack(alignment: .leading, spacing: 0) {
                    // One line that scrolls when the name is long, so it is
                    // never cut off and a 40 mm screen keeps room for the
                    // buttons; the effort picker's title does the same.
                    MarqueeText(text: name)
                        .font(.headline)
                    // Who this set alternates with: the bar's colour alone
                    // does not say.
                    if let supersetWith {
                        Text(String(localized: "watch.workout.superset", defaultValue: "Superset · \(supersetWith)"))
                            .font(.footnote)
                            .foregroundStyle(supersetColor ?? Color.secondary)
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "list.bullet")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(supersetWith.map {
            String(localized: "watch.workout.supersetWith", defaultValue: "\(name), superset with \($0)")
        } ?? name)
        .accessibilityHint(String(localized: "watch.workout.showExercises", defaultValue: "Shows all exercises"))
    }
}

/// "Set 2 of 3" and one dot per set of this exercise: filled once logged,
/// ringed for the one on screen, orange for a warm-up. A tap on a dot moves to
/// that set, which is how to go back to one or skip ahead.
private struct SetProgressRow: View {
    let step: WorkoutStep
    let onSelect: (String) -> Void

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        let sets = store.steps.filter { $0.exerciseEntryId == step.exerciseEntryId }
        HStack(spacing: 0) {
            Text(Self.title(for: step))
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Self.isWarmup(step) ? Color.orange : Color.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .layoutPriority(1)
            Spacer(minLength: 4)
            // More dots than fit read as noise; the title still counts them.
            if sets.count <= 8 {
                ForEach(sets) { set in
                    Button {
                        guard set.id != step.id else { return }
                        Haptics.tap()
                        onSelect(set.id)
                    } label: {
                        dot(for: set)
                            // A finger-sized target around a small dot.
                            .frame(width: WatchStyle.s(16), height: WatchStyle.s(28))
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(Self.title(for: set))
                }
            }
        }
    }

    private func dot(for set: WorkoutStep) -> some View {
        let color = Self.isWarmup(set) ? Color.orange : Color.white
        let size = WatchStyle.s(8)
        return ZStack {
            if store.isCompleted(set) {
                Circle().fill(color)
            } else {
                Circle().fill(color.opacity(0.25))
            }
            if set.id == step.id {
                Circle().strokeBorder(color, lineWidth: 2).padding(-3)
            }
        }
        .frame(width: size, height: size)
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

    /// `TimelineView`, not a stored `Timer.publish`: the store republishes
    /// every second, re-creating this struct and its publisher before it can
    /// fire, which left the countdown frozen at its starting value.
    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            content(now: context.date)
        }
    }

    private func content(now: Date) -> some View {
        VStack(spacing: WatchStyle.s(6)) {
            // A ring that empties as the rest runs down, with the time left in
            // it and the heart rate coming down under that.
            ZStack {
                Circle()
                    .stroke(Color.blue.opacity(0.25), lineWidth: WatchStyle.s(8))
                Circle()
                    .trim(from: 0, to: CGFloat(1 - progress(now: now)))
                    .stroke(Color.blue, style: StrokeStyle(lineWidth: WatchStyle.s(8), lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: 0) {
                    Text(store.restPausedRemaining != nil
                         ? String(localized: "watch.run.paused", defaultValue: "Paused")
                         : String(localized: "watch.workout.rest", defaultValue: "Rest"))
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(store.restPausedRemaining != nil ? Color.orange : Color.secondary)
                    Text(remainingLabel(now: now))
                        .font(.system(size: WatchStyle.s(34), weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    // Not when the metrics line above already shows it.
                    if let bpm = store.latestBpm, !checkIn.context.effectiveSetScreenMetrics {
                        Label("\(Int(bpm.rounded()))", systemImage: "heart.fill")
                            .font(.footnote.weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(.red)
                    }
                }
                .padding(WatchStyle.s(10))
            }
            .frame(width: WatchStyle.s(108), height: WatchStyle.s(108))

            // Back 15 s, skip the rest, forward 15 s: three equal squircles.
            HStack(spacing: 6) {
                SquircleButton(systemImage: "gobackward.15", height: 36) {
                    store.adjustRest(bySeconds: -15)
                }
                SquircleButton(systemImage: "forward.fill", height: 36) {
                    store.skipRest()
                }
                SquircleButton(systemImage: "goforward.15", height: 36) {
                    store.adjustRest(bySeconds: 15)
                }
            }
            // Paused on the phone: it owns the rest until it resumes.
            .disabled(store.restPausedRemaining != nil)

            if let next = store.currentStep {
                Button(action: Haptics.tapping(onOpenList)) {
                    VStack(spacing: 0) {
                        Text(next.exerciseName)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(nextSupersetColor(next) ?? Color.primary)
                            .lineLimit(1)
                        Text(Self.targetLabel(for: next, store: store, unit: checkIn.context.effectiveWeightUnit, carry: checkIn.context.effectiveCarryUnit))
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "watch.workout.upNext", defaultValue: "Up next: \(next.exerciseName)"))
            }
        }
    }

    private func remainingSeconds(now: Date) -> Int {
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
        return SupersetPalette.color(for: run)
    }

    /// "Set 1 of 3 · 40kg × 10", what a set is aiming for.
    static func targetLabel(for step: WorkoutStep, store: WorkoutSessionStore, unit: WeightUnit, carry: CarryUnit) -> String {
        let label = SetProgressRow.title(for: step)
        guard let target = target(for: step, store: store, unit: unit, carry: carry) else { return label }
        return "\(label) · \(target)"
    }

    /// "40kg × 10" alone; nil when the set has no values yet.
    static func target(for step: WorkoutStep, store: WorkoutSessionStore, unit: WeightUnit, carry: CarryUnit) -> String? {
        let values = store.values(for: step)
        let weight = values.weightKg.map { "\(Self.weightText($0, unit: unit))\(unit.suffix)" }
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

    private static func weightText(_ kg: Double, unit: WeightUnit) -> String {
        let shown = unit.fromKg(kg)
        return shown == shown.rounded()
            ? String(Int(shown))
            : String(format: "%.1f", shown)
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
            parts.append("\(CurrentSetView.format(unit.fromKg(kg))) \(unit.suffix)")
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

/// Effort picked after a set: the set it is for, one big value card the Digital
/// Crown changes through the scale, what that value means in reps left, and
/// Skip / Save. Same flat dark squircles as the set screens. `onDone(nil)` skips.
private struct RpePickerView: View {
    let title: String
    let summary: String
    let hapticsEnabled: Bool
    let onDone: (Double?) -> Void

    /// Whole numbers from 1 through 6, then half steps through 10.
    private static let values: [Double] = [
        1, 2, 3, 4, 5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10,
    ]

    private static let fill = Color(white: 0.14)
    private static let shape = RoundedRectangle(cornerRadius: 20, style: .continuous)

    /// Crown position in `values`, as a Double because that is what the crown
    /// binds to. Starts on 8, the middle of what most working sets are.
    @State private var position: Double = Double(
        RpePickerView.values.firstIndex(of: 8) ?? 0
    )
    @FocusState private var focused: Bool

    private var index: Int {
        min(max(Int(position.rounded()), 0), Self.values.count - 1)
    }

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

    var body: some View {
        VStack(spacing: 3) {
            VStack(alignment: .leading, spacing: 0) {
                MarqueeText(text: title)
                    .font(.headline)
                Text(summary)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            // Room for the system clock, which sits over the top right.
            .padding(.trailing, 52)
            .frame(maxWidth: .infinity, alignment: .leading)

            // The card the crown is adjusting, so it wears the white border the
            // set screen's selected value card does.
            VStack(spacing: 0) {
                Text(valueText)
                    .font(.system(size: 34, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .lineLimit(1)
                Text(String(localized: "watch.rpe.label", defaultValue: "RPE"))
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .background(Self.fill, in: Self.shape)
            .overlay(Self.shape.stroke(Color.white, lineWidth: 2))

            Text(meaning)
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity, minHeight: 26)

            HStack(spacing: 4) {
                Button { onDone(nil) } label: {
                    Text(String(localized: "watch.rpe.skip", defaultValue: "Skip"))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(Self.fill, in: Self.shape)
                        .contentShape(Self.shape)
                }
                .buttonStyle(.plain)
                Button { onDone(value) } label: {
                    Text(String(localized: "watch.rpe.save", defaultValue: "Save"))
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(Color.black)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(Color.white, in: Self.shape)
                        .contentShape(Self.shape)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 4)
        .padding(.bottom, 4)
        .focusable()
        .focused($focused)
        .digitalCrownRotation(
            $position,
            from: 0,
            through: Double(Self.values.count - 1),
            by: 1,
            sensitivity: .low,
            isContinuous: false,
            isHapticFeedbackEnabled: hapticsEnabled
        )
        .onAppear { focused = true }
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
    ExerciseListView { _ in }
        .environmentObject(previewStore(completedSets: 1))
        .environmentObject(WatchSessionManager.shared)
}
#endif


private extension View {
    /// One full screen tall, with the content kept inside the safe area, so
    /// it sits where a plain page would.
    func workoutPage(_ geo: GeometryProxy, alignment: Alignment = .center) -> some View {
        self
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: alignment)
            .padding(.top, geo.safeAreaInsets.top)
            .padding(.bottom, geo.safeAreaInsets.bottom)
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
