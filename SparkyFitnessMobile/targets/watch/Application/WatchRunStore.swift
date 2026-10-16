import Foundation
import Combine
import WatchKit

/// The wrist-only walk or run, indoors or out: what to show, and the start, pause,
/// resume and finish actions. See `WatchRunHealthKitController` for how it is
/// recorded and handed to the phone (a queued message that files it in the diary).
@MainActor
final class WatchRunStore: ObservableObject {
    static let shared = WatchRunStore()

    enum Phase: Equatable {
        case idle
        case running
        case paused
        /// Ended indoors: asking for the treadmill's distance before the run
        /// is sent to the phone (`confirmDistance`).
        case confirmingDistance
        /// Ended and saved; the summary is up until the wearer dismisses it.
        case finished
    }

    /// What a finished recording leaves for the summary page.
    struct Summary: Equatable {
        let kind: WatchRunKind
        let place: WatchRunPlace
        let elapsed: TimeInterval
        let metrics: WatchRunMetrics
        let saved: Bool
    }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var kind: WatchRunKind = .run
    @Published private(set) var place: WatchRunPlace = .indoor
    @Published private(set) var metrics = WatchRunMetrics()
    @Published private(set) var summary: Summary?
    /// True while paused by the movement detector rather than by the wearer.
    @Published private(set) var autoPaused = false
    @Published private(set) var lapCount = 0
    /// The indoor run waiting on the treadmill question, already scaled.
    private var pendingResult: WatchRunResult?
    private var pendingElapsed: TimeInterval = 0
    /// The learned indoor factor this run applies to the watch's own distance
    /// (1 outdoors); see `IndoorDistanceScale`.
    private(set) var distanceScale: Double = 1
    /// The latest GPS fix's accuracy radius and when it came, for the signal
    /// bars on an outdoor run. Nil indoors and before the first fix.
    @Published private(set) var gpsAccuracy: Double?
    @Published private(set) var gpsAccuracyAt: Date?
    /// This run's switches; see `WatchRunSettings`.
    @Published private(set) var settings = WatchRunSettings(autoPause: true, voiceCues: false)
    /// The plan this run follows, if any. The page works out the live step
    /// from it each second; the store only cues the changes.
    @Published private(set) var plan: WatchRunPlan?
    /// Index of the plan step already announced (-1 before the first).
    private var cuedStep = -1
    /// The distance step whose "to go" cue was said, so it is said once.
    private var toGoCuedStep = -1
    /// Which coaching cues (step warnings, halfway, check-ins) were said.
    private var coaching = WatchCoachingState()
    private var stepTimer: Timer?
    /// The phone's request this run answers, when it was started from there.
    /// Sent with every live message so the phone can tell it is this run.
    private var requestId: String?
    /// Requests already acted on, so the queued and the immediate copy of one
    /// start (and a redelivery) begin a single run.
    private var handledRequests: [String] = []
    private var handledControls: [String] = []
    private var liveTimer: Timer?
    /// Whole km or miles already announced, so a split is cued once.
    private var cuedSplits = 0
    private var lastSplitElapsed: TimeInterval = 0

    /// True from Start until the summary is dismissed, so the page stays put
    /// and the wearer is not swiped away from a running recording.
    var isActive: Bool { phase != .idle }

    /// Only one workout session can run on the watch, so this refuses to
    /// start while a strength workout or the phone's GPS recording has one.
    var canStart: Bool {
        phase == .idle
            && !recoveryPending
            && !WorkoutSessionStore.shared.isActive
            && !RecordingStore.shared.isActive
            && !WorkoutHealthKitController.shared.hasLiveSession
            && !RecordingHealthKitController.shared.hasLiveSession
    }

    private let healthKit = WatchRunHealthKitController.shared

    /// A run left going by a killed app is still to be picked up at launch;
    /// starting a new one before that would collide with its Health session.
    private var recoveryPending = WatchRunSnapshotStore.exists
    /// Where the pace stands against this run's pace range. Not kept in the
    /// snapshot: a relaunch starts the wait again.
    private var paceAlertState = WatchPaceAlertState.initial
    private var recentPace = WatchRecentPace()
    private var paceAlertStep: Int?
    private var heartRateAlertState = WatchHeartRateAlertState.initial
    private var heartRateAlertStep: Int?
    private var recovering = false

