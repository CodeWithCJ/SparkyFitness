import Foundation

/// One set the phone expects for an exercise, as planned before the workout
/// started — target reps/weight, not what actually gets logged. The watch
/// shows these as the starting values in its editable fields, the same
/// "assumed values" pattern the phone's own active-workout screen uses.
struct PlannedSet: Codable, Equatable, Identifiable {
    /// The server-assigned exercise_entry_sets id, stringified — this is
    /// exactly `WorkoutStep.setId` on the phone (`activeWorkoutStore.ts`), so
    /// echoing it back in `setCompleted` lets the phone call its own
    /// `completeSet(setId)` unchanged.
    let setId: String
    let targetReps: Double?
    /// Always kg, like every other weight value this app moves between watch
    /// and phone — display converts via `CheckInStore`'s `effectiveWeightUnit`.
    let targetWeightKg: Double?
    /// Rest to run after this set, in seconds — the phone's own
    /// `WorkoutStep.restSec` (activeWorkoutStore.ts), carried over verbatim so
    /// the watch's timer agrees with what the phone would have shown.
    let restSeconds: Int
    /// `normal`, `warmup`, `drop`… straight from `exercise_entry_sets.set_type`.
    /// Drives the label above the values ("Warmup 1/2" rather than "Set 1/2");
    /// nil or an unrecognised value just reads as a normal set.
    let setType: String?
    /// Hold length in seconds. Nil on a reps set. The watch counts this down
    /// instead of offering a reps box.
    var targetDurationSec: Int? = nil
    /// Last session's time for this set, shown in gray on an idle stopwatch.
    var previousDurationSec: Int? = nil
    /// A duration exercise. With no `targetDurationSec` the watch shows a
    /// stopwatch instead of a reps box. Nil from a phone that predates it.
    var timed: Bool? = nil
    /// A weighted carry: weight and distance, no reps. The watch shows a
    /// distance box (metres) in place of the reps box.
    var carry: Bool? = nil
    /// Planned carry distance in km.
    var targetDistanceKm: Double? = nil
    /// A loaded hold: the weight box stays beside the timer even when no
    /// weight is planned yet.
    var weighted: Bool? = nil

    var id: String { setId }
}

/// One exercise in the started plan, with its own sets in order.
struct PlannedExercise: Codable, Equatable, Identifiable {
    /// The exercise_entries id — what a `heartRateBatch` for this exercise
    /// names, so the phone can attach the series to the right entry.
    let exerciseEntryId: String
    let name: String
    /// Index of the valid superset run, shared with its partners. Nil when
    /// this exercise is on its own. The phone only sets it for an adjacent
    /// run of two or more, so the watch does not repeat that rule.
    let supersetRun: Int?
    /// A bodyweight exercise: its weight is a signed change to body weight
    /// (+ added, − assisted). Optional so a snapshot saved before this existed
    /// still decodes, and an older phone that never sends it reads as false.
    var bodyweight: Bool? = nil
    let sets: [PlannedSet]

    var id: String { exerciseEntryId }
}

/// The workout the phone armed the watch with. Sent once, in full, at the
/// start of the session. Its set targets are the values known at that moment;
/// later `setTargets` messages replace them (see
/// `WorkoutSessionStore.targetOverrides`) without re-sending the plan.
struct ActiveWorkoutPlan: Codable, Equatable {
    /// The live-workout session id (`activeWorkoutStore.sessionId` on the
    /// phone) — every message about this workout carries it, so the phone
    /// can ignore a stale message from a session it has already cleared.
    let sessionId: String
    let workoutName: String
    let exercises: [PlannedExercise]
    /// Phone cursor order (set ids), including interleaved supersets. Empty
    /// means "flatten each exercise in library order", the pre-setOrder shape.
    let setOrder: [String]
    /// `standard` or nil for an ordinary set workout. `amrap`, `emom`,
    /// `tabata`, or `for_time` when the phone started an interval session.
    let workoutFormat: String?
    /// Cap for the interval, in seconds. Nil when the format has none.
    let timeCapSeconds: Int?
    /// When the phone started the session. Used only when `capEndsAt` is absent.
    let startedAt: Date?
    /// When this arm was sent. A later arm of the same session id is a new
    /// workout; a start at or before the stop is a queued duplicate.
    let armedAt: Date?
    /// When the cap reaches 0:00, already past the phone's countdown.
    /// Pauses add to this instead of being subtracted from `startedAt`.
    let capEndsAt: Date?
    /// Set while the phone interval is paused. The caption freezes here.
    let pausedAt: Date?
    /// Seconds already paused and then resumed. Not counted against the cap.
    let excludedPauseSeconds: Int?
    /// Phone's pause/resume counter. A lower number is an older message.
    let intervalRevision: Int?
    /// The workout was started from a saved one, so Finish asks whether to
    /// update it when the exercises or sets changed. Nil from an older phone.
    let fromPreset: Bool?

