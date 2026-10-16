#if DEBUG
import Foundation

/// A realistic day's worth of data, for Xcode previews.
///
/// Exists because the pages read everything through `CheckInStore`, and a
/// preview backed by the real store shows an empty one: the canvas runs in its
/// own process with its own empty `UserDefaults`, so every page renders its
/// "not synced yet" state — the single layout that doesn't need checking.
///
/// Deliberately mid-day rather than tidy: calories over goal, macros at
/// different fractions, an odd number of water logs. Round numbers and
/// half-full bars hide the layout problems worth catching — a minus sign that
/// doesn't fit, a container name that truncates, a percentage that wraps.
///
/// `#if DEBUG` so none of this reaches a release build.
enum SampleDay {

    /// Today, so every `isToday` guard in the app passes and the pages render
    /// their populated state rather than the stale-day fallback.
    static var today: String { CheckInDate.today() }

    // MARK: - Water

    static let containers: [WaterContainer] = [
        WaterContainer(id: 1, name: "Glass", servingVolumeMl: 250, unit: "ml"),
        WaterContainer(id: 2, name: "Bottle", servingVolumeMl: 500, unit: "ml"),
        // A deliberately long name: this is the one that truncates first on a
        // 40mm, which is exactly what a preview should surface.
        WaterContainer(id: 3, name: "Large flask", servingVolumeMl: 750, unit: "ml"),
    ]

    static let waterLog: [WaterLogEntry] = [
        WaterLogEntry(id: "w3", name: "Bottle", volumeMl: 500, time: "14:20"),
        WaterLogEntry(id: "w2", name: "Glass", volumeMl: 250, time: "11:05"),
        WaterLogEntry(id: "w1", name: "Large flask", volumeMl: 750, time: "08:40"),
    ]

    static let water = WaterSnapshot(
        day: today,
        consumedMl: 1500,
        log: waterLog
    )

    // MARK: - Nutrition

    /// Over the calorie goal on purpose, so the preview shows the signed value
    /// and the "Kcal over" caption rather than the happy path.
    static let nutrition = NutritionSnapshot(
        day: today,
        caloriesConsumed: 2154,
        caloriesBurned: 788,
        caloriesRemaining: -254,
        calorieProgress: 1,
        carbs: MacroGoal(consumed: 136, goal: 150, progress: 0.91),
        fat: MacroGoal(consumed: 66, goal: 60, progress: 1),
        protein: MacroGoal(consumed: 112, goal: 179, progress: 0.63),
        // The macros plus two the wearer added in Settings → Apple Watch: one
        // with a goal and one without, the two ways a row can draw.
        rows: [
            NutrientRow(key: "protein", label: "Protein", unit: "g", consumed: 112, goal: 179, progress: 0.63),
            NutrientRow(key: "carbs", label: "Carbs", unit: "g", consumed: 136, goal: 150, progress: 0.91),
            NutrientRow(key: "fat", label: "Fat", unit: "g", consumed: 66, goal: 60, progress: 1),
            NutrientRow(key: "dietary_fiber", label: "Fiber", unit: "g", consumed: 21, goal: 30, progress: 0.7),
            NutrientRow(key: "sodium", label: "Sodium", unit: "mg", consumed: 1840, goal: nil, progress: 0),
        ]
    )

    // MARK: - Weight history

    /// A fortnight with a gap in it — a skipped day is normal and the chart
    /// has to look right with one.
    static var history: [HistoryPoint] {
        let weights: [Double?] = [
            82.4, 82.1, 82.3, nil, 81.9, 81.6, 81.8,
            81.4, 81.5, nil, 81.1, 80.9, 81.0, 80.7,
        ]
        return weights.enumerated().compactMap { offset, weight in
            guard let weight else { return nil }
            guard let date = Calendar.current.date(
                byAdding: .day,
                value: offset - (weights.count - 1),
                to: Date()
            ) else { return nil }
            return HistoryPoint(
                day: CheckInDate.formatter.string(from: date),
                weightKg: weight,
                bodyFatPercentage: 19.5 - Double(offset) * 0.05
            )
        }
    }

