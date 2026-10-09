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
            Label("New PR!", systemImage: "trophy.fill")
                .font(.caption.weight(.bold))
            if !exercise.isEmpty {
                Text(exercise).font(.caption2).lineLimit(1)
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
                Label("Workout done", systemImage: "checkmark.circle.fill")
                    .font(.headline)
                    .foregroundStyle(.green)
                row("Time", duration)
                row("Sets", "\(summary.setsCompleted)")
                if summary.volumeKg > 0 {
                    row("Volume", "\(Int(unit.fromKg(summary.volumeKg).rounded())) \(unit.suffix)")
                }
                if let avg = summary.averageBpm {
                    row("Avg HR", "\(Int(avg.rounded())) bpm")
                }
                if let max = summary.maxBpm {
                    row("Max HR", "\(Int(max.rounded())) bpm")
                }
                if let kcal = summary.activeEnergyKcal, kcal > 0 {
                    row("Active", "\(Int(kcal.rounded())) kcal")
                }
                Button("Done") { store.dismissSummary() }
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
            Text(title).font(.caption).foregroundStyle(.secondary)
            Spacer()
            Text(value).font(.caption.weight(.semibold)).monospacedDigit()
        }
    }
}

private struct WaitingForWorkoutView: View {
    @EnvironmentObject private var checkIn: CheckInStore
    @EnvironmentObject private var session: WatchSessionManager
    /// The preset just tapped. Blocks a second tap from starting two
    /// sessions before the first one arrives. Cleared after a few seconds
    /// so a start the phone could not finish can be tried again.
    @State private var startingId: String?

    var body: some View {
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
                Text("Start a workout on your phone")
                    .font(.caption)
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
                                .font(.system(size: WatchStyle.s(16), weight: .semibold))
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
                Text(workout.planName.isEmpty
                    ? workout.caption
                    : "\(workout.planName) • \(workout.caption)")
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .font(.system(size: WatchStyle.s(11), weight: .semibold))
            .foregroundStyle(blue)
            HStack(spacing: 8) {
                Text(startingId == workout.presetId ? "Starting…" : workout.name)
                    .font(.system(size: WatchStyle.s(16), weight: .semibold))
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
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.yellow)
                    .monospacedDigit()
            }
        }
    }
}

private struct ActiveWorkoutView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    @State private var showingExercises = false

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
        VStack(spacing: 4) {
            MetricsStrip(onBack: openExerciseList)
            if let format = store.plan?.workoutFormat?.lowercased(), format != "standard" {
                IntervalCaptionView(plan: store.plan)
            }

            if store.isResting {
                RestView()
            } else if let step = store.currentStep {
                CurrentSetView(step: step)
            } else {
                WorkoutCompleteView()
            }
        }
        .padding(.horizontal, 4)
        // Asked when Finish is tapped on a workout that changed from the saved
        // one it started from, as Hevy does. Only buttons close it.
        .alert(
            "Update Workout?",
            isPresented: Binding(
                get: { store.askingPresetUpdate },
                set: { _ in }
            )
        ) {
            Button("Update") { finish(updatingPreset: true) }
            Button("Keep Original", role: .cancel) { finish(updatingPreset: false) }
        } message: {
            Text("Save the changes you made to \"\(store.plan?.workoutName ?? "")\"?")
        }
        .sheet(isPresented: $showingExercises) {
            ExerciseListView { exerciseEntryId in
                store.jumpToExercise(exerciseEntryId)
            }
        }
        .onAppear {
            #if DEBUG
            if ScreenshotSeed.opensExerciseList {
                showingExercises = true
            }
            if ScreenshotSeed.opensPresetUpdate {
                store.askingPresetUpdate = true
            }
            #endif
        }
    }
}

/// Shown after the last set is logged. Finish used to live only in the
/// exercise-picker sheet, which was easy to miss.
private struct WorkoutCompleteView: View {
    @EnvironmentObject private var store: WorkoutSessionStore
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        VStack(spacing: 8) {
            Spacer()
            Text("Workout complete")
                .font(.headline)
            Button("Finish") {
                Haptics.tap()
                if !store.askPresetUpdateBeforeFinish() { session.endWorkout() }
            }
            .font(.caption)
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
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.dismiss) private var dismiss

