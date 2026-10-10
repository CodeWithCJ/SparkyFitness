import Foundation
import Combine

/// In-memory state for the workout currently shown on the Workout tab.
///
/// Walks a flat sequence of sets rather than a list of exercises: the wearer
/// sees one set at a time and pages through them, so the cursor is a position
/// in `steps`. That mirrors the phone's own `buildStepsFromSession`, which is
/// what keeps the two sides describing the same position.
///
/// Persisted across jetsam: watchOS keeps an `HKWorkoutSession` alive after
/// memory-pressure kills, but our delegates and this store die with the
/// process. Without a snapshot the Workout tab would relaunch empty against
/// a still-running HK session, and every buffered sample would have no
/// exercise to tag. Sets still queue through WatchConnectivity; this snapshot
/// is what lets the wearer keep going on the same plan after the relaunch.
@MainActor
final class WorkoutSessionStore: ObservableObject {
    static let shared = WorkoutSessionStore()

    @Published private(set) var plan: ActiveWorkoutPlan?
    /// Every set of every exercise, in the order they are meant to be done.
    @Published private(set) var steps: [WorkoutStep] = []
    @Published private(set) var currentStepIndex: Int = 0
    @Published private(set) var completedSetIds: Set<String> = []
    /// Edited weight/reps by set id. A set with no entry here is still on its
    /// planned targets.
    @Published private(set) var editedValues: [String: SetValues] = [:]
    /// Targets the phone resolved after the plan was armed (history loaded,
    /// progression bump applied), by set id. Sits between `editedValues` and
    /// the plan's own targets.
    @Published private(set) var targetOverrides: [String: SetValues] = [:]
    /// Weight and reps as they stood when the set was logged, by set id.
    /// A later phone target must not change the summary's volume.
    private var loggedValues: [String: SetValues] = [:]
    /// Revision of `targetOverrides`, so an older queued update is ignored.
    private var targetRevision: Double = 0
    /// Revision of the last plan update from the phone (see `updatePlan`), so
    /// a duplicate or older one is ignored.
    private var planRevision: Double = 0
    /// Phone completions whose set was not in `steps` yet. A target snapshot
    /// can arrive before the plan update that adds the set; `updatePlan`
    /// folds these in. Replaced by each newer snapshot, so a set the phone
    /// has since dropped is not completed later.
    private var pendingUnknownCompletions: Set<String> = []
    /// The phone's rest as last taken from it, so an update that repeats it
    /// leaves a rest adjusted here alone. See `applyTargets`. Not in the
    /// snapshot: the rest itself is not either, so after a relaunch the next
    /// update has to be free to bring the phone's back.
    private var lastPhoneRest: PhoneRest?
    @Published private(set) var latestBpm: Double?
    @Published private(set) var activeEnergyKcal: Double?
    @Published private(set) var elapsedSeconds: Int = 0
    /// What the wearer just finished, shown on the Workout page until they
    /// dismiss it or arm another workout. Not persisted: it is a keepsake of
    /// the moment, not session state.
    @Published private(set) var lastSummary: WorkoutSummary?
    /// What the plan looked like when the workout started, to tell whether
    /// the exercises or sets have changed since. Persisted with the snapshot
    /// so a restored workout is still compared to the plan it started as.
    private var baselineStructure: [String]?
    /// Set when Finish is tapped on a workout that changed from its saved
    /// workout; the workout screen asks whether to update it before ending.
    @Published var askingPresetUpdate = false
    private var heartRateSum: Double = 0
    private var heartRateCount: Int = 0
    private var heartRateMax: Double?
    /// Measurement seconds already folded into the totals above. The final
    /// drain repeats readings the live callback already saw; a second counts
    /// once. Persisted so a relaunch does not count them again.
    private var countedHeartRateSeconds: Set<Int> = []
    /// Non-nil while a rest countdown is running before the next set.
    @Published private(set) var restEndsAt: Date?
    /// The rest's full length, so the progress bar has a denominator.
    @Published private(set) var restDurationSeconds: Int = 0
    /// Time left on a rest the phone has paused, frozen until the phone
    /// resumes or ends it. Nil while the rest counts down (or there is none).
    @Published private(set) var restPausedRemaining: TimeInterval?

    /// The set whose hold countdown is running, if one was started.
    @Published private(set) var holdSetId: String?
    /// When that hold reaches 0:00. Kept after it finishes so the logged
    /// seconds can still be read.
    @Published private(set) var holdEndsAt: Date?
    @Published private(set) var holdTotalSeconds: Int = 0
    /// Set instead of `holdEndsAt` when a timed set has no planned length and
    /// counts up. `holdStoppedAt` freezes it once the set is logged.
    @Published private(set) var holdStartedAt: Date?
    private(set) var holdStoppedAt: Date?

    /// Called with the outgoing exercise's entry id just before the cursor
    /// moves onto a set belonging to a different exercise, so the session
    /// manager can send the heart rate and energy collected so far tagged
    /// with the exercise they were actually measured during. Not called by
    /// `start`, `reset` or `restoreSnapshot`, which place the cursor rather
    /// than move it, nor when the last set completes — the final drain
    /// already belongs to the last exercise.
    var onExerciseWillChange: ((String) -> Void)?
    /// The wearer skipped (`endsAt` nil) or moved the rest here, so the phone
    /// can do the same. Not fired when the rest follows the phone's.
    var onRestChangedHere: ((_ previousEndsAt: Date, _ endsAt: Date?) -> Void)?
    /// A hold countdown or stopwatch was started on the watch (not copied from
    /// the phone), so the phone can start its own from the same moment.
    var onSetTimerStartedHere: ((_ setId: String, _ startedAt: Date) -> Void)?
    /// Called when the wearer stops a stopwatch here, with the run's start and
    /// the seconds it ran. The phone applies the stop only for that same run.
    var onSetTimerStoppedHere: ((_ setId: String, _ startedAt: Date, _ seconds: Int) -> Void)?

    /// Called when a rest countdown runs out on its own, so the app can buzz
    /// the wrist. Not called when the wearer skips the rest or trims it to
    /// zero: they are looking at the watch and already know.
    var onRestFinished: (() -> Void)?

    private var elapsedTimer: Timer?
    private var restTimer: Timer?
    private var holdTimer: Timer?
    private var holdBuzzed = false
    /// The running timer was started on the phone. If the phone stops it
    /// without logging the set, this one stops too.
    private var holdFollowsPhone = false
    /// The set holding the timer was logged here, so the phone's timer for it
    /// is not to be copied or cleared by a later update.
    private var holdLoggedHere = false
    private var startedAt: Date?
    /// Open interval per exercise entry. Closed when the wearer leaves it.
    private var exerciseWindowStartedAt: [String: Date] = [:]
    /// Seconds already closed for each exercise. A return visit adds to this.
    private var exerciseWindowSeconds: [String: TimeInterval] = [:]