    // MARK: - Whole context

    static var context: WatchContext {
        WatchContext(
            today: today,
            todayWeightKg: 80.7,
            todayBodyFatPercentage: 18.8,
            lastWeightKg: 81.0,
            lastBodyFatPercentage: 18.9,
            lastEntryDate: today,
            history: history,
            ackedClientIds: [],
            failedClientIds: [],
            updatedAt: Date(),
            weightUnit: .kg,
            nutrition: nutrition,
            water: water,
            waterContainers: containers,
            waterGoalMl: 2500,
            waterDisplayUnit: "liter",
            generatedAt: Date(),
            hapticsEnabled: true,
            restAlertsEnabled: true,
            pageOrder: nil,
            hiddenPages: nil,
            setInputStyle: nil,
            startableWorkouts: startableWorkouts,
            scheduledWorkouts: scheduledWorkouts,
            suggestedExercises: suggestedExercises
        )
    }

    /// For Add Exercise during a workout.
    static let suggestedExercises = [
        SuggestedExercise(exerciseId: "ex-1", name: "Bench Press"),
        SuggestedExercise(exerciseId: "ex-2", name: "Lat Pulldown"),
        SuggestedExercise(exerciseId: "ex-3", name: "Back Squat"),
        SuggestedExercise(exerciseId: "ex-4", name: "Overhead Press"),
    ]

    /// What the active plan puts on today, for the top of the workout picker.
    static let scheduledWorkouts = [
        ScheduledWorkout(
            presetId: "sample-2",
            name: "Day 1 — Push (5 Day)",
            planName: "main",
            caption: "Scheduled Today"
        ),
    ]

    /// The saved workouts the idle workout page offers. Names run from one
    /// word to a two-line one, since the picker has to wrap on a 40mm.
    static let startableWorkouts = [
        StartableWorkout(presetId: "sample-1", name: "2. Back and Biceps"),
        StartableWorkout(presetId: "sample-2", name: "Day 1 — Push (5 Day)"),
        StartableWorkout(presetId: "sample-3", name: "Day 1: Lower (3 Day)"),
        StartableWorkout(presetId: "sample-4", name: "Legs"),
    ]

    /// The state before the phone has ever synced — the other layout worth
    /// checking, since it's what a new install and a phone-free morning show.
    static var emptyContext: WatchContext { .empty }

    // MARK: - Workout

    /// A three-exercise session as the phone would push it.
    ///
    /// Deliberately uneven, for the same reason the water containers above
    /// are: an exercise name long enough to truncate on a 40mm, a bodyweight
    /// movement with no target weight, and rest that varies per set. A tidy
    /// plan of three identical exercises hides exactly the layout problems a
    /// preview is for.
    static let workoutPlan = ActiveWorkoutPlan(
        sessionId: "preview-session",
        workoutName: "Push Day",
        exercises: [
            PlannedExercise(
                exerciseEntryId: "preview-ex-1",
                name: "Barbell Bench Press",
                supersetRun: 0,
                sets: [
                    // A warmup first, so the label above the values is
                    // exercised rather than always reading "Set n/m".
                    PlannedSet(setId: "1", targetReps: 10, targetWeightKg: 40, restSeconds: 60, setType: "warmup"),
                    PlannedSet(setId: "2", targetReps: 8, targetWeightKg: 70, restSeconds: 90, setType: "normal"),
                    // A fractional load: plate maths lands on 2.5s, and the
                    // value box has to fit "82.5" without truncating.
                    PlannedSet(setId: "3", targetReps: 6, targetWeightKg: 82.5, restSeconds: 120, setType: "normal"),
                ]
            ),
            PlannedExercise(
                exerciseEntryId: "preview-ex-2",
                name: "Incline Dumbbell Shoulder Press",
                supersetRun: 0,
                sets: [
                    PlannedSet(setId: "4", targetReps: 12, targetWeightKg: 22.5, restSeconds: 60, setType: "normal"),
                    PlannedSet(setId: "5", targetReps: 12, targetWeightKg: 22.5, restSeconds: 60, setType: "normal"),
                ]
            ),
            PlannedExercise(
                exerciseEntryId: "preview-ex-3",
                name: "Press-ups",
                supersetRun: nil,
                sets: [
                    // Bodyweight: no target weight at all, so the KG box has
                    // to render its empty state.
                    PlannedSet(setId: "6", targetReps: 15, targetWeightKg: nil, restSeconds: 45, setType: "normal"),
                ]
            ),
        ],
        setOrder: []
    )