    private init() {
        healthKit.onMetrics = { [weak self] metrics in
            Task { @MainActor in
                guard let self else { return }
                let shown = metrics.scaled(self.distanceScale)
                self.metrics = shown
                self.cueSplitIfDue(shown)
                self.checkPaceBand(shown)
                self.checkHeartRate(shown)
            }
        }
        healthKit.onFailure = { [weak self] result in
            Task { @MainActor in self?.sessionFailed(result) }
        }
        healthKit.onAutoPause = { [weak self] action in
            Task { @MainActor in self?.applyAutoPause(action) }
        }
        healthKit.onGpsAccuracy = { [weak self] accuracy in
            Task { @MainActor in
                self?.gpsAccuracy = accuracy
                self?.gpsAccuracyAt = Date()
            }
        }
    }

    /// Seconds on the clock. Read every second by the page; the builder keeps
    /// the count, so it stays right across pauses.
    var elapsed: TimeInterval { healthKit.elapsed }

    /// Starts the run the phone asked for. Ignored when this request was
    /// already acted on, when it is old (a queued copy that sat for minutes
    /// describes a moment the wearer has left), or when the watch is busy: one
    /// workout session at a time, and it is not this request's to end.
    func startRequested(_ request: WatchRunStartRequest) {
        guard !handledRequests.contains(request.requestId) else { return }
        handledRequests = Array((handledRequests + [request.requestId]).suffix(20))
        guard abs(Date().timeIntervalSince(request.requestedAt)) <= 120 else { return }
        guard canStart else { return }
        start(request.kind, place: request.place, plan: request.plan, settings: request.settings)
        // After `start`, which clears it for a run begun on the wrist.
        if phase == .running { requestId = request.requestId }
    }

    /// A pause, resume, lap, finish or discard from the phone, for the run
    /// that is going. Another run's id, or one already acted on, does nothing.
    func applyRemote(runId: String, action: String, controlId: String) {
        guard !handledControls.contains(controlId) else { return }
        handledControls = Array((handledControls + [controlId]).suffix(40))
        guard isActive, runId == healthKit.runId else { return }
        switch action {
        case "pause": pause()
        case "resume": resume()
        case "lap": lap()
        case "finish": finish()
        case "discard": discard()
        case "autoPauseOn": setAutoPause(true)
        case "autoPauseOff": setAutoPause(false)
        case "voiceCuesOn": setVoiceCues(true)
        case "voiceCuesOff": setVoiceCues(false)
        case "paceAlertOn": setPaceAlert(true)
        case "paceAlertOff": setPaceAlert(false)
        case "heartRateAlertOn": setHeartRateAlert(true)
        case "heartRateAlertOff": setHeartRateAlert(false)
        default: break
        }
    }

    /// What a run begun on the wrist starts with: the phone's saved switches,
    /// which reach the watch in the context. Auto-pause is on unless the
    /// phone said otherwise; voice cues are off unless it said on.
    private var defaultSettings: WatchRunSettings {
        let context = CheckInStore.shared.context
        return WatchRunSettings(
            autoPause: context.runAutoPause ?? true,
            voiceCues: context.runVoiceCues == true,
            paceBand: nil,
            heartRateBand: nil,
            checkInMinutes: context.runCheckInMinutes
        )
    }