    @State private var confirmingFinish = false
    @State private var confirmingDiscard = false

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
                        header: "Superset",
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

                // Finishing lives here rather than on the set screen: this is
                // the workout's overview, and an end-everything button one tap
                // from the tick that logs a set is a mis-tap waiting to happen.
                Section {
                    Button(role: .destructive) {
                        Haptics.tap()
                        confirmingFinish = true
                    } label: {
                        Label("Finish Workout", systemImage: "flag.checkered")
                            .font(.caption)
                    }
                    .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                    Button(role: .destructive) {
                        Haptics.tap()
                        confirmingDiscard = true
                    } label: {
                        Label("Discard Workout", systemImage: "trash")
                            .font(.caption)
                    }
                    .listRowBackground(WatchStyle.shape.fill(WatchStyle.fill))
                }
            }
            .navigationTitle(store.plan?.workoutName ?? "Workout")
            .navigationBarTitleDisplayMode(.inline)
        }
        .confirmationDialog(
            "Finish workout?",
            isPresented: $confirmingFinish,
            titleVisibility: .visible
        ) {
            Button("Finish", role: .destructive) {
                Haptics.tap()
                // Dismissed first so the sheet is not re-rendering against a
                // plan that `endWorkout` has already cleared.
                dismiss()
                if !store.askPresetUpdateBeforeFinish() { session.endWorkout() }
            }
            Button("Cancel", role: .cancel) { Haptics.tap() }
        } message: {
            Text("Heart rate for this session is sent to your phone.")
        }
        .confirmationDialog(
            "Discard workout?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard", role: .destructive) {
                Haptics.tap()
                dismiss()
                session.discardWorkout()
            }
            Button("Cancel", role: .cancel) { Haptics.tap() }
        } message: {
            Text("This workout won't be saved.")
        }
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
                .font(.system(size: 15, weight: .medium))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
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
            .font(.system(size: 15))
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
private enum WatchStyle {
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

private struct SquircleButton: View {
    let systemImage: String
    var prominent = false
    /// A round button for the header.
    var circular = false
    let action: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(action)) {
            SquircleLabel(systemImage: systemImage, prominent: prominent, circular: circular)
        }
        .buttonStyle(.plain)
    }
}

private struct SquircleLabel: View {
    let systemImage: String
    let prominent: Bool
    let circular: Bool

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let shape = RoundedRectangle(
            cornerRadius: circular ? WatchStyle.s(14) : WatchStyle.corner,
            style: .continuous
        )
        Image(systemName: systemImage)
            .font(.system(size: WatchStyle.s(circular ? 14 : 20), weight: .semibold))
            .foregroundStyle(prominent ? Color.black : Color.white.opacity(0.6))
            .frame(maxWidth: circular ? WatchStyle.s(28) : CGFloat.infinity)
            .frame(height: WatchStyle.s(circular ? 28 : 44))
            .background(prominent ? Color.white : WatchStyle.fill, in: shape)
            .opacity(isEnabled ? 1 : 0.35)
            // The whole box takes the tap, not only the glyph's pixels.
            .contentShape(shape)
    }
}

/// Calories, elapsed time and heart rate on one line, always visible. Kept
/// deliberately small: it is reference information, not the thing being
/// interacted with, and the set values below need the room.
private struct MetricsStrip: View {
    /// Non-nil puts a back chevron at the leading edge, opening the exercise
    /// picker. Inline here rather than on its own row above: a watch screen
    /// cannot spare a whole row for one control.
    var onBack: (() -> Void)?

