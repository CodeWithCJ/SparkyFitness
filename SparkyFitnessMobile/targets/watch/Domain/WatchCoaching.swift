import Foundation

/// What a run's coach has already said, so a cue is never repeated. Not saved
/// with the run: after a relaunch it is rebuilt from the clock (`resumed`),
/// which counts everything already passed as said.
struct WatchCoachingState: Equatable {
    var checkIns = 0
    var warnedStep = -1
    var halfway = false
    var lastMinute = false
    var countdownStep = -1
    var milestones = 0

    /// The state for a run picked up again at `elapsed`: whatever has already
    /// passed is treated as said.
    static func resumed(
        at elapsed: TimeInterval,
        plan: WatchRunPlan?,
        checkInMinutes: Int,
        distanceMeters: Double? = nil,
        cursor: WatchRunPlan.Cursor? = nil,
        planMeters: Double = 0
    ) -> WatchCoachingState {
        var state = WatchCoachingState()
        if checkInMinutes > 0 {
            state.checkIns = Int(elapsed / Double(checkInMinutes * 60))
        }
        if let distanceMeters {
            state.milestones = WatchCoaching.raceMilestonesMeters.filter { distanceMeters >= $0 }.count
        }
        if let plan {
            let total = plan.totalSeconds
            let position = cursor.flatMap { plan.position(cursor: $0, elapsed: elapsed, meters: planMeters) }
                ?? plan.position(at: elapsed)
            if let position {
                state.warnedStep = position.finished ? plan.steps.count : position.index - 1
                state.countdownStep = state.warnedStep
                if !position.finished, !plan.steps[position.index].isDistance,
                   position.remaining <= WatchCoaching.stepWarningSeconds,
                   plan.steps[position.index].seconds >= WatchCoaching.minWarnedStepSeconds {
                    state.warnedStep = position.index
                }
            }
            // A plan with a distance step has no fixed length: no halfway or
            // last-minute call for it, so none is left to repeat.
            state.halfway = plan.hasDistanceSteps || elapsed >= total / 2
            state.lastMinute = plan.hasDistanceSteps || total - elapsed <= 60
        }
        return state
    }
}

enum WatchCoachingCue: Equatable {
    case stepCountdown
    case stepWarning(next: String?)
    case milestone(meters: Double)
    case lastMinute
    case halfway
    case checkIn(minutes: Int)
}

/// Swift port of `nextCoachingCues` in `src/utils/coachingCues.ts`; the
/// constants and the order of the cues must stay in step with it.
enum WatchCoaching {
    static let stepWarningSeconds = 10.0
    static let stepCountdownSeconds = 3.0
    static let minWarnedStepSeconds = 30.0
    /// 5K, 10K, a half marathon and a marathon, whatever the unit.
    static let raceMilestonesMeters: [Double] = [5000, 10000, 21097.5, 42195]
    static let minHalfwayPlanSeconds = 5.0 * 60
    static let minLastMinutePlanSeconds = 3.0 * 60

    /// The cues due at `elapsed` (most important first) and the state after
    /// them. The caller speaks the first; the rest are marked said.
    static func next(
        elapsed: TimeInterval,
        plan: WatchRunPlan?,
        checkInMinutes: Int,
        distanceMeters: Double? = nil,
        cursor: WatchRunPlan.Cursor? = nil,
        planMeters: Double = 0,
        state: WatchCoachingState
    ) -> (cues: [WatchCoachingCue], state: WatchCoachingState) {
        var state = state
        var cues: [WatchCoachingCue] = []

        if let plan {
            let position = cursor.flatMap { plan.position(cursor: $0, elapsed: elapsed, meters: planMeters) }
                ?? plan.position(at: elapsed)
            // A distance step ends on distance, not time: it has its own "to go" cue.
            if let position, !position.finished,
               !plan.steps[position.index].isDistance,
               plan.steps[position.index].seconds >= minWarnedStepSeconds,
               position.remaining <= stepCountdownSeconds,
               position.index > state.countdownStep {
                cues.append(.stepCountdown)
                // The countdown is the more urgent: the ten-second warning is stale.
                state.countdownStep = position.index
                state.warnedStep = max(state.warnedStep, position.index)
            }
            if let position, !position.finished,
               !plan.steps[position.index].isDistance,
               plan.steps[position.index].seconds >= minWarnedStepSeconds,
               position.remaining <= stepWarningSeconds,
               position.index > state.warnedStep {
                let next = position.index + 1 < plan.steps.count ? plan.steps[position.index + 1].label : nil
                cues.append(.stepWarning(next: next))
                state.warnedStep = position.index
            }
            // Its length is only a guess when a step ends on distance.
            let total = plan.hasDistanceSteps ? 0 : plan.totalSeconds
            if !state.lastMinute, total >= minLastMinutePlanSeconds, elapsed < total, total - elapsed <= 60 {
                cues.append(.lastMinute)
                state.lastMinute = true
            }
            if !state.halfway, total >= minHalfwayPlanSeconds, elapsed >= total / 2, elapsed < total {
                cues.append(.halfway)
                state.halfway = true
            }
        }

        if let distanceMeters, distanceMeters > 0 {
            let passed = raceMilestonesMeters.filter { distanceMeters >= $0 }.count
            if passed > state.milestones {
                // Several at once (a gap in the fixes): say only the furthest.
                cues.append(.milestone(meters: raceMilestonesMeters[passed - 1]))
                state.milestones = passed
            }
        }

        if checkInMinutes > 0 {
            let due = Int(elapsed / Double(checkInMinutes * 60))
            if due > state.checkIns {
                cues.append(.checkIn(minutes: due * checkInMinutes))
                state.checkIns = due
            }
        }
        return (cues, state)
    }
}