    func start(
        _ kind: WatchRunKind,
        place: WatchRunPlace,
        plan: WatchRunPlan? = nil,
        settings: WatchRunSettings? = nil,
        alerts: WatchRunAlertSetup = .off
    ) {
        guard canStart else { return }
        // Distance steps follow the watch's GPS distance; indoors there is
        // only a motion estimate, so the phone does not offer them there.
        let plan = place == .indoor && plan?.hasDistanceSteps == true ? nil : plan
        var chosen = settings ?? defaultSettings
        // A run begun on the wrist takes its alerts from the start screen; one
        // the phone asked for carries its own.
        if settings == nil {
            chosen.paceBand = alerts.pace
            chosen.heartRateBand = alerts.heartRate
        }
        requestId = nil
        self.settings = chosen
        self.kind = kind
        self.place = place
        self.plan = plan
        distanceScale = Self.scale(for: kind, place: place)
        cuedStep = -1
        coaching = WatchCoachingState()
        paceAlertState = .initial
        paceAlertStep = nil
        heartRateAlertState = .initial
        heartRateAlertStep = nil
        recentPace.reset()
        toGoCuedStep = -1
        summary = nil
        metrics = WatchRunMetrics()
        gpsAccuracy = nil
        gpsAccuracyAt = nil
        lapCount = 0
        cuedSplits = 0
        lastSplitElapsed = 0
        phase = .running
        healthKit.requestAuthorization { [weak self] in
            Task { @MainActor in
                guard let self, self.phase == .running else { return }
                if self.healthKit.start(kind, place: place, plan: plan, settings: chosen) {
                    // With a plan, its first step is the start cue; saying
                    // both would cut one off.
                    if plan == nil { self.cue(String(localized: "watch.run.cue.started", defaultValue: "\(kind.title(place)) started.")) }
                    self.startStepTimer()
                    self.startLiveTimer()
                } else {
                    self.phase = .idle
                    self.requestId = nil
                    self.plan = nil
                }
            }
        }
    }

    /// Picks a run back up after the watch app was killed while it was going.
    /// `completion(true)` means this store now holds the Health session (or
    /// has handled a run that could not be re-attached), so nothing else
    /// should treat a leftover session as its own.
    func recoverIfNeeded(completion: @escaping (Bool) -> Void) {
        guard phase == .idle else { completion(true); return }
        // Two overlapping calls would both reach the Health session.
        guard !recovering else { completion(true); return }
        recovering = true
        healthKit.recoverIfNeeded { [weak self] outcome in
            Task { @MainActor in
                guard let self else { completion(false); return }
                self.recoveryPending = false
                self.recovering = false
                switch outcome {
                case .none:
                    completion(false)
                case .resumed(let recovery):
                    self.kind = recovery.kind
                    self.place = recovery.place
                    self.distanceScale = Self.scale(for: recovery.kind, place: recovery.place)
                    self.metrics = recovery.metrics.scaled(self.distanceScale)
                    self.summary = nil
                    self.autoPaused = recovery.autoPaused
                    self.lapCount = recovery.lapCount
                    self.plan = self.healthKit.plan
                    self.settings = self.healthKit.settings
                    // The recovered builder may still read 0 for a moment, so the
                    // snapshot's time is the floor. The plan's place comes back
                    // from the snapshot, so the step the run is in now is not
                    // announced again.
                    let resumedAt = max(self.healthKit.elapsed, recovery.elapsed)
                    self.cuedStep = self.healthKit.planPosition()?.index ?? -1
                    self.toGoCuedStep = self.cuedStep
                    self.coaching = WatchCoachingState.resumed(
                        at: resumedAt,
                        plan: self.plan,
                        checkInMinutes: self.settings.checkInMinutes ?? 0,
                        distanceMeters: self.place == .indoor ? nil : self.metrics.distanceMeters,
                        cursor: self.healthKit.planCursorValue,
                        planMeters: self.metrics.distanceMeters
                    )
                    self.startStepTimer()
                    self.startLiveTimer()
                    // Splits passed while the app was gone are not replayed.
                    self.cuedSplits = WatchRunCues.completedSplits(
                        distanceMeters: recovery.metrics.distanceMeters,
                        usesMiles: self.usesMiles
                    )
                    self.lastSplitElapsed = resumedAt
                    self.phase = recovery.paused ? .paused : .running
                    completion(true)
                case .salvaged(let unscaled):
                    // The Health session was lost; the run itself was not.
                    let scale = Self.scale(for: unscaled.kind, place: unscaled.place)
                    var result = unscaled.scalingDistance(by: scale)
                    result.distanceScale = scale
                    // The snapshot stays until the message is durably queued.
                    if WatchSessionManager.shared.sendRunFinished(result) {
                        WatchRunSnapshotStore.clear()
                    }
                    self.kind = result.kind
                    self.place = result.place
                    self.metrics = result.metrics
                    self.summary = Summary(
                        kind: result.kind,
                        place: result.place,
                        elapsed: result.activeSeconds,
                        metrics: result.metrics,
                        saved: true
                    )
                    self.phase = .finished
                    completion(false)
                }
            }
        }
    }