    private let defaults = UserDefaults.standard
    private let snapshotKey = "sparky.watch.workoutSnapshot"
    private let pendingTailsKey = "sparky.watch.pendingHeartRateTails"
    /// Previews share this process's UserDefaults; they must not write a
    /// snapshot that the next real launch would restore as a live workout.
    private let persistEnabled: Bool

    private init(persistEnabled: Bool = true) {
        self.persistEnabled = persistEnabled
    }

    #if DEBUG
    /// A detached instance for Xcode previews. Canvases in one process share
    /// `shared`, so without this one preview's started workout leaks into the
    /// next one's "no workout" state.
    static func previewInstance() -> WorkoutSessionStore {
        WorkoutSessionStore(persistEnabled: false)
    }
    #endif

    var isActive: Bool { plan != nil }

    var currentStep: WorkoutStep? {
        steps.indices.contains(currentStepIndex) ? steps[currentStepIndex] : nil
    }

    var isResting: Bool { restEndsAt != nil }

    /// A weighted carry: weight and distance in place of reps.
    func isCarry(_ step: WorkoutStep) -> Bool {
        step.plannedSet.carry == true
    }

    /// A loaded hold keeps its weight box even before a weight is planned.
    func isWeightedHold(_ step: WorkoutStep) -> Bool {
        step.plannedSet.weighted == true
    }

    /// True when the step's exercise is a bodyweight one, whose weight can be
    /// negative (assisted).
    func isBodyweight(_ step: WorkoutStep) -> Bool {
        plan?.exercises.first { $0.exerciseEntryId == step.exerciseEntryId }?.bodyweight == true
    }

    /// Values to show for a set: whatever was typed, then the phone's latest
    /// target, falling back to the plan.
    func values(for step: WorkoutStep) -> SetValues {
        let setId = step.plannedSet.setId
        let edited = editedValues[setId]
        let target = targetOverrides[setId]
        return SetValues(
            weightKg: edited?.weightKg ?? target?.weightKg ?? step.plannedSet.targetWeightKg,
            reps: edited?.reps ?? target?.reps ?? step.plannedSet.targetReps,
            distanceKm: edited?.distanceKm ?? target?.distanceKm ?? step.plannedSet.targetDistanceKm
        )
    }