    init(
        sessionId: String,
        workoutName: String,
        exercises: [PlannedExercise],
        setOrder: [String] = [],
        workoutFormat: String? = nil,
        timeCapSeconds: Int? = nil,
        startedAt: Date? = nil,
        armedAt: Date? = nil,
        capEndsAt: Date? = nil,
        pausedAt: Date? = nil,
        excludedPauseSeconds: Int? = nil,
        intervalRevision: Int? = nil,
        fromPreset: Bool? = nil
    ) {
        self.sessionId = sessionId
        self.workoutName = workoutName
        self.exercises = exercises
        self.setOrder = setOrder
        self.workoutFormat = workoutFormat
        self.timeCapSeconds = timeCapSeconds
        self.startedAt = startedAt
        self.armedAt = armedAt
        self.capEndsAt = capEndsAt
        self.pausedAt = pausedAt
        self.excludedPauseSeconds = excludedPauseSeconds
        self.intervalRevision = intervalRevision
        self.fromPreset = fromPreset
    }
}

extension ActiveWorkoutPlan {
    /// Entry id to the other member names. A run of one is not a superset,
    /// even if the phone sent an index for it.
    func supersetPartners() -> [String: String] {
        var grouped: [Int: [PlannedExercise]] = [:]
        for exercise in exercises {
            guard let run = exercise.supersetRun else { continue }
            grouped[run, default: []].append(exercise)
        }
        var partners: [String: String] = [:]
        for members in grouped.values where members.count >= 2 {
            for member in members {
                let others = members
                    .filter { $0.exerciseEntryId != member.exerciseEntryId }
                    .map(\.name)
                if !others.isEmpty {
                    partners[member.exerciseEntryId] = others.joined(separator: ", ")
                }
            }
        }
        return partners
    }
}

/// One set of one exercise, as a position in the workout's flat running order.
///
/// The watch shows a single set at a time and pages through them, so it walks
/// a flattened sequence rather than a list of exercises — the same shape the
/// phone's `buildStepsFromSession` produces, which is what keeps the two
/// cursors talking about the same thing.
struct WorkoutStep: Identifiable, Equatable {
    let exerciseEntryId: String
    let exerciseName: String
    /// Named `plannedSet` rather than `set`: inside a computed property's
    /// braces Swift reads a leading `set` as the start of a setter clause, so
    /// `var id: String { set.setId }` fails to parse.
    let plannedSet: PlannedSet
    /// 1-based position of this set within its own exercise, and how many
    /// that exercise has — the "1/2" in "Warmup 1/2".
    let setNumber: Int
    let setCount: Int
    /// The other exercises in this set's superset, for the one-line caption.
    /// Nil when the set is not part of a superset.
    let supersetWith: String?
    /// Same index as `PlannedExercise.supersetRun`. Nil when this set is not
    /// in a superset, so the caption and its colour share one source.
    let supersetRun: Int?

    var id: String { plannedSet.setId }

    /// "Warmup 1/2" / "Set 2/3" — what sits under the exercise name.
    var label: String {
        let kind: String
        switch plannedSet.setType?.lowercased() {
        case "warmup": kind = "Warmup"
        case "drop": kind = "Drop"
        case "failure": kind = "Failure"
        default: kind = "Set"
        }
        return "\(kind) \(setNumber)/\(setCount)"
    }
}