    func pause() {
        guard phase == .running else { return }
        phase = .paused
        autoPaused = false
        healthKit.pause()
        cue(String(localized: "watch.run.cue.paused", defaultValue: "Paused."))
        pushLive(force: true)
    }

    func resume() {
        guard phase == .paused else { return }
        phase = .running
        autoPaused = false
        recentPace.reset()
        healthKit.resume()
        cue(String(localized: "watch.run.cue.resumed", defaultValue: "Resumed."))
        pushLive(force: true)
    }

    /// Says `text` when this run's voice cues are on, cutting off anything
    /// older: a pause or resume is about now.
    /// What follows a program workout that reached its last step, from the
    /// phone; nil for any other run or one stopped early.
    private func programDoneText(completed: Bool) -> String? {
        guard let plan, plan.programId != nil, completed else { return nil }
        return plan.doneText
    }

    private func cue(_ text: String) {
        guard settings.voiceCues else { return }
        WatchRunCues.shared.speak(text, interrupt: true)
    }

    /// Turns auto-pause on or off mid-run. Turning it off while it holds the
    /// run paused resumes the run: nothing else would.
    func setAutoPause(_ on: Bool) {
        guard phase == .running || phase == .paused, settings.autoPause != on else { return }
        settings.autoPause = on
        healthKit.updateSettings(settings)
        if !on && phase == .paused && autoPaused {
            resume()
        } else {
            pushLive(force: true)
        }
    }

    /// Turns voice cues on or off mid-run. Splits already passed are not
    /// spoken late: the split count keeps moving while cues are off.
    func setVoiceCues(_ on: Bool) {
        guard phase == .running || phase == .paused, settings.voiceCues != on else { return }
        settings.voiceCues = on
        healthKit.updateSettings(settings)
        if on {
            // Heard at once, so the wearer knows the speaker works.
            cue(String(localized: "watch.run.cue.voiceOn", defaultValue: "Voice cues on."))
        } else {
            WatchRunCues.shared.stop()
        }
        pushLive(force: true)
    }

    /// Turns the pace alert on (with the phone's pace range) or off mid-run.
    /// It cannot be turned on without a range, which is set on the phone.
    func setPaceAlert(_ on: Bool) {
        guard phase == .running || phase == .paused else { return }
        let band = on
            ? (settings.paceBand ?? CheckInStore.shared.context.runPaceBand
                ?? ((plan?.steps.contains { $0.pace != nil } ?? false) ? nil : WatchPaceBand.standard))
            : nil
        let stepsOff: Bool? = on ? nil : true
        guard settings.paceBand != band || settings.paceStepsOff != stepsOff else { return }
        settings.paceBand = band
        settings.paceStepsOff = stepsOff
        healthKit.updateSettings(settings)
        paceAlertState = .initial
        recentPace.reset()
        pushLive(force: true)
    }

    /// Turns the heart-rate alert on (with the phone's range) or off mid-run.
    func setHeartRateAlert(_ on: Bool) {
        guard phase == .running || phase == .paused else { return }
        let band = on
            ? (settings.heartRateBand ?? CheckInStore.shared.context.runHeartRateBand
                ?? ((plan?.steps.contains { $0.heartRate != nil } ?? false) ? nil : WatchHeartRateBand.standard))
            : nil
        let stepsOff: Bool? = on ? nil : true
        guard settings.heartRateBand != band || settings.heartRateStepsOff != stepsOff else { return }
        settings.heartRateBand = band
        settings.heartRateStepsOff = stepsOff
        healthKit.updateSettings(settings)
        heartRateAlertState = .initial
        pushLive(force: true)
    }