    @EnvironmentObject private var store: WorkoutSessionStore

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            // The clock reads first, small and quiet; heart rate and calories
            // sit under it so the two readings share a line.
            VStack(alignment: .leading, spacing: 0) {
                Text(Self.elapsed(store.elapsedSeconds))
                    .font(.system(.callout, design: .rounded).weight(.semibold))
                    .foregroundStyle(.secondary)
                    .minimumScaleFactor(0.7)
                HStack(spacing: 4) {
                    if let bpm = store.latestBpm {
                        // Never truncated: a three-digit rate used to lose
                        // its last digits to the readings beside it.
                        Self.metric("\(Int(bpm.rounded()))", systemImage: "heart.fill")
                            .foregroundStyle(.red)
                            .fixedSize()
                            .layoutPriority(1)
                    }
                    if let kcal = store.activeEnergyKcal {
                        Self.metric("\(Int(kcal))", systemImage: "flame.fill")
                            .foregroundStyle(.orange)
                            .fixedSize()
                    }
                }
                .font(.caption2)
            }
            // Takes every point the button leaves. Sized to its contents it
            // was measured before the calorie reading arrived and clipped it,
            // even at one digit.
            .frame(maxWidth: .infinity, alignment: .leading)
            // Opens the exercise list, so it wears the list icon.
            if let onBack = onBack {
                SquircleButton(systemImage: "list.bullet", circular: true, action: onBack)
                    // The system clock sits over the top right of the screen.
                    // Drawn lower than the strip's own row so the button
                    // clears it; an offset leaves the layout untouched.
                    .offset(y: WatchStyle.s(12))
            }
        }
        .monospacedDigit()
        .lineLimit(1)
    }

    /// Icon and value with a tighter gap than `Label`'s, which is sized for
    /// list rows and left too little room on this strip.
    private static func metric(_ value: String, systemImage: String) -> some View {
        HStack(spacing: 2) {
            Image(systemName: systemImage)
            // Shrinks rather than truncates: the list button takes a slice of
            // this strip, and a three-digit calorie count lost its last digit.
            Text(value)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
    }

    private static func elapsed(_ seconds: Int) -> String {
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
            VStack(alignment: .leading, spacing: 0) {
                Text(step.exerciseName)
                    .font(.headline)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let partners = step.supersetWith {
                    Text("Superset · \(partners)")
                        .font(.system(size: 9))
                        .foregroundStyle(supersetColor ?? Color.secondary)
                        .lineLimit(1)
                }
                Text(step.label)
                    .font(.caption2)
                    .foregroundStyle(.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

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
                Text("Crown or drag · tap again to type")
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
            }

            StepControls(isCompleted: store.isCompleted(step)) {
                endCrownEditing()
                store.goToPreviousStep()
            } onComplete: {
                // The value on screen is what gets logged, settled or not.
                endCrownEditing()
                if let completed = store.completeCurrentSet() {
                    session.sendSetCompleted(completed, values: store.values(for: completed))
                }
            } onNext: {
                endCrownEditing()
                store.goToNextStep()
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
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.black)
                .padding(.horizontal, 18)
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
                    HoldPill(title: "Start", tint: .green) {
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
                        Text("Last \(Self.clock(previous))")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    HoldPill(title: "Start", tint: .green) {
                        store.startStopwatch(for: setId)
                    }
                } else if store.isStopwatchRunning(for: setId) {
                    // While the stopwatch runs the double-tap stops it; the
                    // set's tick takes the gesture back once it has stopped.
                    HoldPill(
                        title: "Stop",
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
private struct ValueBox: View {
    let value: String
    let unit: String
    var isSelected = false
    let onTap: () -> Void

    var body: some View {
        Button(action: Haptics.tapping(onTap)) {
            VStack(spacing: 0) {
                Text(value)
                    .font(.system(size: WatchStyle.s(34), weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text(unit)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
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

/// Previous / complete / next. The tick is the primary action and sits in the
/// middle where a thumb lands; it turns filled once the set is logged so a
/// second tap reads as already-done rather than inviting a double entry.
private struct StepControls: View {
    let isCompleted: Bool
    let onPrevious: () -> Void
    let onComplete: () -> Void
    let onNext: () -> Void

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
        HStack(spacing: 8) {
            SquircleButton(systemImage: "chevron.left", action: onPrevious)
                .disabled(store.currentStepIndex == 0)
            SquircleButton(systemImage: "chevron.right", action: onNext)
                .disabled(store.currentStepIndex >= store.steps.count - 1)
            // The main action, white like the rest of the controls are not.
            // Once the set is logged it turns into a green tick so a second
            // tap reads as already done rather than inviting a double entry.
            Button {
                Haptics.setLogged()
                onComplete()
            } label: {
                Image(systemName: isCompleted ? "checkmark.circle.fill" : "checkmark")
                    .font(.system(size: WatchStyle.s(20), weight: .semibold))
                    // Spelled `Color.x` rather than `.x`: the parameter is an
                    // opaque `some ShapeStyle`, which gives a ternary's two
                    // branches nothing to infer a shared type from.
                    .foregroundStyle(isCompleted ? Color.green : Color.black)
                    .frame(maxWidth: .infinity)
                    .frame(height: WatchStyle.s(44))
                    .background(
                        isCompleted ? Color.green.opacity(0.2) : Color.white,
                        in: WatchStyle.shape
                    )
                    .contentShape(WatchStyle.shape)
            }
            .buttonStyle(.plain)
            .disabled(isCompleted)
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
}

/// Rest between sets: how long is left, how far through it is, and what is
/// coming — so the wearer can set up for the next set without paging back.
private struct RestView: View {
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
        VStack(spacing: 6) {
            VStack(spacing: 0) {
                if store.restPausedRemaining != nil {
                    Text("Paused")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                Text(remainingLabel(now: now))
                    .font(.system(size: WatchStyle.s(44), weight: .bold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }

            // A thin track that fills as the rest runs down; the timer above
            // is what to read, so this stays quiet.
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.12))
                    Capsule()
                        .fill(Color.blue)
                        .frame(width: geometry.size.width * CGFloat(progress(now: now)))
                }
            }
            .frame(height: 4)

            // Back 15 s, skip the rest, forward 15 s: three equal squircles.
            HStack(spacing: 8) {
                SquircleButton(systemImage: "gobackward.15") {
                    store.adjustRest(bySeconds: -15)
                }
                SquircleButton(systemImage: "forward.fill") {
                    store.skipRest()
                }
                SquircleButton(systemImage: "goforward.15") {
                    store.adjustRest(bySeconds: 15)
                }
            }
            // Paused on the phone: it owns the rest until it resumes.
            .disabled(store.restPausedRemaining != nil)

            if let next = store.currentStep {
                VStack(spacing: 0) {
                    Text(continuesSuperset(next) ? "Next in superset" : "Next set")
                        .font(.system(size: 9))
                        .foregroundStyle(nextSupersetColor(next) ?? Color.secondary)
                    Text(next.exerciseName)
                        .font(.footnote.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                    Text(nextTargetLabel(for: next))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
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

    private func nextTargetLabel(for step: WorkoutStep) -> String {
        let values = store.values(for: step)
        let unit = checkIn.context.effectiveWeightUnit
        if let seconds = store.targetDurationSec(for: step) {
            let clock = String(format: "%d:%02d", seconds / 60, seconds % 60)
            if let weight = values.weightKg {
                return "\(step.label) · \(Self.weightText(weight, unit: unit))\(unit.suffix) × \(clock)"
            }
            return "\(step.label) · \(clock)"
        }
        if store.isCarry(step), let km = values.distanceKm {
            let carry = checkIn.context.effectiveCarryUnit
            let distance = Int(carry.fromKm(km).rounded())
            if let weight = values.weightKg {
                return "\(step.label) · \(Self.weightText(weight, unit: unit))\(unit.suffix) × \(distance) \(carry.suffix)"
            }
            return "\(step.label) · \(distance) \(carry.suffix)"
        }
        switch (values.weightKg, values.reps) {
        case let (weight?, reps?):
            return "\(step.label) · \(Self.weightText(weight, unit: unit))\(unit.suffix) × \(Int(reps))"
        case let (nil, reps?):
            return "\(step.label) · \(Int(reps)) reps"
        default:
            return step.label
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
private struct NumericKeypadView: View {
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
                    .font(.system(size: 9))
                    .foregroundStyle(.secondary)
                if allowsNegative {
                    Button("±", action: Haptics.tapping(toggleSign))
                        .font(.caption)
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

            Button("OK") {
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
            .font(.caption)
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