    /// A loaded hold with a countdown, then a plain hold: the timer card beside
    /// the weight card.
    static let timedPlan = ActiveWorkoutPlan(
        sessionId: "preview-timed",
        workoutName: "Core",
        exercises: [
            PlannedExercise(
                exerciseEntryId: "preview-timed-1",
                name: "Weighted Plank",
                supersetRun: nil,
                sets: [
                    PlannedSet(setId: "t1", targetReps: nil, targetWeightKg: 10, restSeconds: 60, setType: "normal", targetDurationSec: 45, weighted: true),
                    PlannedSet(setId: "t2", targetReps: nil, targetWeightKg: 10, restSeconds: 60, setType: "normal", targetDurationSec: 45, weighted: true),
                ]
            ),
            PlannedExercise(
                exerciseEntryId: "preview-timed-2",
                name: "Side Plank",
                supersetRun: nil,
                sets: [
                    PlannedSet(setId: "t3", targetReps: nil, targetWeightKg: nil, restSeconds: 45, setType: "normal", targetDurationSec: 30),
                ]
            ),
        ],
        setOrder: []
    )

    /// A hold with no planned length, so the stopwatch shows, with last
    /// session's time in grey.
    static let stopwatchPlan = ActiveWorkoutPlan(
        sessionId: "preview-stopwatch",
        workoutName: "Pull Day",
        exercises: [
            PlannedExercise(
                exerciseEntryId: "preview-stopwatch-1",
                name: "Dead Hang",
                supersetRun: nil,
                sets: [
                    PlannedSet(setId: "w1", targetReps: nil, targetWeightKg: nil, restSeconds: 60, setType: "normal", previousDurationSec: 52, timed: true),
                    PlannedSet(setId: "w2", targetReps: nil, targetWeightKg: nil, restSeconds: 60, setType: "normal", previousDurationSec: 48, timed: true),
                ]
            ),
        ],
        setOrder: []
    )

    /// An AMRAP the phone started a couple of minutes ago, for the caption.
    static var intervalPlan: ActiveWorkoutPlan {
        ActiveWorkoutPlan(
            sessionId: "preview-interval",
            workoutName: "Conditioning",
            exercises: [
                PlannedExercise(
                    exerciseEntryId: "preview-interval-1",
                    name: "Kettlebell Swing",
                    supersetRun: nil,
                    sets: [
                        PlannedSet(setId: "i1", targetReps: 15, targetWeightKg: 16, restSeconds: 0, setType: "normal"),
                        PlannedSet(setId: "i2", targetReps: 15, targetWeightKg: 16, restSeconds: 0, setType: "normal"),
                    ]
                ),
            ],
            setOrder: [],
            workoutFormat: "amrap",
            timeCapSeconds: 600,
            startedAt: Date().addingTimeInterval(-130)
        )
    }

    /// A plausible working heart rate mid-set. Only ever visible in a preview
    /// or on a real wrist — the simulator has no sensor behind
    /// `HKLiveWorkoutBuilder`, so it renders the no-BPM layout instead.
    static let workoutBpm: Double = 142

    /// Active energy a few minutes into the session, for the metrics strip.
    static let workoutKcal: Double = 284
}
#endif