    /// Replaces the phone-resolved targets and adopts sets logged on the
    /// phone. Ignored for another session or an older revision than the one
    /// already applied.
    ///
    /// Completions only ever add: a set logged here may still be on its way
    /// to the phone, so an update that does not list it yet must not undo it.
    /// When the set on screen was the one logged, the cursor moves on to the
    /// next set still to do, as it would after logging it here, and the
    /// phone's rest (if one is running) replaces whatever rest was on screen.
    ///
    /// Otherwise the watch's rest follows the phone's (+15s, pause/resume,
    /// Skip) — but only from an update that already lists every set logged
    /// here. One that does not was built before the phone heard about that
    /// set, so its rest is about the set before, and adopting it would cut
    /// short or cancel the rest the wrist just started. The rest is also only
    /// touched when the phone's has changed since the last one taken from
    /// it, so a ±15s pressed here is not undone by an update that was sent
    /// for a new target.
    func applyTargets(
        sessionId: String,
        revision: Double,
        targets: [String: SetValues],
        completedSetIds phoneCompleted: Set<String> = [],
        phoneRest: PhoneRest? = nil,
        setTimers: [String: Date]? = nil
    ) {
        guard plan?.sessionId == sessionId, revision > targetRevision else { return }
        targetRevision = revision
        let knownIds = Set(steps.map(\.plannedSet.setId))
        pendingUnknownCompletions = phoneCompleted.subtracting(knownIds)
        let newlyCompleted = phoneCompleted
            .subtracting(completedSetIds)
            .filter { knownIds.contains($0) }
        targetOverrides = targets
        rememberLoggedValues(for: newlyCompleted)
        if !newlyCompleted.isEmpty {
            completedSetIds.formUnion(newlyCompleted)
            if let step = currentStep, isCompleted(step) {
                // Any rest on screen was the one before this set, which is
                // now done; the phone's own rest replaces it.
                stopRestTimer()
                advancePastCompletedSet()
                if let phoneRest {
                    follow(phoneRest)
                    lastPhoneRest = phoneRest
                }
            }
        }
        // Sets logged here the phone has not listed yet. Only sets the phone
        // still has count: one it has since deleted will never be listed.
        let unseenHere = completedSetIds
            .subtracting(phoneCompleted)
            .filter { targets[$0] != nil }
        if let phoneRest, unseenHere.isEmpty, phoneRest != lastPhoneRest {
            follow(phoneRest)
            lastPhoneRest = phoneRest
        }
        if let setTimers { applyPhoneTimers(setTimers) }
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Brings the rest on screen in line with the phone's.
    private func follow(_ phoneRest: PhoneRest) {
        switch phoneRest {
        case let .resting(endsAt, durationSeconds):
            guard endsAt > Date() else {
                stopRestTimer()
                return
            }
            // No rest to show once the workout is done.
            guard currentStep != nil else { return }
            // Within a second is the same rest: a set logged here starts the
            // watch's rest a moment before the phone's, and nudging it by
            // that transit time would only make the countdown jump.
            if restPausedRemaining == nil, let restEndsAt,
               abs(restEndsAt.timeIntervalSince(endsAt)) < 1 { return }
            startRest(until: endsAt, durationSeconds: durationSeconds)
        case .paused:
            // The phone's countdown has stopped, so this one stops too
            // rather than running out while the phone still waits.
            guard let restEndsAt, restPausedRemaining == nil else { return }
            restPausedRemaining = max(0, restEndsAt.timeIntervalSinceNow)
            restTimer?.invalidate()
            restTimer = nil
        case .ready:
            stopRestTimer()
        }
    }

    /// Next set still to do after the cursor, else the first one left
    /// anywhere, else past the end so the view shows "Workout complete".
    private func advancePastCompletedSet() {
        if let next = nextIncompleteIndex() {
            moveCursor(to: next)
        } else {
            currentStepIndex = steps.count
        }
    }

    /// The first set still to do after the cursor, else the first one left
    /// anywhere, else nil when every set is logged.
    private func nextIncompleteIndex() -> Int? {
        steps.indices.first { $0 > currentStepIndex && !isCompleted(steps[$0]) }
            ?? steps.indices.first { !isCompleted(steps[$0]) }
    }

    func isCompleted(_ step: WorkoutStep) -> Bool {
        completedSetIds.contains(step.plannedSet.setId)
    }

    /// The plan's sets in the order the phone walks them (`setOrder`,
    /// supersets interleaved), else each exercise in turn.
    private static func steps(for plan: ActiveWorkoutPlan) -> [WorkoutStep] {
        let partners = plan.supersetPartners()
        let flattened = plan.exercises.flatMap { exercise in
            exercise.sets.enumerated().map { index, set in
                WorkoutStep(
                    exerciseEntryId: exercise.exerciseEntryId,
                    exerciseName: exercise.name,
                    plannedSet: set,
                    setNumber: index + 1,
                    setCount: exercise.sets.count,
                    supersetWith: partners[exercise.exerciseEntryId],
                    supersetRun: exercise.supersetRun
                )
            }
        }
        if plan.setOrder.isEmpty {
            return flattened
        } else {
            let byId = Dictionary(
                flattened.map { ($0.plannedSet.setId, $0) },
                uniquingKeysWith: { first, _ in first }
            )
            let ordered = plan.setOrder.compactMap { byId[$0] }
            return ordered.isEmpty ? flattened : ordered
        }
    }

    /// `planRevision` is that of a plan update already folded into `plan`
    /// before it started (see `WatchSessionManager`), so an older queued copy
    /// arriving afterwards is still ignored.
    func start(with plan: ActiveWorkoutPlan, planRevision startingRevision: Double = 0) {
        self.plan = plan
        steps = Self.steps(for: plan)
        currentStepIndex = 0
        completedSetIds = []
        editedValues = [:]
        loggedValues = [:]
        targetOverrides = [:]
        targetRevision = 0
        planRevision = startingRevision
        pendingUnknownCompletions = []
        lastPhoneRest = nil
        latestBpm = nil
        activeEnergyKcal = nil
        elapsedSeconds = 0
        lastSummary = nil
        askingPresetUpdate = false
        baselineStructure = Self.structure(of: plan)
        pendingSetCompletion = nil
        resetHeartRateStats()
        stopRestTimer()
        clearHold()
        startedAt = Date()
        heartRateSentThrough = nil
        finishing = nil
        exerciseWindowStartedAt = [:]
        exerciseWindowSeconds = [:]
        startElapsedTimer()
        openCurrentExerciseWindow()
        persistSnapshot(reportedEnergyKcal: 0)
    }

    /// Replaces the cap's pause snapshot. `excludedPauseSeconds` is the total
    /// already resumed, not a delta. A revision at or below the one already
    /// applied is ignored, so a queued pause cannot undo a resume that arrived
    /// first.
    func applyIntervalTiming(
        sessionId: String,
        revision: Int,
        pausedAt: Date?,
        excludedPauseSeconds: Int
    ) {
        guard let plan, plan.sessionId == sessionId else { return }
        if revision <= (plan.intervalRevision ?? 0) { return }
        self.plan = ActiveWorkoutPlan(
            sessionId: plan.sessionId,
            workoutName: plan.workoutName,
            exercises: plan.exercises,
            setOrder: plan.setOrder,
            workoutFormat: plan.workoutFormat,
            timeCapSeconds: plan.timeCapSeconds,
            startedAt: plan.startedAt,
            armedAt: plan.armedAt,
            capEndsAt: plan.capEndsAt,
            pausedAt: pausedAt,
            excludedPauseSeconds: excludedPauseSeconds,
            intervalRevision: revision,
            fromPreset: plan.fromPreset
        )
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Takes the phone's plan after an exercise, superset or set was added,
    /// removed or regrouped mid-workout, without restarting anything: sets
    /// already logged here, typed values and the phone's targets are kept
    /// (all keyed by set id), and so are the rest on screen and the HealthKit
    /// session. The cursor stays on the set it was on; if that set is gone it
    /// moves to the first set still to do. Ignored for another session or an
    /// update no newer than the last one taken.
    func updatePlan(_ newPlan: ActiveWorkoutPlan, revision: Double) {
        guard let current = plan, current.sessionId == newPlan.sessionId,
              revision > planRevision
        else { return }
        planRevision = revision
        let cursorSetId = currentStep?.plannedSet.setId
        // Past the last set the final exercise's window is still open, as in
        // `moveCursor`.
        let outgoing = currentStep?.exerciseEntryId ?? steps.last?.exerciseEntryId
        // Only the shape changes. Interval timing stays as accepted here:
        // `applyIntervalTiming` keeps the pause state and its revision in the
        // plan, and an update does not carry them.
        plan = ActiveWorkoutPlan(
            sessionId: current.sessionId,
            workoutName: newPlan.workoutName,
            exercises: newPlan.exercises,
            setOrder: newPlan.setOrder,
            workoutFormat: current.workoutFormat,
            timeCapSeconds: current.timeCapSeconds,
            startedAt: current.startedAt,
            armedAt: current.armedAt,
            capEndsAt: current.capEndsAt,
            pausedAt: current.pausedAt,
            excludedPauseSeconds: current.excludedPauseSeconds,
            intervalRevision: current.intervalRevision,
            fromPreset: current.fromPreset
        )
        steps = Self.steps(for: newPlan)
        let adopted = pendingUnknownCompletions.filter { id in
            steps.contains { $0.plannedSet.setId == id }
        }
        if !adopted.isEmpty {
            completedSetIds.formUnion(adopted)
            pendingUnknownCompletions.subtract(adopted)
            rememberLoggedValues(for: adopted)
        }
        if let cursorSetId,
           let index = steps.firstIndex(where: { $0.plannedSet.setId == cursorSetId }) {
            currentStepIndex = index
        } else {
            currentStepIndex = steps.indices.first { !isCompleted(steps[$0]) } ?? steps.count
        }
        // A cursor pushed onto another exercise closes the old one's window,
        // exactly as moving there by hand would.
        if let outgoing, currentStep?.exerciseEntryId != outgoing {
            onExerciseWillChange?(outgoing)
        }
        openCurrentExerciseWindow()
        // Only when the set on screen is one this update just adopted. A set
        // added by the plan was not the cursor, so it does not move it.
        if !adopted.isEmpty, let step = currentStep, adopted.contains(step.plannedSet.setId) {
            stopRestTimer()
            advancePastCompletedSet()
        }
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Clears local state. Does not itself notify the phone — callers that
    /// mean "the wearer ended this" send `workoutStop` separately.
    func reset() {
        askingPresetUpdate = false
        plan = nil
        steps = []
        currentStepIndex = 0
        completedSetIds = []
        editedValues = [:]
        loggedValues = [:]
        targetOverrides = [:]
        targetRevision = 0
        planRevision = 0
        pendingUnknownCompletions = []
        pendingSetCompletion = nil
        lastPhoneRest = nil
        latestBpm = nil
        activeEnergyKcal = nil
        elapsedSeconds = 0
        resetHeartRateStats()
        startedAt = nil
        exerciseWindowStartedAt = [:]
        exerciseWindowSeconds = [:]
        stopElapsedTimer()
        stopRestTimer()
        clearHold()
        clearSnapshot()
    }

    func recordHeartRate(bpm: Double, measuredAt: Date = Date()) {
        latestBpm = bpm
        accumulateHeartRate(bpm, at: measuredAt)
    }

    /// Readings the live callback may not have delivered: the buffer still
    /// held at stop, and the tail HealthKit writes only when the workout
    /// finishes. A measurement second already counted is ignored.
    func recordFinalHeartRate(_ readings: [(at: Date, bpm: Double)]) {
        for reading in readings {
            accumulateHeartRate(reading.bpm, at: reading.at)
        }
    }

    private func accumulateHeartRate(_ bpm: Double, at: Date) {
        guard bpm > 0 else { return }
        let second = Int(at.timeIntervalSince1970.rounded())
        guard countedHeartRateSeconds.insert(second).inserted else { return }
        heartRateSum += bpm
        heartRateCount += 1
        heartRateMax = max(heartRateMax ?? bpm, bpm)
    }

    private func resetHeartRateStats() {
        heartRateSum = 0
        heartRateCount = 0
        heartRateMax = nil
        countedHeartRateSeconds = []
    }

    /// Keeps the weight and reps a set had the moment it was logged. A later
    /// target update must not rewrite it.
    private func rememberLoggedValues(for setIds: some Sequence<String>) {
        for id in setIds where loggedValues[id] == nil {
            guard let step = steps.first(where: { $0.plannedSet.setId == id }) else { continue }
            loggedValues[id] = values(for: step)
        }
    }

    /// Totals for the workout in progress, or nil when no set was logged
    /// (nothing worth celebrating). Call before `reset()`.
    func makeSummary() -> WorkoutSummary? {
        guard plan != nil, !completedSetIds.isEmpty else { return nil }
        var volumeKg = 0.0
        var completed = 0
        for step in steps where completedSetIds.contains(step.plannedSet.setId) {
            completed += 1
            let v = loggedValues[step.plannedSet.setId] ?? values(for: step)
            if let weight = v.weightKg, let reps = v.reps {
                volumeKg += weight * reps
            }
        }
        return WorkoutSummary(
            durationSeconds: elapsedSeconds,
            setsCompleted: completed,
            volumeKg: volumeKg,
            averageBpm: heartRateCount > 0 ? heartRateSum / Double(heartRateCount) : nil,
            maxBpm: heartRateMax,
            activeEnergyKcal: activeEnergyKcal,
            sessionId: plan?.sessionId
        )
    }

    func recordSummary(_ summary: WorkoutSummary?) {
        lastSummary = summary
    }

    func dismissSummary() {
        lastSummary = nil
    }

    /// The exercises and the number and kind of sets in each, in order: what
    /// a saved workout is made of. Weights and reps are left out, as on the
    /// phone, so loading more weight does not count as a change. The
    /// superset grouping and the exercise's own id are included, so a
    /// grouping change or two exercises with the same name still count.
    private static func structure(of plan: ActiveWorkoutPlan) -> [String] {
        plan.exercises.map { exercise in
            let sets = exercise.sets.map { $0.setType ?? "normal" }.joined(separator: ",")
            return "\(exercise.exerciseEntryId)|\(exercise.name)|\(exercise.supersetRun.map(String.init) ?? "-")|\(sets)"
        }
    }

    /// Started from a saved workout and since changed: exercises or sets were
    /// added or removed. Only then does Finish ask whether to update it.
    var changedFromPreset: Bool {
        guard let plan, plan.fromPreset == true, let baselineStructure else { return false }
        return Self.structure(of: plan) != baselineStructure
    }

    /// Called when Finish is confirmed. Raises the "Update Workout?" question
    /// and returns true when the workout changed from its saved one; the
    /// caller then waits for the answer instead of ending the workout.
    func askPresetUpdateBeforeFinish() -> Bool {
        guard changedFromPreset else { return false }
        // Raised a moment later: the Finish confirmation or the exercise sheet
        // is still closing, and SwiftUI drops an alert presented over a
        // dismissal in progress, which left Finish doing nothing at all.
        // The workout can end or be replaced in that moment, so the raise is
        // only for the one that was finishing.
        let sessionId = plan?.sessionId
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 450_000_000)
            guard let self, self.plan?.sessionId == sessionId else { return }
            self.askingPresetUpdate = true
        }
        return true
    }

    func recordActiveEnergy(kcal: Double) {
        activeEnergyKcal = kcal
    }

    /// Overrides one value on a set. Passing nil leaves that field alone, so
    /// the keypad can commit weight and reps independently.
    func setValue(
        for setId: String,
        weightKg: Double? = nil,
        reps: Double? = nil,
        distanceKm: Double? = nil
    ) {
        var values = editedValues[setId] ?? SetValues()
        if let weightKg { values.weightKg = weightKg }
        if let reps { values.reps = reps }
        if let distanceKm { values.distanceKm = distanceKm }
        editedValues[setId] = values
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Last session's time for a set, to show in gray before the stopwatch
    /// starts. A later phone update wins over the plan.
    func previousDurationSec(forSetId setId: String) -> Int? {
        let planned = steps.first(where: { $0.plannedSet.setId == setId })?
            .plannedSet.previousDurationSec
        let seconds = targetOverrides[setId]?.previousDurationSec ?? planned
        guard let seconds, seconds > 0 else { return nil }
        return seconds
    }

    /// Seconds to count down for this set. A later phone target wins over the
    /// plan. Nil for an ordinary reps set.
    func targetDurationSec(for step: WorkoutStep) -> Int? {
        let override = targetOverrides[step.plannedSet.setId]?.durationSec
        let seconds = override ?? step.plannedSet.targetDurationSec
        guard let seconds, seconds > 0 else { return nil }
        return seconds
    }

    /// Starts the hold countdown. A second tap while it is already running
    /// for this set does nothing.
    /// `startedAt` is set when the phone already started this timer; the
    /// countdown then runs from that moment and the phone is not told again.
    func startHold(for setId: String, seconds: Int, startedAt: Date? = nil) {
        guard seconds > 0 else { return }
        if holdSetId == setId, holdEndsAt != nil { return }
        holdStartedAt = nil
        holdStoppedAt = nil
        holdLoggedHere = false
        holdSetId = setId
        holdTotalSeconds = seconds
        let start = startedAt ?? Date()
        let endsAt = start.addingTimeInterval(TimeInterval(seconds))
        holdEndsAt = endsAt
        holdFollowsPhone = startedAt != nil
        // A countdown that already ran out on the phone does not buzz now.
        holdBuzzed = endsAt <= Date()
        if !holdBuzzed { startHoldTimer() }
        persistSnapshot(reportedEnergyKcal: nil)
        if startedAt == nil { onSetTimerStartedHere?(setId, start) }
    }

    /// A duration exercise: counts down when the phone planned a length, and
    /// otherwise runs as a stopwatch.
    func isTimed(_ step: WorkoutStep) -> Bool {
        targetDurationSec(for: step) != nil || step.plannedSet.timed == true
    }

    /// Starts the stopwatch for a timed set with no planned length.
    func startStopwatch(for setId: String, startedAt: Date? = nil) {
        if holdSetId == setId, holdStartedAt != nil { return }
        stopHoldTimer()
        holdSetId = setId
        holdEndsAt = nil
        holdTotalSeconds = 0
        holdBuzzed = true
        holdStoppedAt = nil
        holdLoggedHere = false
        let start = startedAt ?? Date()
        holdStartedAt = start
        holdFollowsPhone = startedAt != nil
        persistSnapshot(reportedEnergyKcal: nil)
        if startedAt == nil { onSetTimerStartedHere?(setId, start) }
    }

    /// Whether the stopwatch for this set is running now.
    func isStopwatchRunning(for setId: String) -> Bool {
        holdSetId == setId && holdStartedAt != nil && holdStoppedAt == nil
    }

    /// Stops the stopwatch and tells the phone how long it ran. The time stays
    /// on screen and is what logging the set sends.
    func stopStopwatch(for setId: String) {
        guard isStopwatchRunning(for: setId) else { return }
        holdStoppedAt = Date()
        persistSnapshot(reportedEnergyKcal: nil)
        if let start = holdStartedAt, let seconds = stopwatchElapsed(for: setId) {
            onSetTimerStoppedHere?(setId, start, seconds)
        }
    }

    /// Follows the phone's set timers: starts the countdown or stopwatch for
    /// a set the phone started, from the phone's start time, and stops one it
    /// copied earlier if the phone dropped it without logging the set. A
    /// timer started here is never replaced.
    private func applyPhoneTimers(_ allTimers: [String: Date]) {
        // The wrist holds one timer. If a phone sends several, follow the
        // newest rather than letting each replace the one before it.
        let timers: [String: Date] = allTimers.max(by: { $0.value < $1.value })
            .map { [$0.key: $0.value] } ?? [:]
        if let heldId = holdSetId, completedSetIds.contains(heldId), !holdLoggedHere {
            // Logged on the phone: its timer is done.
            clearHold()
        } else if let heldId = holdSetId, holdFollowsPhone, timers[heldId] == nil,
                  !completedSetIds.contains(heldId) {
            clearHold()
        }
        // A timer the wearer started here and has not finished is kept, even
        // when the phone is timing a different set.
        if let heldId = holdSetId, !holdFollowsPhone, !holdLoggedHere,
           !completedSetIds.contains(heldId) {
            return
        }
        for (setId, start) in timers {
            guard holdSetId != setId, !completedSetIds.contains(setId),
                  let step = steps.first(where: { $0.plannedSet.setId == setId }) else { continue }
            if let seconds = targetDurationSec(for: step) {
                startHold(for: setId, seconds: seconds, startedAt: start)
            } else if isTimed(step) {
                startStopwatch(for: setId, startedAt: start)
            }
        }
    }

    /// Seconds the stopwatch has run for this set. Nil when never started.
    func stopwatchElapsed(for setId: String, now: Date = Date()) -> Int? {
        guard holdSetId == setId, let start = holdStartedAt else { return nil }
        return max(0, Int((holdStoppedAt ?? now).timeIntervalSince(start).rounded()))
    }

    /// Seconds left on a hold that was started for this set. Nil when it
    /// was never started, so the view can show the full target instead.
    func holdRemaining(for setId: String, now: Date = Date()) -> Int? {
        guard holdSetId == setId, let endsAt = holdEndsAt else { return nil }
        return max(0, Int(endsAt.timeIntervalSince(now).rounded()))
    }

    /// Seconds to log. Nil when the countdown was never started, so the
    /// phone keeps the planned duration. A finished countdown logs the
    /// target; stopping early logs how long it actually ran.
    func holdLoggedSeconds(for setId: String, now: Date = Date()) -> Int? {
        if holdStartedAt != nil {
            guard let elapsed = stopwatchElapsed(for: setId, now: now), elapsed > 0 else { return nil }
            return elapsed
        }
        guard holdSetId == setId, holdEndsAt != nil, holdTotalSeconds > 0 else { return nil }
        let remaining = holdRemaining(for: setId, now: now) ?? 0
        return min(holdTotalSeconds, max(0, holdTotalSeconds - remaining))
    }

    /// Marks the current set done, starts the next set's rest, and advances
    /// the cursor. Returns the step that was completed so the caller can
    /// report it — the store never talks to the phone itself.
    ///
    /// `holdForEffort` records the completion, including the values and the
    /// tick time, in the snapshot before returning. The set is sent only
    /// after Save or Skip, and `clearPendingSetCompletion` drops that record.
    @discardableResult
    func completeCurrentSet(holdForEffort: Bool = false) -> WorkoutStep? {
        guard let step = currentStep, !isCompleted(step) else { return nil }
        let logged = values(for: step)
        // Captured at the tick. A countdown measures from `now`, so reading it
        // again at Save would count the time spent on the effort screen.
        var loggedDuration: Int?
        // Stop the buzz. The deadline stays so the caller can still read
        // how long the hold ran.
        // Only when this is the set the timer belongs to: logging another set
        // while a synchronized timer for a different one runs must leave that
        // timer alone.
        if holdSetId == step.plannedSet.setId {
            if holdStartedAt != nil, holdStoppedAt == nil { holdStoppedAt = Date() }
            loggedDuration = holdLoggedSeconds(for: step.plannedSet.setId)
            holdLoggedHere = true
            stopHoldTimer()
        }
        rememberLoggedValues(for: [step.plannedSet.setId])
        completedSetIds.insert(step.plannedSet.setId)

        // The next set still to do, not simply the next one: a set further on
        // may already have been logged on the phone, and landing on it would
        // leave a tick that cannot log anything.
        if let next = nextIncompleteIndex() {
            moveCursor(to: next)
            // Phone rest is *before the next set* (`nextStep.restSec`). Using
            // the completed set's rest inverted per-set rest and supersets.
            let nextRest = steps[next].plannedSet.restSeconds
            if nextRest > 0 {
                startRest(seconds: nextRest)
            }
        } else {
            // Past the last set so `currentStep` is nil and the UI can show
            // "Workout complete" instead of a rest timer with no way out.
            currentStepIndex = steps.count
        }
        if holdForEffort {
            pendingSetCompletion = PendingSetCompletion(
                setId: step.plannedSet.setId,
                values: logged,
                completedAt: Date(),
                durationSeconds: loggedDuration
            )
        }
        persistSnapshot(reportedEnergyKcal: nil)
        return step
    }

    /// Drops the held completion. Call only after the send was accepted by
    /// an activated Watch Connectivity session.
    func clearPendingSetCompletion() {
        guard pendingSetCompletion != nil else { return }
        pendingSetCompletion = nil
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// Records Save or Skip on the held completion before the send is tried,
    /// so a relaunch can still deliver that choice.
    func markPendingReadyToSend(rpe: Double?) {
        guard var pending = pendingSetCompletion else { return }
        pending.rpe = rpe
        pending.readyToSend = true
        pendingSetCompletion = pending
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// How many of an exercise's sets are logged, for the picker's subtitle.
    ///
    /// `filter {}.count` rather than `count(where:)`: the latter is a Swift 6
    /// stdlib addition gated on watchOS 11, and this target deploys to 10.0.
    func completedSetCount(for exercise: PlannedExercise) -> Int {
        exercise.sets.filter { completedSetIds.contains($0.setId) }.count
    }

    func isComplete(_ exercise: PlannedExercise) -> Bool {
        !exercise.sets.isEmpty && completedSetCount(for: exercise) == exercise.sets.count
    }

    /// Moves the cursor to an exercise chosen from the picker, landing on its
    /// first set that still needs doing — coming back to a half-finished
    /// exercise should resume it, not restart it. Falls back to its first set
    /// when every one is already logged.
    func jumpToExercise(_ exerciseEntryId: String) {
        let owned = steps.indices.filter { steps[$0].exerciseEntryId == exerciseEntryId }
        guard let first = owned.first else { return }
        stopRestTimer()
        moveCursor(to: owned.first { !isCompleted(steps[$0]) } ?? first)
        persistSnapshot(reportedEnergyKcal: nil)
    }

    func goToNextStep() {
        guard currentStepIndex + 1 < steps.count else { return }
        stopRestTimer()
        moveCursor(to: currentStepIndex + 1)
    }

    func goToPreviousStep() {
        guard currentStepIndex > 0 else { return }
        stopRestTimer()
        moveCursor(to: currentStepIndex - 1)
    }

    /// The one way the wearer's actions move the cursor, so an exercise
    /// boundary can never be crossed without `onExerciseWillChange` firing.
    private func moveCursor(to index: Int) {
        if let outgoing = currentStep?.exerciseEntryId ?? steps.last?.exerciseEntryId,
           steps.indices.contains(index),
           steps[index].exerciseEntryId != outgoing {
            onExerciseWillChange?(outgoing)
        }
        currentStepIndex = index
        openCurrentExerciseWindow()
    }

    /// Wall-clock time the wearer spent on each exercise, including rest
    /// between its sets. Zone seconds are credited to whatever was on screen,
    /// so the diary duration has to be this window rather than the sum of
    /// set timers (those are often zero on a strength plan).
    func openCurrentExerciseWindow() {
        guard let id = currentStep?.exerciseEntryId else { return }
        if exerciseWindowStartedAt[id] == nil {
            exerciseWindowStartedAt[id] = Date()
        }
    }

    /// Ends the open interval for `id` and returns the accumulated minutes,
    /// rounded to the hundredth. A later visit adds to the same total.
    func closeExerciseWindow(_ id: String) -> Double {
        if let start = exerciseWindowStartedAt.removeValue(forKey: id) {
            let elapsed = Date().timeIntervalSince(start)
            if elapsed > 0 {
                exerciseWindowSeconds[id, default: 0] += elapsed
            }
        }
        let minutes = (exerciseWindowSeconds[id] ?? 0) / 60
        return (minutes * 100).rounded() / 100
    }

    /// Closes whichever exercise is current. Nil when nothing is on screen.
    func closeCurrentExerciseWindow() -> (id: String, minutes: Double)? {
        guard let id = currentStep?.exerciseEntryId ?? steps.last?.exerciseEntryId else {
            return nil
        }
        return (id, closeExerciseWindow(id))
    }

    func skipRest() {
        guard let previous = restEndsAt, restPausedRemaining == nil else { return }
        stopRestTimer()
        onRestChangedHere?(previous, nil)
    }

    /// The ±15s controls on the rest screen. Dropping to zero or below just
    /// ends the rest, same as skipping.
    func adjustRest(bySeconds delta: Int) {
        guard let endsAt = restEndsAt else { return }
        // Paused on the phone: the phone owns the rest until it resumes, and
        // its resume would overwrite any change made here. The rest screen
        // disables these controls while paused; this is the backstop.
        guard restPausedRemaining == nil else { return }
        let newEndsAt = endsAt.addingTimeInterval(TimeInterval(delta))
        guard newEndsAt > Date() else {
            stopRestTimer()
            onRestChangedHere?(endsAt, nil)
            return
        }
        restEndsAt = newEndsAt
        restDurationSeconds = max(1, restDurationSeconds + delta)
        onRestChangedHere?(endsAt, newEndsAt)
    }

    // MARK: - Jetsam snapshot

    /// What we write to disk so a relaunch can pick the workout back up.
    /// `reportedEnergyKcal` is owned by `WatchSessionManager` (it is "what we
    /// have already sent", not UI) but it has to travel with the plan: a
    /// reset-to-zero after recover would send the running total as a fresh
    /// delta and double calories.
    struct Snapshot: Codable {
        var plan: ActiveWorkoutPlan
        var currentStepIndex: Int
        var completedSetIds: [String]
        var editedValues: [String: SetValues]
        var startedAt: Date
        var reportedEnergyKcal: Double
        /// Latest heart-rate instant already sent to the phone. Optional so a
        /// snapshot written before this existed still decodes. On recover the
        /// HR query resumes after it rather than from the workout's start —
        /// the dedupe set is gone after a relaunch, so replaying from the
        /// start would re-send every earlier exercise's readings tagged with
        /// the current one.
        var heartRateSentThrough: Date?
        /// Closed seconds per exercise. Optional so a snapshot from before
        /// this field still decodes. The open interval is not stored: time
        /// while the process was dead is not time the exercise was on screen.
        var exerciseWindowSeconds: [String: TimeInterval]?
        /// Set once a finish has started. HealthKit only saves the workout's
        /// last readings after `finishWorkout`, so a relaunch that finds this
        /// reads them back from Health and completes the finish instead of
        /// resuming the workout. Optional so older snapshots still decode.
        var finishing: Finishing?
        /// See `targetOverrides`. Optional so older snapshots still decode.
        var targetOverrides: [String: SetValues]?
        var targetRevision: Double?
        /// See `planRevision`. Optional so older snapshots still decode.
        var planRevision: Double?
        /// See `pendingUnknownCompletions`. Optional so older snapshots still decode.
        var pendingUnknownCompletions: [String]?
        /// The running (or just-logged) set timer, so a relaunch resumes the
        /// clock instead of showing Start again. Optional so older snapshots
        /// still decode.
        var hold: HoldState?
        /// See `loggedValues`. Optional so older snapshots still decode.
        var loggedValues: [String: SetValues]?
        /// Running heart-rate totals, so a relaunch does not start the
        /// summary's average over. Optional so older snapshots still decode.
        var heartRateSum: Double?
        var heartRateCount: Int?
        var heartRateMax: Double?
        /// Measurement seconds already in those totals. Optional so older
        /// snapshots still decode.
        var countedHeartRateSeconds: [Int]?
        /// What the plan looked like when the workout started, so a relaunch
        /// still knows whether it changed. Optional so older snapshots still
        /// decode.
        var baselineStructure: [String]?
        /// A set logged here that has not been sent yet because the wearer is
        /// still picking an effort. Optional so older snapshots still decode.
        var pendingSetCompletion: PendingSetCompletion?
    }

    /// A completed set waiting on the effort screen. Kept in the snapshot so
    /// a relaunch can still send it. Cleared only after the send is accepted
    /// by Watch Connectivity, not while it is sitting in memory.
    struct PendingSetCompletion: Codable, Equatable {
        var setId: String
        var values: SetValues
        var completedAt: Date
        /// Seconds the hold had run at the tick. Nil when it was never
        /// started. Kept so time spent on the effort screen is not logged.
        var durationSeconds: Int?
        /// Set when the wearer taps Save. Nil with `readyToSend` means Skip.
        var rpe: Double?
        /// The wearer already chose Save or Skip. The send may still be
        /// waiting for the session to activate.
        var readyToSend: Bool

        init(
            setId: String,
            values: SetValues,
            completedAt: Date,
            durationSeconds: Int?,
            rpe: Double? = nil,
            readyToSend: Bool = false
        ) {
            self.setId = setId
            self.values = values
            self.completedAt = completedAt
            self.durationSeconds = durationSeconds
            self.rpe = rpe
            self.readyToSend = readyToSend
        }

        private enum CodingKeys: String, CodingKey {
            case setId, values, completedAt, durationSeconds, rpe, readyToSend
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            setId = try container.decode(String.self, forKey: .setId)
            values = try container.decode(SetValues.self, forKey: .values)
            completedAt = try container.decode(Date.self, forKey: .completedAt)
            durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
            rpe = try container.decodeIfPresent(Double.self, forKey: .rpe)
            readyToSend = try container.decodeIfPresent(Bool.self, forKey: .readyToSend) ?? false
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(setId, forKey: .setId)
            try container.encode(values, forKey: .values)
            try container.encode(completedAt, forKey: .completedAt)
            try container.encodeIfPresent(durationSeconds, forKey: .durationSeconds)
            try container.encodeIfPresent(rpe, forKey: .rpe)
            try container.encode(readyToSend, forKey: .readyToSend)
        }
    }

    private(set) var pendingSetCompletion: PendingSetCompletion?

    /// A set timer as stored in the snapshot.
    struct HoldState: Codable, Equatable {
        var setId: String
        /// Set for a countdown; nil for a stopwatch.
        var endsAt: Date?
        var totalSeconds: Int
        /// Set for a stopwatch.
        var startedAt: Date?
        var stoppedAt: Date?
        var followsPhone: Bool
        var loggedHere: Bool
    }

    private var holdState: HoldState? {
        guard let holdSetId else { return nil }
        return HoldState(
            setId: holdSetId,
            endsAt: holdEndsAt,
            totalSeconds: holdTotalSeconds,
            startedAt: holdStartedAt,
            stoppedAt: holdStoppedAt,
            followsPhone: holdFollowsPhone,
            loggedHere: holdLoggedHere
        )
    }

    /// Puts a stored timer back after `start(with:)` cleared it. A countdown
    /// that ran out while the process was gone does not buzz again.
    private func restoreHold(_ hold: HoldState?) {
        guard let hold, steps.contains(where: { $0.plannedSet.setId == hold.setId }),
              !completedSetIds.contains(hold.setId) || hold.loggedHere else { return }
        holdSetId = hold.setId
        holdEndsAt = hold.endsAt
        holdTotalSeconds = hold.totalSeconds
        holdStartedAt = hold.startedAt
        holdStoppedAt = hold.stoppedAt
        holdFollowsPhone = hold.followsPhone
        holdLoggedHere = hold.loggedHere
        holdBuzzed = true
        if let endsAt = hold.endsAt, !hold.loggedHere, endsAt > Date() {
            holdBuzzed = false
            startHoldTimer()
        }
    }

    /// A finish that may not have reached the phone yet.
    struct Finishing: Codable, Equatable {
        /// The exercise the final readings belong to.
        var exerciseEntryId: String
        /// That exercise's wall-clock minutes, already closed.
        var minutes: Double
        /// Whether the phone still has to be told the workout ended.
        var sendStop: Bool
        /// When the finish began. Readings after this are not the workout's.
        var requestedAt: Date
    }

    /// See `Snapshot.finishing`. Cleared by `reset`.
    private(set) var finishing: Finishing?

    /// Records that a finish began, so an interruption before the tail is
    /// sent can be completed on the next launch.
    func markFinishing(_ finishing: Finishing) {
        self.finishing = finishing
        persistSnapshot(reportedEnergyKcal: nil)
    }

    /// The stored snapshot, without restoring it.
    func storedSnapshot() -> Snapshot? {
        guard persistEnabled,
              let data = defaults.data(forKey: snapshotKey)
        else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    /// Last energy high-water mark we persisted. WatchSessionManager reads
    /// this after `restoreSnapshot` so it does not have to keep a parallel
    /// UserDefaults key.
    private(set) var restoredReportedEnergyKcal: Double = 0

    /// See `Snapshot.heartRateSentThrough`. Only ever moves forward.
    private(set) var heartRateSentThrough: Date?

    /// Writes the live plan. Pass `reportedEnergyKcal` when the caller just
    /// sent a batch; pass nil to keep whatever was last stored (set complete,
    /// cursor move) so we do not zero the high-water mark from a UI event.
    /// `heartRateSentThrough` works the same way: pass the latest instant of a
    /// batch just sent, or nil to keep the stored one.
    func persistSnapshot(reportedEnergyKcal: Double?, heartRateSentThrough sentThrough: Date? = nil) {
        if let sentThrough, sentThrough > (heartRateSentThrough ?? .distantPast) {
            heartRateSentThrough = sentThrough
        }
        guard persistEnabled, let plan, let startedAt else { return }
        // Include time on the exercise that is still open, but leave the live
        // counters alone. A later close still measures from the original start.
        var snapshotExerciseWindowSeconds = exerciseWindowSeconds
        let captureDate = Date()
        for (id, windowStartedAt) in exerciseWindowStartedAt {
            snapshotExerciseWindowSeconds[id, default: 0] +=
                max(0, captureDate.timeIntervalSince(windowStartedAt))
        }
        let energy: Double
        if let reportedEnergyKcal {
            energy = reportedEnergyKcal
            restoredReportedEnergyKcal = reportedEnergyKcal
        } else {
            energy = restoredReportedEnergyKcal
        }
        let snapshot = Snapshot(
            plan: plan,
            currentStepIndex: currentStepIndex,
            completedSetIds: Array(completedSetIds),
            editedValues: editedValues,
            startedAt: startedAt,
            reportedEnergyKcal: energy,
            heartRateSentThrough: heartRateSentThrough,
            exerciseWindowSeconds: snapshotExerciseWindowSeconds,
            finishing: finishing,
            targetOverrides: targetOverrides,
            targetRevision: targetRevision,
            planRevision: planRevision,
            pendingUnknownCompletions: Array(pendingUnknownCompletions),
            hold: holdState,
            loggedValues: loggedValues,
            heartRateSum: heartRateSum,
            heartRateCount: heartRateCount,
            heartRateMax: heartRateMax,
            countedHeartRateSeconds: Array(countedHeartRateSeconds),
            baselineStructure: baselineStructure,
            pendingSetCompletion: pendingSetCompletion
        )
        if let data = try? JSONEncoder().encode(snapshot) {
            defaults.set(data, forKey: snapshotKey)
        }
    }

    /// Rehydrates a jetsam'd workout. Returns the snapshot so the session
    /// manager can rebind HealthKit and restore its energy high-water mark.
    /// No-op (and returns nil) when there is nothing stored.
    @discardableResult
    func restoreSnapshot() -> Snapshot? {
        guard let snapshot = storedSnapshot() else { return nil }
        start(with: snapshot.plan)
        // `start(with:)` resets cursor / completions / energy and writes a
        // fresh snapshot; put the recovered progress back on top. The window
        // start() opened belongs to set 1, not necessarily where we resume.
        exerciseWindowStartedAt = [:]
        exerciseWindowSeconds = snapshot.exerciseWindowSeconds ?? [:]
        currentStepIndex = min(snapshot.currentStepIndex, steps.count)
        openCurrentExerciseWindow()
        completedSetIds = Set(snapshot.completedSetIds)
        editedValues = snapshot.editedValues
        loggedValues = snapshot.loggedValues ?? [:]
        heartRateSum = snapshot.heartRateSum ?? 0
        heartRateCount = snapshot.heartRateCount ?? 0
        heartRateMax = snapshot.heartRateMax
        countedHeartRateSeconds = Set(snapshot.countedHeartRateSeconds ?? [])
        targetOverrides = snapshot.targetOverrides ?? [:]
        targetRevision = snapshot.targetRevision ?? 0
        planRevision = snapshot.planRevision ?? 0
        pendingUnknownCompletions = Set(snapshot.pendingUnknownCompletions ?? [])
        restoreHold(snapshot.hold)
        startedAt = snapshot.startedAt
        elapsedSeconds = max(0, Int(Date().timeIntervalSince(snapshot.startedAt)))
        restoredReportedEnergyKcal = snapshot.reportedEnergyKcal
        heartRateSentThrough = snapshot.heartRateSentThrough
        // `start(with:)` took the baseline from the plan as it was saved, which
        // may already include changes; the stored one is the real starting plan.
        if let stored = snapshot.baselineStructure { baselineStructure = stored }
        pendingSetCompletion = snapshot.pendingSetCompletion
        persistSnapshot(reportedEnergyKcal: snapshot.reportedEnergyKcal)
        return snapshot
    }

    // MARK: - Pending tails

    /// A finished workout whose saved heart-rate tail was still being read
    /// when the finish timed out. Kept apart from the snapshot, which the
    /// finish clears, so the tail can still be sent later in this process or
    /// after a relaunch.
    struct PendingTail: Codable, Equatable {
        var sessionId: String
        /// The exercise the final readings belong to.
        var exerciseEntryId: String
        /// Latest instant already sent. The tail is only what comes after.
        var sentThrough: Date?
        /// When the timeout gave up waiting. Old entries are abandoned.
        var createdAt: Date
    }

    func pendingTails() -> [PendingTail] {
        guard persistEnabled,
              let data = defaults.data(forKey: pendingTailsKey),
              let tails = try? JSONDecoder().decode([PendingTail].self, from: data)
        else { return [] }
        return tails
    }

    func addPendingTail(_ tail: PendingTail) {
        var tails = pendingTails().filter { $0.sessionId != tail.sessionId }
        tails.append(tail)
        writePendingTails(tails)
    }

    func removePendingTail(sessionId: String) {
        writePendingTails(pendingTails().filter { $0.sessionId != sessionId })
    }

    private func writePendingTails(_ tails: [PendingTail]) {
        guard persistEnabled else { return }
        if tails.isEmpty {
            defaults.removeObject(forKey: pendingTailsKey)
        } else if let data = try? JSONEncoder().encode(tails) {
            defaults.set(data, forKey: pendingTailsKey)
        }
    }

    func clearSnapshot() {
        restoredReportedEnergyKcal = 0
        heartRateSentThrough = nil
        finishing = nil
        guard persistEnabled else { return }
        defaults.removeObject(forKey: snapshotKey)
    }

    // MARK: - Timers

    private func startElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let startedAt = self.startedAt else { return }
                self.elapsedSeconds = Int(Date().timeIntervalSince(startedAt))
            }
        }
        if let elapsedTimer {
            RunLoop.main.add(elapsedTimer, forMode: .common)
        }
    }

    private func stopElapsedTimer() {
        elapsedTimer?.invalidate()
        elapsedTimer = nil
    }

    private func startRest(seconds: Int) {
        startRest(
            until: Date().addingTimeInterval(TimeInterval(seconds)),
            durationSeconds: seconds
        )
    }

    private func startRest(until endsAt: Date, durationSeconds: Int) {
        restTimer?.invalidate()
        restPausedRemaining = nil
        restEndsAt = endsAt
        restDurationSeconds = max(1, durationSeconds)
        restTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let endsAt = self.restEndsAt else { return }
                if Date() >= endsAt {
                    self.stopRestTimer()
                    self.onRestFinished?()
                }
            }
        }
        if let restTimer {
            RunLoop.main.add(restTimer, forMode: .common)
        }
    }

    private func stopRestTimer() {
        restTimer?.invalidate()
        restTimer = nil
        restEndsAt = nil
        restDurationSeconds = 0
        restPausedRemaining = nil
    }

    private func startHoldTimer() {
        holdTimer?.invalidate()
        holdTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let endsAt = self.holdEndsAt else { return }
                guard Date() >= endsAt else { return }
                self.stopHoldTimer()
                guard !self.holdBuzzed else { return }
                self.holdBuzzed = true
                self.onRestFinished?()
            }
        }
        if let holdTimer {
            RunLoop.main.add(holdTimer, forMode: .common)
        }
    }

    /// Invalidates the timer without forgetting the deadline. `clearHold`
    /// is what drops the deadline, at the start and end of a workout.
    private func stopHoldTimer() {
        holdTimer?.invalidate()
        holdTimer = nil
    }

    private func clearHold() {
        stopHoldTimer()
        holdSetId = nil
        holdEndsAt = nil
        holdTotalSeconds = 0
        holdStartedAt = nil
        holdStoppedAt = nil
        holdBuzzed = false
        holdFollowsPhone = false
        holdLoggedHere = false
    }
}