/// Totals shown on the watch once a workout is finished.
struct WorkoutSummary: Equatable {
    let durationSeconds: Int
    let setsCompleted: Int
    let volumeKg: Double
    let averageBpm: Double?
    let maxBpm: Double?
    let activeEnergyKcal: Double?
    /// The workout it describes, so a question the phone asks about it can be
    /// matched to this summary and not to a later one.
    var sessionId: String? = nil
}

/// What the wearer actually did for a set, once they have adjusted the
/// targets. Absent fields mean "unchanged from target" — the watch only
/// records an override when a value is edited.
struct SetValues: Codable, Equatable {
    var weightKg: Double?
    var reps: Double?
    /// Hold length from a later `setTargets` update, in seconds. Nil leaves
    /// the plan's `targetDurationSec`.
    var durationSec: Int? = nil
    /// Last session's time from a `setTargets` update, in seconds.
    var previousDurationSec: Int? = nil
    /// A carry's distance in km. Nil leaves the plan's value.
    var distanceKm: Double? = nil
}

/// The phone's rest timer, as carried by a `setTargets` update.
enum PhoneRest: Codable, Equatable {
    /// Counting down to `endsAt`.
    case resting(endsAt: Date, durationSeconds: Int)
    /// Paused on the phone. The watch freezes its countdown until the phone
    /// resumes (a new `.resting` deadline) or ends it.
    case paused
    /// No rest: skipped, run out, or never started.
    case ready
}

/// One completed set, as reported to the phone. `setId` must be one of the
/// ids `ActiveWorkoutPlan` supplied — the phone looks it up in its own
/// session rather than trusting anything else about it.
///
/// Carries the values too, because the watch is where they were typed: the
/// phone applies them with `updateSetField` before `completeSet`, so a set
/// logged from the wrist records what the wearer actually lifted rather than
/// the plan's guess.
struct CompletedSet: Codable, Equatable {
    /// Generated on the watch so a queued transfer delivered twice can be
    /// recognised and ignored — same role `CheckIn.id` plays for check-ins.
    let clientId: String
    let sessionId: String
    let setId: String
    let weightKg: Double?
    let reps: Double?
    /// Seconds the hold countdown ran. Nil when it was never started.
    var duration: Int? = nil
    /// A carry's distance in km, entered in metres on the watch.
    var distanceKm: Double? = nil
    /// Effort (6 to 10) the wearer picked. Nil when skipped.
    var rpe: Double? = nil
    /// When the wearer tapped the set, not when the phone received it.
    let completedAt: Date
}

/// One heart-rate reading captured during the workout.
struct HeartRateSample: Codable, Equatable {
    /// ISO 8601 instant.
    let t: String
    let bpm: Double
}

/// A batch of heart-rate samples for one exercise, tagged with whichever
/// exercise was showing on screen when they were captured. Batched (rather
/// than one message per sample) to keep the transfer rate sane over a
/// multi-minute set; tagging by exercise here means the phone never has to
/// reconstruct per-exercise windows from timestamps alone.
struct HeartRateBatch: Codable, Equatable {
    /// Generated on the watch so a queued `transferUserInfo` delivered twice
    /// can be recognised and ignored — same role `CompletedSet.clientId`
    /// plays for sets. Without it a redelivery adds the energy delta again.
    let clientId: String
    let sessionId: String
    let exerciseEntryId: String
    let samples: [HeartRateSample]
    /// Active energy burned since the previous batch, in kcal — a DELTA
    /// rather than the running total `WorkoutSessionStore.activeEnergyKcal`
    /// holds. Sending deltas means the phone can attribute each one to
    /// whichever exercise was on screen and still have them sum to the real
    /// workout total; a running total would have to be differenced somewhere,
    /// and doing it here keeps that arithmetic next to the reading.
    let activeEnergyKcal: Double?
    /// Minutes the wearer has spent on this exercise so far, including rest
    /// between its sets. Sent when the exercise is left and again at the end.
    /// Cumulative across return visits. Nil on a batch that is only samples.
    let durationMinutes: Double?
}

/// The wearer ended the workout on the watch. Carries no data of its own —
/// per-set completions and heart rate already arrived as they happened, so
/// this is purely "stop expecting more" and the signal to flush.
struct WorkoutStopSignal: Codable, Equatable {
    let sessionId: String
}