    /// Tells the wearer when the heart rate has stayed outside their range,
    /// the same way as the pace alert. A plan step's own range beats the run's.
    private func checkHeartRate(_ metrics: WatchRunMetrics) {
        guard phase == .running else { return }
        let elapsed = healthKit.elapsed
        var band = settings.heartRateBand
        var stepIndex: Int?
        if let plan, let position = currentPlanPosition(), !position.finished {
            stepIndex = position.index
            // Switching the alert off silences a step's own range too.
            if settings.heartRateStepsOff != true {
                band = plan.steps[position.index].heartRate ?? band
            }
        }
        if stepIndex != heartRateAlertStep {
            heartRateAlertStep = stepIndex
            heartRateAlertState = .initial
        }
        guard let band else { return }
        guard let alert = heartRateAlertState.step(bpm: metrics.heartRate, band: band, now: elapsed) else { return }
        Haptics.heartRate(tooHigh: alert == .tooHigh)
        cue(alert == .tooHigh ? String(localized: "watch.run.cue.hrHigh", defaultValue: "Heart rate high. Ease off.") : String(localized: "watch.run.cue.hrLow", defaultValue: "Heart rate low. Pick it up."))
    }

    /// Tells the wearer when the pace has stayed outside their range: a tap
    /// on the wrist, and the words when voice cues are on. A tap that points
    /// down means ease off, one that points up means speed up.
    private func checkPaceBand(_ metrics: WatchRunMetrics) {
        guard phase == .running else { return }
        let elapsed = healthKit.elapsed
        // A plan step's own range beats the run's; a step with none keeps the
        // run's range, if there is one.
        var band = settings.paceBand
        var stepIndex: Int?
        if let plan, let position = currentPlanPosition(), !position.finished {
            stepIndex = position.index
            if settings.paceStepsOff != true {
                band = plan.steps[position.index].pace ?? band
            }
        }
        // A new step starts the wait again.
        if stepIndex != paceAlertStep {
            paceAlertStep = stepIndex
            paceAlertState = .initial
        }
        let pace = recentPace.add(elapsed: elapsed, meters: metrics.distanceMeters)
        guard let band else { return }
        guard let alert = paceAlertState.step(pace: pace, band: band, now: elapsed) else { return }
        Haptics.pace(tooFast: alert == .tooFast)
        cue(alert == .tooFast ? String(localized: "watch.run.cue.tooFast", defaultValue: "Too fast. Ease off.") : String(localized: "watch.run.cue.tooSlow", defaultValue: "Too slow. Pick it up."))
    }

    /// Marks a lap at this moment; the phone cuts the saved route there.
    func lap() {
        guard phase == .running else { return }
        if healthKit.markLap() {
            lapCount = healthKit.lapCount
            Haptics.step()
            pushLive(force: true)
        }
    }

    /// Sends the phone's live view the current figures every couple of seconds
    /// while a run is going, and at once when its status changes.
    private func startLiveTimer() {
        stopLiveTimer()
        let timer = Timer(timeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.pushLive() }
        }
        RunLoop.main.add(timer, forMode: .common)
        liveTimer = timer
        pushLive(force: true)
    }

    private func stopLiveTimer() {
        liveTimer?.invalidate()
        liveTimer = nil
    }

    /// Whether the pace alert is on: a range for the run, or ranges on the
    /// plan's steps, unless the wearer switched it off.
    var paceAlertOn: Bool {
        guard settings.paceStepsOff != true else { return false }
        return settings.paceBand != nil || (plan?.steps.contains { $0.pace != nil } ?? false)
    }

    /// Likewise for the heart-rate alert.
    var heartRateAlertOn: Bool {
        guard settings.heartRateStepsOff != true else { return false }
        return settings.heartRateBand != nil || (plan?.steps.contains { $0.heartRate != nil } ?? false)
    }

    private func pushLive(force: Bool = false, ended: Bool = false) {
        guard ended || phase == .running || phase == .paused else { return }
        let elapsed = healthKit.elapsed
        let position = healthKit.planPosition()
        let step = (position?.finished ?? true) ? nil : position
        WatchSessionManager.shared.sendRunLive(
            OutboundPayloads.runLive(
                runId: healthKit.runId,
                kind: kind.rawValue,
                place: place.rawValue,
                status: ended ? "ended" : (phase == .paused ? "paused" : "running"),
                autoPaused: autoPaused,
                settings: settings,
                paceAlert: paceAlertOn,
                heartRateAlert: heartRateAlertOn,
                elapsed: elapsed,
                distanceMeters: metrics.distanceMeters,
                heartRate: metrics.heartRate,
                energyKcal: metrics.activeEnergyKcal,
                lapCount: lapCount,
                // A distance step has nothing for the phone to count down, so
                // its metres left ride in the label, refreshed with each update.
                stepLabel: step.map { step in
                    step.remainingMeters.map {
                        "\(step.label) · \(WatchRunPlan.distance($0, inMiles: step.inMiles))"
                    } ?? step.label
                },
                stepRemaining: step?.remainingMeters == nil ? step?.remaining : nil,
                nextLabel: step?.next,
                requestId: requestId
            ),
            force: force
        )
    }

    private func startStepTimer() {
        stopStepTimer()
        guard plan != nil || (settings.checkInMinutes ?? 0) > 0 || place == .outdoor else { return }
        let timer = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.cueStepIfDue()
                self?.cueCoachingIfDue()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        stepTimer = timer
        cueStepIfDue()
    }

    private func stopStepTimer() {
        stepTimer?.invalidate()
        stepTimer = nil
    }

    /// Announces a plan step when it begins: a tap, the words if Voice cues
    /// is on, and a lap mark so the saved run is cut at the step. Steps follow
    /// the builder's active clock and recorded distance, so a pause never eats
    /// into a step.
    private func cueStepIfDue() {
        guard phase == .running, let plan, let position = healthKit.planPosition() else { return }
        guard position.index != cuedStep else {
            cueToGoIfDue(plan, position)
            return
        }
        let first = cuedStep < 0
        cuedStep = position.index
        Haptics.step()
        if !first && !position.finished, healthKit.markLap(force: true) {
            lapCount = healthKit.lapCount
        }
        guard settings.voiceCues else { return }
        if position.finished {
            WatchRunCues.shared.speak(String(localized: "watch.run.cue.planComplete", defaultValue: "Plan complete."), interrupt: true)
        } else {
            // The first step of a program workout comes with its place in the
            // program, in one cue: a second would cut the first off.
            let planStep = plan.steps[position.index]
            let step = planStep.isDistance
                ? WatchRunCues.stepText(label: position.label, meters: planStep.meters ?? 0, inMiles: planStep.inMiles)
                : WatchRunCues.stepText(label: position.label, seconds: planStep.seconds)
            let intro = first ? plan.startText : nil
            WatchRunCues.shared.speak(intro.map { "\($0) \(step)" } ?? step, interrupt: true)
        }
    }

    /// Speaks the coaching cue that is due, if Voice cues is on: a ten-second
    /// warning before a step ends, halfway and the last minute of a plan, and
    /// the periodic check-in. At most one a tick; the rest are marked said.
    private func cueCoachingIfDue() {
        guard phase == .running else { return }
        let checkInMinutes = settings.checkInMinutes ?? 0
        guard plan != nil || checkInMinutes > 0 || place == .outdoor else { return }
        let elapsed = healthKit.elapsed
        // Indoors the distance is only an estimate, so no milestones there.
        let result = WatchCoaching.next(
            elapsed: elapsed,
            plan: plan,
            checkInMinutes: checkInMinutes,
            distanceMeters: place == .indoor ? nil : metrics.distanceMeters,
            cursor: plan == nil ? nil : healthKit.planCursorValue,
            planMeters: metrics.distanceMeters,
            state: coaching
        )
        coaching = result.state
        guard settings.voiceCues, let cue = result.cues.first else { return }
        switch cue {
        case .stepCountdown:
            // For this second only: it must not wait behind another cue.
            WatchRunCues.shared.speak(WatchRunCues.stepCountdownText, interrupt: true)
        case .milestone(let meters):
            WatchRunCues.shared.speak(WatchRunCues.milestoneText(meters: meters))
        case .stepWarning(let next):
            WatchRunCues.shared.speak(WatchRunCues.stepWarningText(next: next))
        case .lastMinute:
            WatchRunCues.shared.speak(WatchRunCues.lastMinuteText)
        case .halfway:
            WatchRunCues.shared.speak(WatchRunCues.halfwayText)
        case .checkIn:
            WatchRunCues.shared.speak(
                WatchRunCues.checkInText(
                    seconds: elapsed,
                    distanceMeters: place == .indoor ? nil : metrics.distanceMeters,
                    usesMiles: usesMiles
                )
            )
        }
    }

    /// "100 meters to go" (or "0.1 miles to go"), once per distance step long enough for it.
    private func cueToGoIfDue(_ plan: WatchRunPlan, _ position: WatchRunPlan.Position) {
        guard settings.voiceCues, !position.finished,
              position.index != toGoCuedStep,
              let left = position.remainingMeters, left > 0,
              left <= WatchRunCues.toGoMeters(inMiles: position.inMiles),
              (plan.steps[position.index].meters ?? 0) >= WatchRunCues.toGoMinimumStep
        else { return }
        toGoCuedStep = position.index
        WatchRunCues.shared.speak(WatchRunCues.toGoText(inMiles: position.inMiles), interrupt: true)
    }

    /// Where the plan stands now, for the run screen.
    func currentPlanPosition() -> WatchRunPlan.Position? {
        healthKit.planPosition()
    }

    private var usesMiles: Bool {
        CheckInStore.shared.context.distanceUnit == "miles"
    }

    /// Buzzes at each whole km or mile, and speaks it when this run's Voice
    /// cues switch is on. Only the latest of several passed at once is spoken.
    private func cueSplitIfDue(_ metrics: WatchRunMetrics) {
        guard phase == .running else { return }
        let done = WatchRunCues.completedSplits(distanceMeters: metrics.distanceMeters, usesMiles: usesMiles)
        guard done > cuedSplits else { return }
        let passed = done - cuedSplits
        let now = healthKit.elapsed
        let perSplit = max(1, (now - lastSplitElapsed) / Double(passed))
        cuedSplits = done
        lastSplitElapsed = now
        Haptics.step()
        if settings.voiceCues {
            WatchRunCues.shared.speak(
                WatchRunCues.splitText(number: done, seconds: perSplit, usesMiles: usesMiles)
            )
        }
    }

    private func applyAutoPause(_ action: WatchAutoPause.Action) {
        switch action {
        case .pause:
            guard phase == .running, settings.autoPause else { return }
            phase = .paused
            autoPaused = true
            healthKit.pause(automatic: true)
            WKInterfaceDevice.current().play(.stop)
            cue(String(localized: "watch.run.cue.autoPaused", defaultValue: "Auto-paused."))
            pushLive(force: true)
        case .resume:
            guard phase == .paused, autoPaused else { return }
            phase = .running
            autoPaused = false
            healthKit.resume()
            WKInterfaceDevice.current().play(.start)
            cue(String(localized: "watch.run.cue.resumed", defaultValue: "Resumed."))
            pushLive(force: true)
        case .none:
            break
        }
    }

    /// Ends the recording and saves it to Apple Health.
    func finish() { end(save: true) }

    /// Ends the recording and writes nothing to Apple Health.
    func discard() { end(save: false) }

    func dismissSummary() {
        stopStepTimer()
        stopLiveTimer()
        requestId = nil
        plan = nil
        lapCount = 0
        autoPaused = false
        summary = nil
        phase = .idle
    }

    private func end(save: Bool) {
        guard phase == .running || phase == .paused else { return }
        stopStepTimer()
        stopLiveTimer()
        // Finish tapped while the Health prompts were still up: nothing was
        // ever recorded, so there is nothing to save.
        guard healthKit.hasLiveSession else {
            autoPaused = false
            requestId = nil
            plan = nil
            phase = .idle
            return
        }
        let ending = kind
        let endingPlace = place
        autoPaused = false
        pushLive(force: true, ended: true)
        stopLiveTimer()
        let scale = distanceScale
        healthKit.end(save: save) { [weak self] metrics, elapsed, result in
            Task { @MainActor in
                guard let self else { return }
                self.metrics = metrics.scaled(scale)
                var scaled = result?.scalingDistance(by: scale)
                scaled?.distanceScale = scale
                // Indoors the wearer is asked for the treadmill's distance
                // first (the program's done cue waits for `confirmDistance`, so it
                // is heard once, in the finish cue); the snapshot stays until the answer is sent, so a
                // relaunch in between still delivers the run.
                if save, endingPlace == .indoor, let scaled {
                    self.pendingResult = scaled
                    self.pendingElapsed = elapsed
                    self.phase = .confirmingDistance
                    return
                }
                // The finish cue goes out before the run is handed to the phone:
                // the phone starts filing the run the moment it arrives, and a
                // cue that reaches it behind that work is confirmed late, so the
                // watch gave up waiting and said the cue too (heard twice).
                if save {
                    let finished = WatchRunCues.finishText(
                        title: ending.title(endingPlace),
                        distanceMeters: metrics.distanceMeters,
                        seconds: elapsed,
                        usesMiles: self.usesMiles
                    )
                    self.cue(self.programDoneText(completed: scaled?.planCompleted ?? false).map { "\(finished) \($0)" } ?? finished)
                }
                // The Health workout is stamped so the phone's import skips
                // it; this message is how the run reaches the diary.
                if let scaled, WatchSessionManager.shared.sendRunFinished(scaled) {
                    // Only once the message is durably queued (handed to the system,
                    // or written until the session activates) is the snapshot
                    // no longer needed.
                    WatchRunSnapshotStore.clear()
                } else if scaled == nil {
                    WatchRunSnapshotStore.clear()
                }
                if save {
                    self.summary = Summary(kind: ending, place: endingPlace, elapsed: elapsed, metrics: metrics, saved: true)
                    self.phase = .finished
                } else {
                    self.requestId = nil
                    self.plan = nil
                    self.phase = .idle
                }
            }
        }
    }

    /// Answers the treadmill question: `meters` is what the machine showed,
    /// or nil to keep the watch's figure. Sends the run to the phone either
    /// way, then shows the summary.
    func confirmDistance(_ meters: Double?) {
        guard phase == .confirmingDistance, var result = pendingResult else { return }
        let shown = result.metrics.distanceMeters
        if let meters, meters > 0 {
            result.estimatedDistanceMeters = shown
            result = result.scalingDistance(by: shown > 0 ? meters / shown : 1)
            // A watch that measured nothing still takes the machine's figure.
            result.metrics.distanceMeters = meters
        }
        pendingResult = nil
        // Say the finish once the distance is settled (the machine's figure, if
        // given), and before the run is handed to the phone, as on the other
        // finish path: a cue confirmed behind the phone's filing is heard twice.
        let finished = WatchRunCues.finishText(
            title: result.kind.title(result.place),
            distanceMeters: result.metrics.distanceMeters,
            seconds: pendingElapsed,
            usesMiles: usesMiles
        )
        cue(programDoneText(completed: result.planCompleted).map { "\(finished) \($0)" } ?? finished)
        // The snapshot stays until the message is durably queued.
        if WatchSessionManager.shared.sendRunFinished(result) {
            WatchRunSnapshotStore.clear()
        }
        metrics = result.metrics
        summary = Summary(kind: result.kind, place: result.place, elapsed: pendingElapsed, metrics: result.metrics, saved: true)
        phase = .finished
    }

    /// The learned indoor factor for a new run; outdoors the GPS needs none.
    private static func scale(for kind: WatchRunKind, place: WatchRunPlace) -> Double {
        guard place == .indoor else { return 1 }
        return CheckInStore.shared.context.indoorDistanceScale?.factor(for: kind) ?? 1
    }

    private func sessionFailed(_ result: WatchRunResult?) {
        guard phase == .running || phase == .paused else { return }
        stopStepTimer()
        stopLiveTimer()
        autoPaused = false
        guard let result else {
            requestId = nil
            plan = nil
            phase = .idle
            return
        }
        // The Health session failed, but the run was recorded: send it on.
        var scaled = result.scalingDistance(by: distanceScale)
        scaled.distanceScale = distanceScale
        // Keep the snapshot when the message could not be queued yet.
        if WatchSessionManager.shared.sendRunFinished(scaled) {
            WatchRunSnapshotStore.clear()
        }
        metrics = scaled.metrics
        summary = Summary(
            kind: result.kind,
            place: result.place,
            elapsed: result.activeSeconds,
            metrics: scaled.metrics,
            saved: true
        )
        phase = .finished
    }
}
