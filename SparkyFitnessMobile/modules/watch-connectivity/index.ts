import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** One row of the watch's Goals page: a nutrient's amount against its goal. */
export interface WatchGoalNutrientPayload {
  /** `NUTRIENT_META` key, or a custom nutrient's name. */
  key: string;
  label: string;
  unit: string;
  consumed: number;
  /** Null when no goal is set; the row then shows the amount alone. */
  goal: number | null;
  /** consumed / goal, clamped to 0...1; 0 without a goal. */
  progress: number;
}

/** A morning check-in captured on the Apple Watch. */
export interface WatchCheckInPayload {
  /** Stable id generated on the watch, used to dedupe re-delivered transfers. */
  clientId: string;
  /** Calendar day (`yyyy-MM-dd`) in the wearer's local timezone. */
  entryDate: string;
  weightKg: number;
  /**
   * Null/undefined when the wearer skipped it because the scale gave no
   * impedance reading. Callers MUST omit the field from the check-in upsert in
   * that case — the API upserts by date, so sending null erases whatever body
   * fat value the day already had.
   */
  bodyFatPercentage: number | null;
  ownerId?: string;
}

/** One day of history relayed to the watch for its trend chart. */
export interface WatchHistoryPoint {
  day: string;
  weightKg: number;
  bodyFatPercentage?: number | null;
}

/** A water container tap captured on the Apple Watch. */
export interface WatchWaterIntakePayload {
  /** Stable id generated on the watch. Not acknowledged back like a check-in
   * is — see the comment on `containers` below — so this only guards against
   * one queued transfer being delivered to this listener twice. */
  clientId: string;
  /** Calendar day (`yyyy-MM-dd`) in the wearer's local timezone. */
  entryDate: string;
  containerId: number;
  ownerId?: string;
}

/** A request from the watch to delete one logged drink. */
export interface WatchWaterDeletePayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  /** The `water_intake_entries` row id, as relayed in `waterLog` below. */
  entryId: string;
  ownerId?: string;
}

/** A dose ticked, or un-ticked after a mistaken tap, on the Apple Watch. */
export interface WatchMedicationTakenPayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  /** Calendar day (`yyyy-MM-dd`) in the wearer's local timezone. */
  entryDate: string;
  medicationId: string;
  scheduleId: string;
  /** False when the wearer un-ticked the dose; absent from older watch builds, which only ever tick. */
  taken?: boolean;
  /**
   * True when the wearer marked the dose skipped. Only sent once the phone
   * has said it understands it (`medicationSkip` in the context), because an
   * older phone would read the `taken: false` that rides with it as an un-tick.
   */
  skipped?: boolean;
  ownerId?: string;
}

/** One of today's scheduled dose slots, relayed to the watch's Medications page. */
export interface WatchMedicationDosePayload {
  /** `medicationId:scheduleId` — unique per dose slot. */
  id: string;
  medicationId: string;
  scheduleId: string;
  name: string;
  /** Pre-formatted dose ("10 mg"), empty when the medication has none. */
  detail: string;
  /** Pre-formatted time of day in the account's 12/24-hour convention, empty when untimed. */
  time: string;
  status: 'pending' | 'taken' | 'skipped';
  /** A supplement rather than a medication, so the watch can draw its icon. */
  supplement?: boolean;
}

/**
 * One logged drink relayed to the watch's water log view. Manual entries
 * only — synced records (Apple Health and friends) carry no container and
 * are filtered out phone-side rather than shown as nameless rows.
 */
export interface WatchWaterLogPayload {
  /** The server row id, needed to delete this specific drink. */
  id: string;
  name: string;
  volumeMl: number;
  /** Wall-clock time this was logged, pre-formatted by the phone (see the
   * comment on `waterLog` for why the watch doesn't format it itself). */
  time: string;
}

/** One water container configured on the server, as relayed to the watch. */
export interface WatchContainerPayload {
  id: number;
  name: string;
  /**
   * This container's per-tap amount in ml, servings already divided out
   * (`getServingVolume`) — the watch adds exactly this much locally the
   * instant a square is tapped, before the phone's write even lands.
   */
  servingVolumeMl: number;
  /** Display only — `ml` | `oz` | `liter`. `servingVolumeMl` is always ml. */
  unit: string;
}

/** Today's sleep snapshot relayed to the watch for its Sleep Health tile. */
export interface WatchSleepSnapshotPayload {
  day: string;
  /** Total time asleep in seconds (main sleep + naps). */
  totalSeconds: number;
  /** Main sleep bedtime-to-waketime span in seconds. */
  timeInBedSeconds: number;
  sleepScore: number | null;
  /** Pre-formatted bedtime in the user's time format, or empty. */
  bedtime: string;
  /** Pre-formatted wake time in the user's time format, or empty. */
  wakeTime: string;
  deepSeconds: number | null;
  remSeconds: number | null;
  lightSeconds: number | null;
  awakeSeconds: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  spo2: number | null;
  napCount: number;
  napSeconds: number;
}

/** One logged exercise session relayed in `WatchExerciseSummaryPayload`. */
export interface WatchExerciseSessionPayload {
  name: string;
  durationMinutes: number;
  calories: number;
}

/** Today's exercise summary relayed to the watch for its Exercise tile. */
export interface WatchExerciseSummaryPayload {
  day: string;
  minutes: number;
  minutesGoal: number;
  calories: number;
  caloriesGoal: number;
  sessionCount: number;
  sessions: WatchExerciseSessionPayload[];
}

/** Seed values, history and acknowledgements pushed to the watch. */
export interface WatchContextPayload {
  /**
   * Milliseconds since the epoch at push time. Not read by the watch — it
   * exists purely to guarantee two consecutive pushes are never byte-identical.
   *
   * `updateApplicationContext` will not redeliver a dictionary equal to the
   * one already set, and every other field here is derived from data. So on a
   * day with nothing logged, re-opening the phone app re-pushed exactly what
   * was already there, the system dropped it, and a watch waiting on that
   * push (a fresh install, say) never heard anything.
   */
  pushedAt: number;
  today: string;
  todayWeightKg?: number | null;
  todayBodyFatPercentage?: number | null;
  lastWeightKg?: number | null;
  lastBodyFatPercentage?: number | null;
  lastEntryDate?: string | null;
  history: WatchHistoryPoint[];
  ackedClientIds: string[];
  /**
   * Client ids the phone tried to write and couldn't — check-ins and water
   * taps alike. Rides in the context for the same reason `ackedClientIds`
   * does: an immediate `sendAck` needs the watch reachable right then, and a
   * failure the watch never hears about leaves a tap queued forever.
   */
  failedClientIds: string[];
  /**
   * Mirrors the phone's Settings → default weight unit, so the watch's crown
   * dial and trend chart display in the same unit as the phone. The watch
   * always stores and transmits kg regardless — this only affects what's
   * drawn on screen there. Missing/unrecognized defaults to kg on the watch.
   */
  weightUnit?: 'kg' | 'lbs' | null;
  /**
   * The phone's distance unit. A weighted carry's distance is shown on the
   * watch in metres for `km` and yards for `miles`. Missing reads as `km`.
   */
  distanceUnit?: 'km' | 'miles' | null;
  /**
   * The phone's Settings → Haptics switch. The watch plays button haptics
   * and the rest-end buzz only while this is on. Missing reads as on.
   */
  hapticsEnabled?: boolean | null;
  /**
   * Whether the phone's rest-complete alert is on (notifications and rest
   * timer notifications both enabled). The watch's rest-end buzz follows it.
   * Missing reads as on.
   */
  restAlertsEnabled?: boolean | null;
  /**
   * Settings → Apple Watch → Double-tap to log a set. The watch ignores the
   * double-tap gesture while this is off. Missing reads as on.
   */
  doubleTapEnabled?: boolean | null;
  /** Whether the watch asks for an RPE after each logged set. */
  rpeEnabled?: boolean | null;
  /**
   * The Record screen's Voice cues switch. A run recorded from the wrist alone
   * speaks each completed km or mile while this is on. Missing reads as off.
   */
  runVoiceCues?: boolean | null;
  /**
   * The app's language as a BCP 47 tag. The watch speaks cue text the phone
   * wrote (plan step names, route wording) with a voice for it when the phone
   * cannot relay the cue. Missing reads as unknown.
   */
  appLanguage?: string | null;
  /** The phone's Auto-pause switch: the default for a run begun on the wrist. */
  runAutoPause?: boolean | null;
  /** Minutes between spoken check-ins: the default for a run begun on the wrist; 0 is off. */
  runCheckInMinutes?: number | null;
  /**
   * The pace range last used on the Record screen (seconds per km). The
   * watch's start screen offers it as the starting point of a pace alert; an
   * alert is only on for the run it was chosen for.
   */
  runPaceMinSecondsPerKm?: number | null;
  runPaceMaxSecondsPerKm?: number | null;
  /** The heart-rate range (bpm) last used, offered the same way. */
  runHeartRateMinBpm?: number | null;
  runHeartRateMaxBpm?: number | null;
  /**
   * Plans a wrist-only run can follow: the training-program workout due now
   * (carrying `programId`/`programIndex`) then the built-in interval plans,
   * with step names already translated. Missing keeps the watch's last list.
   */
  /**
   * Learned correction for the watch's indoor distance, from treadmill
   * distances entered after earlier sessions (`services/watchIndoorScale.ts`).
   * Missing keeps the watch's last value.
   */
  indoorDistanceScale?: { walk: number; run: number };
  runPlans?: {
    id: string;
    name: string;
    programId?: string;
    programIndex?: number;
    /** 'walk' for a walking program; missing is a run. */
    activity?: 'walk';
    /** `meters` marks a distance step; `seconds` is then its expected time. */
    /** Spoken before a program workout's first step, and when it ends; already in the app language. */
    startText?: string;
    doneText?: string;
    steps: {
      label: string;
      seconds: number;
      meters?: number;
      paceMin?: number;
      paceMax?: number;
      hrMin?: number;
      hrMax?: number;
      unit?: 'mi';
    }[];
  }[];
  /**
   * Settings → Apple Watch: the watch app's pages in swipe order, and the ones
   * turned off (`WATCH_PAGE_KEYS` names). Missing reads as the factory order
   * with nothing hidden; the watch carries the last values forward.
   */
  pageOrder?: string[] | null;
  hiddenPages?: string[] | null;
  /**
   * The rows the watch's Goals page lists under the calorie ring, in order
   * (Settings → Apple Watch). Day-scoped like the calorie figures: null when
   * this push can't vouch for today. Missing means an older phone build, and
   * the watch falls back to protein, carbs and fat.
   */
  goalNutrients?: WatchGoalNutrientPayload[] | null;
  /**
   * Settings → Apple Watch: how the workout page takes a set's weight and
   * reps, `keypad` or `crown`. Missing reads as the keypad; the watch carries
   * the last value forward.
   */
  setInputStyle?: 'keypad' | 'crown' | null;
  /**
   * Today's progress toward the phone's daily nutrition goals, each already
   * clamped to 0...1 — reaching or passing a goal always reads as 1, same
   * convention the iOS calorie widget already uses. Powers the watch's
   * "Daily Energy Goal" complication; the watch app itself doesn't display
   * these, it only relays them into shared storage the complication reads.
   */
  calorieGoalProgress?: number | null;
  proteinGoalProgress?: number | null;
  carbsGoalProgress?: number | null;
  fatGoalProgress?: number | null;
  /**
   * Today's nutrition totals, for the watch's Goals summary page — the same
   * numbers the phone's own summary bar shows.
   *
   * The three calorie figures MUST come from `DailySummary.calorieBalance`
   * (`eaten` / `burned` / `remaining`), never from the flatter top-level
   * `caloriesConsumed` / `caloriesBurned` / `remainingCalories` fields: those
   * are rawer inputs that disagree with what's on screen, because the balance
   * additionally accounts for the day's exercise source and BMR.
   *
   * Sent as flat keys (rather than a nested object) so the watch's existing
   * payload parsing and the complication's storage path stay untouched; the
   * watch reassembles them into a structured snapshot on arrival.
   */
  caloriesConsumed?: number | null;
  caloriesBurned?: number | null;
  caloriesRemaining?: number | null;
  proteinConsumed?: number | null;
  proteinGoal?: number | null;
  carbsConsumed?: number | null;
  carbsGoal?: number | null;
  fatConsumed?: number | null;
  fatGoal?: number | null;
  /**
   * Configured water containers, for the watch's Water page — one tappable
   * square per entry. Sent in full on every push rather than fetched once by
   * the watch itself: there's no path for the watch to call the server
   * directly, the list rarely changes, and staying self-contained here means
   * no separate "ask for the container list" round trip.
   */
  containers?: WatchContainerPayload[] | null;
  /** Today's water totals in ml, for the same page's bottle fill. */
  waterConsumedMl?: number | null;
  /** Part of `waterConsumedMl` from food; null unless that amount is positive. */
  waterFromFoodMl?: number | null;
  waterGoalMl?: number | null;
  /**
   * The app's globally configured water display unit (Settings → water
   * display unit) — independent of any one container's own `unit` — for the
   * "11% * 0.31L" label above the bottle. Null/unset defaults to `ml` on the
   * watch, same fallback the phone itself uses.
   */
  waterDisplayUnit?: 'ml' | 'oz' | 'liter' | null;
  /**
   * Today's individual logged drinks, newest first, for the watch's water log
   * view. Rides the context push rather than being fetched on demand so the
   * view opens instantly with no round trip — the phone is often out of
   * reach, and a spinner that may never resolve is worse than a list that's
   * at most one push stale.
   *
   * `time` is pre-formatted here rather than sent as a timestamp: the phone
   * knows the user's configured time format (12h/24h) from preferences, and
   * duplicating that resolution on the watch would be a second place to get
   * it wrong.
   */
  waterLog?: WatchWaterLogPayload[] | null;
  /**
   * Today's scheduled medication doses, soonest first, for the watch's
   * Medications page. Day-scoped like the water figures: blanked (null) when
   * the push crosses midnight, so the watch shows "not synced" rather than
   * yesterday's ticks. An empty array means nothing is scheduled today.
   */
  medications?: WatchMedicationDosePayload[] | null;
  /**
   * This phone handles `skipped` on a `medicationTaken` message. The watch
   * offers Skipped only while it is true.
   */
  medicationSkip?: boolean;
  /** Elapsed time, heart rate and calories on the set screen. Absent means on. */
  setScreenMetrics?: boolean;
  /** The Up Next page after the set screen. Absent means off. */
  upNextPage?: boolean;
  /** The larger-text layout of the Goals and Water pages. Absent means off. */
  largerText?: boolean;
  /** Keep the original workout page while larger text is on. Absent means off. */
  classicWorkout?: boolean;
  /**
   * This phone handles the `doExerciseNow` workout edit. The watch offers
   * Swap only while it is true.
   */
  exerciseDoNow?: boolean;
  /**
   * Saved workouts the wearer can start from the wrist. Names and ids only;
   * the phone still builds and arms the session. Absent on an older phone.
   */
  startableWorkouts?: { presetId: string; name: string }[] | null;
  /**
   * Exercises the wearer can add to a running workout from the wrist: recent
   * ones first, then the most used. Names and ids only; the phone loads the
   * exercise itself. Absent on an older phone.
   */
  suggestedExercises?: { exerciseId: string; name: string }[] | null;
  /**
   * Today's planned workouts (from the active workout plans), shown above the
   * saved ones. Each is also a saved workout, so a tap starts it by `presetId`
   * like any other. Absent on an older phone.
   */
  scheduledWorkouts?:
    | { presetId: string; name: string; planName: string; caption: string }[]
    | null;
  /**
   * The phone's active server when that list was built. The watch sends it
   * back with a start request so a queued tap cannot start a preset after
   * the phone has switched accounts.
   */
  workoutServerId?: string | null;
  /**
   * The fast running now, or null for none. Left out until the phone has
   * heard from the server, so a watch keeps what it had.
   */
  fastKnown?: boolean;
  fast?: {
    /** Epoch ms. */
    startedAt: number;
    /** Epoch ms, or null for an open-ended fast. */
    targetEndAt: number | null;
    label: string | null;
  } | null;
  /**
   * Today's step count, with the day it belongs to. Left out when the phone
   * has no step figure for today; the watch drops a count from another day.
   */
  steps?: { day: string; count: number } | null;
  /** Daily step goal the Steps page and complication measure against. */
  stepGoal?: number | null;
  /** Today's sleep health snapshot for the watch's Sleep Health tile. */
  sleep?: WatchSleepSnapshotPayload | null;
  /** Today's exercise summary for the watch's Exercise tile. */
  exerciseSummary?: WatchExerciseSummaryPayload | null;
}

/** One target set the watch shows for a planned exercise. */
export interface WatchPlannedSetPayload {
  /** The exercise_entry_sets id, stringified — matches the phone's own
   * `WorkoutStep.setId` (activeWorkoutStore.ts) so a `setCompleted` echoing
   * this back can be handed straight to `completeSet(setId)`. */
  setId: string;
  targetReps?: number | null;
  /** Always kg, like every other weight this app moves to the watch. */
  targetWeightKg?: number | null;
  /**
   * Hold length in seconds for a duration exercise (plank, carry). Absent
   * on a reps set. The watch counts this down instead of showing a reps box.
   */
  targetDurationSec?: number | null;
  /** Last session's time for this set, in seconds, shown in gray on an idle stopwatch. */
  previousDurationSec?: number | null;
  /**
   * True for a duration exercise, whether or not a hold length is planned.
   * With no `targetDurationSec` the watch offers a stopwatch instead of a
   * reps box.
   */
  timed?: boolean;
  /**
   * True for a weighted carry (weight and distance, no reps). The watch shows
   * a distance box, in metres, in place of the reps box.
   */
  carry?: boolean;
  /** True for a loaded hold: the watch keeps the weight box beside the timer. */
  weighted?: boolean;
  /** A carry's planned distance in km; the watch shows it in metres. */
  targetDistanceKm?: number | null;
  /** Rest to run after this set, in seconds — the phone's own `WorkoutStep.restSec`. */
  restSeconds: number;
  /** `normal` | `warmup` | `drop` … drives the watch's "Warmup 1/2" label. */
  setType?: string | null;
}

/**
 * The weight/reps a watch set should start from, as the phone now resolves
 * it. An absent field leaves the watch on the plan's value for that set.
 */
export interface WatchSetTargetPayload {
  setId: string;
  /** Always kg, like every other weight this app moves to the watch. */
  targetWeightKg?: number;
  targetReps?: number;
  /** Hold length in seconds. Absent leaves the watch on the plan's value. */
  targetDurationSec?: number;
  /** Last session's time, in seconds. Absent when there is none. */
  previousDurationSec?: number;
  /** A carry's distance in km. Absent leaves the watch on the plan's value. */
  targetDistanceKm?: number;
}

/** One exercise in the plan the watch was armed with. */
export interface WatchPlannedExercisePayload {
  /** The exercise_entries id — what a heart-rate batch for this exercise names. */
  exerciseEntryId: string;
  name: string;
  /**
   * Index of the valid superset this exercise belongs to, shared with its
   * partners. Null when it is not in a superset. A stored group id of one
   * exercise, or the same id on exercises that are not next to each other,
   * is not a superset and stays null.
   */
  supersetRun: number | null;
  /**
   * True for a bodyweight exercise, whose weight is a signed change to body
   * weight (+ added, − assisted). The watch lets that value go below zero and
   * shows it as "BW +10" / "BW −20". Absent from an older phone build.
   */
  bodyweight?: boolean;
  sets: WatchPlannedSetPayload[];
}

/** The workout plan pushed to the watch when a live session starts. */
export interface WatchWorkoutStartPayload {
  /** The live-workout session id (`activeWorkoutStore.sessionId` on the phone). */
  sessionId: string;
  workoutName: string;
  exercises: WatchPlannedExercisePayload[];
  /**
   * Set ids in the phone's live cursor order (including interleaved
   * supersets). The watch walks this instead of flattening each exercise's
   * sets in library order, so rest and next-set agree with the phone.
   */
  setOrder: string[];
  /**
   * `standard` when omitted. Interval formats still send the starting sets;
   * the watch uses these to show the format and the time cap instead of
   * looking like an ordinary set workout.
   */
  workoutFormat?: string | null;
  timeCapSeconds?: number | null;
  /** When the phone started the live session, ISO 8601. */
  startedAt?: string | null;
  /**
   * When this arm was sent, ISO 8601. A saved workout reuses `sessionId`,
   * so the watch rejects only a start at or before the stop, not a later
   * "Start workout here".
   */
  armedAt?: string | null;
  /**
   * When the cap reaches 0:00, ISO 8601, already past the phone's lead-in
   * countdown. Pauses are added on top of this rather than recomputed from
   * `startedAt`.
   */
  capEndsAt?: string | null;
  /**
   * The workout came from a saved workout. The watch asks whether to update
   * it when Finish is tapped on a workout whose exercises or sets changed.
   */
  fromPreset?: boolean;
}

/** A set the wearer un-logged on the watch during an active workout. */
export interface WatchSetUncompletedPayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  sessionId: string;
  setId: string;
}

/** One set logged on the watch during an active workout. */
export interface WatchSetCompletedPayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  sessionId: string;
  setId: string;
  /**
   * What the wearer actually did, as edited on the watch. Null/undefined
   * means the watch had no value — callers MUST omit the field from the set
   * patch in that case rather than writing null, which would clear the
   * planned value instead of leaving it alone.
   */
  weightKg?: number | null;
  reps?: number | null;
  /**
   * Seconds the watch's hold countdown actually ran. Omitted when the wearer
   * never started it, so the phone keeps the planned duration.
   */
  duration?: number | null;
  /** A carry's distance in km, as entered on the watch (metres there). */
  distanceKm?: number | null;
  /** Effort (RPE) the wearer picked, 6 to 10. Omitted when skipped. */
  rpe?: number | null;
  /**
   * When the wearer tapped the set on the watch, ISO 8601. The phone stamps
   * its own clock when this is absent (an older watch build, or a set logged
   * here). Using arrival time instead pulls the next exercise's readings
   * back onto the previous one for as long as the transfer took.
   */
  completedAt?: string | null;
}

/** One heart-rate reading captured on the watch. */
/**
 * The reading on the wrist right now. Sent every few seconds while the phone
 * is reachable and never queued, so it only ever describes the present.
 */
export interface WatchLiveHeartRatePayload {
  sessionId: string;
  exerciseEntryId: string;
  bpm: number;
  /** When the watch took it, epoch ms. */
  at: number;
}

export interface WatchHeartRateSamplePayload {
  /** ISO 8601 instant. */
  t: string;
  bpm: number;
}

/**
 * One batch of what the watch measured while a given exercise was on screen.
 *
 * Named for heart rate because that is what it started as, and still its
 * bulk; `activeEnergyKcal` rides along because HealthKit reports both from
 * the same `HKLiveWorkoutBuilder` and they share the same per-exercise
 * attribution.
 */
export interface WatchHeartRateBatchPayload {
  /**
   * Stable id generated on the watch, to dedupe a re-delivered
   * `transferUserInfo`. Absent on a batch from an older watch build —
   * those must not apply `activeEnergyKcal` again, because a redelivery
   * would double the diary calories.
   */
  clientId?: string;
  /**
   * Present only when `clientId` is missing, so the phone can still remove
   * the batch from the native queue. Not a dedupe key — a batch with no
   * `clientId` must not apply `activeEnergyKcal`.
   */
  queueId?: string;
  sessionId: string;
  exerciseEntryId: string;
  samples: WatchHeartRateSamplePayload[];
  /**
   * Active energy burned SINCE THE LAST BATCH, in kcal — a delta, not a
   * running total, so the phone can sum per exercise and have the parts add
   * up to the workout's real total. Absent when HealthKit reported no energy
   * (permission refused, or nothing measured yet).
   */
  activeEnergyKcal?: number;
  /**
   * Minutes the watch spent showing this exercise, including rest between
   * its sets. Cumulative. Absent on a batch that only carries samples.
   */
  durationMinutes?: number;
  /**
   * Apple's time-in-zone for the whole workout. Present only on the batch
   * sent after HealthKit finishes it. Five zones, each with `seconds`.
   */
  appleZones?: Array<{
    index?: number;
    minimumBpm?: number;
    maximumBpm?: number;
    seconds: number;
  }>;
  /**
   * Server config that was active when the phone received this batch. The
   * phone only applies a batch whose owner is the active config; a batch for
   * another config stays queued and is not posted or acked. Absent when no
   * config was active, in which case the batch was not queued either.
   */
  ownerId?: string;
}

/** The wearer ended the workout on the watch. */
/**
 * The wearer skipped or moved the rest on the watch. Deadlines are epoch ms.
 * Applies only to a phone rest still ending at `previousEndsAt`, so a copy
 * delivered twice, or late after that rest ended, changes nothing.
 */
export interface WatchRestChangedPayload {
  sessionId: string;
  previousEndsAt?: number;
  /** Absent when the rest was skipped. */
  endsAt?: number;
}

/** The wearer stopped a set's stopwatch on the watch. */
export interface WatchSetTimerStoppedPayload {
  sessionId: string;
  setId: string;
  /** Whole seconds the stopwatch ran. */
  seconds: number;
  /** Epoch ms of the run that stopped. Not applied to a different run. */
  startedAt: number;
}

/**
 * The wearer started a set's hold countdown or stopwatch on the watch.
 * `startedAt` is epoch ms; the phone starts its own timer from it.
 */
export interface WatchSetTimerStartedPayload {
  sessionId: string;
  setId: string;
  startedAt: number;
  /** Epoch ms of the arm the timer belongs to. Absent from an older watch. */
  armedAt?: number;
}

/** How hard the wearer rated a finished strength workout, 1 to 10. */
export interface WatchWorkoutEffortPayload {
  sessionId: string;
  rating: number;
}

export interface WatchWorkoutStopPayload {
  sessionId: string;
}

export interface WatchWorkoutDiscardPayload {
  sessionId: string;
  /** Epoch ms of the arm that was discarded. Absent from an older watch. */
  armedAt?: number;
}

/**
 * An edit made on the watch's workout page. `clientId` lets the phone drop a
 * copy delivered twice. `sessionId` ties it to the workout it was made in.
 */
export interface WatchWorkoutEditPayload {
  sessionId: string;
  clientId: string;
  action:
    | 'addSet'
    | 'deleteSet'
    | 'setSetType'
    | 'addExercise'
    | 'deleteExercise'
    | 'doExerciseNow';
  /** For `addSet`, `deleteExercise` and `doExerciseNow`. */
  exerciseEntryId?: string;
  /**
   * For `doExerciseNow`: the exercise the watch is on, which the picked one
   * goes in front of. Absent from an older watch: the phone's cursor is used.
   */
  anchorEntryId?: string;
  /** For `deleteSet` and `setSetType`. */
  setId?: string;
  /** For `addExercise`: the library exercise to add. */
  exerciseId?: string;
  /** For `setSetType`: `normal`, `warmup`, `drop` or `failure`. */
  setType?: string;
}

/** The wearer's answer to the watch's "update this workout?" question, asked
 * when they tap Finish on a workout started from a saved one and changed. */
export interface WatchPresetUpdateAnswerPayload {
  sessionId: string;
  /** True to write the workout's changes into the saved workout. */
  update: boolean;
}

export interface WatchWorkoutStartRequestedPayload {
  presetId: string;
  /** Active server the list was built for. Empty when an older watch omitted it. */
  serverId?: string;
}

/**
 * What the phone tells the watch about a GPS recording in progress (the phone
 * records the route; the watch is a remote and heart-rate sensor). Times are
 * epoch ms so the watch can run its own clock between updates: elapsed is
 * `(pausedAt ?? now) - startedAt - pausedMs`.
 */
export interface WatchRecordingStatePayload {
  sessionId: string;
  activity: 'walk' | 'run' | 'ride';
  /**
   * True for a treadmill or other indoor session. Absent from an older phone
   * build, which the watch treats as outdoor.
   */
  indoor?: boolean;
  status: 'recording' | 'paused' | 'finished' | 'ended';
  startedAt: number;
  pausedMs: number;
  /** Epoch ms the current pause began; omitted unless paused. */
  pausedAt?: number;
  distanceMeters: number;
  /** Seconds per km or mile, in the phone's distance unit; omitted when unknown. */
  paceSeconds?: number;
  distanceUnit: 'km' | 'mi';
  /** Laps marked so far, shown on the watch; omitted by older phone builds. */
  lapCount?: number;
  /** Phone clock (epoch ms) at send time, so the watch drops out-of-order copies. */
  sentAt: number;
  /**
   * An interval plan's current step, when the recording follows one. The
   * watch buzzes when `intervalIndex` changes and counts `intervalRemaining`
   * down from when it receives this. Omitted by an older phone build or when
   * there is no plan.
   */
  intervalIndex?: number;
  /** The step's name in the phone's language, e.g. "Run". */
  intervalLabel?: string;
  /** Seconds left in the step when this was sent; 0 once the plan is done. */
  intervalRemaining?: number;
  /** What comes next, e.g. "Walk 1:30"; omitted on the last step. */
  intervalNext?: string;
  /**
   * Only on `ended`: true when the recording was thrown away, false when it
   * was saved to the diary. The watch holds its Apple Health workout until it
   * hears which, so a discarded activity is never written to Health. Absent
   * from an older phone build, which the watch treats as saved.
   */
  discarded?: boolean;
}

export interface WatchRecordingControlPayload {
  sessionId: string;
  action: 'pause' | 'resume' | 'finish' | 'lap';
  /** Epoch ms the control was pressed on the watch; only sent with `lap`. */
  at?: number;
}

export interface WatchRecordingHeartRatePayload {
  sessionId: string;
  /** Dedupes a re-delivered queued batch. */
  clientId: string;
  samples: WatchHeartRateSamplePayload[];
  /** Apple's zone group for the finished recording, when HealthKit had one. */
  appleZones?: Array<{
    index?: number;
    minimumBpm?: number;
    maximumBpm?: number;
    seconds: number;
  }>;
}

/** The wearer asked to start a fast from the watch's Fasting page. */
export interface WatchFastStartRequestPayload {
  /** `FASTING_PRESETS` id, e.g. "16-8". */
  presetId: string;
  clientId: string;
  ownerId?: string;
}

/** The wearer asked to end the running fast from the watch. */
export interface WatchFastEndRequestPayload {
  clientId: string;
  ownerId?: string;
}

/**
 * A walk or run recorded on the watch alone, sent once when it finishes. The
 * shape is `WatchRunPayload` in `src/utils/watchRun.ts`; this is the loose
 * wire type and the phone validates it before use.
 */
export interface WatchRunFinishedPayload {
  clientId: string;
  /** Server config id that was active when the run arrived on the phone. */
  ownerId?: string;
  kind: string;
  place: string;
  startedAt: number;
  endedAt: number;
  activeSeconds: number;
  distanceMeters: number;
  activeEnergyKcal: number;
  route: number[][];
  heartRate: number[][];
  /** Epoch ms of each Lap press. Missing on a payload from an older watch build. */
  laps?: number[];
  /** Metres covered at each lap mark, same order (an indoor run's laps use these). */
  lapDistances: number[];
  /** `[active seconds, cumulative metres]` about every 10 s; empty when not recorded. */
  distanceSeries?: number[][];
  /** The plan the run followed, if any. */
  planId: string;
  /** Set when the plan was a training-program workout. */
  programId: string;
  programIndex: number;
  /** Whether the run reached the plan's last step. */
  planCompleted: boolean;
  /** The learned indoor factor the watch applied to its own distance. */
  distanceScale?: number;
  /** What the watch showed before a treadmill distance was entered on the wrist. */
  estimatedDistanceMeters?: number;
  /** Apple's heart-rate zone group, when the finished workout had one. */
  appleZones?: Array<{
    index?: number;
    minimumBpm?: number;
    maximumBpm?: number;
    seconds: number;
  }>;
}

/**
 * What a wrist-only walk or run looks like right now: figures sent every few
 * seconds while the phone is reachable (never queued), so the phone can show
 * its stats. `status: 'ended'` is the last one.
 */
/** A cue the watch wants the phone to say; answer with `sendRunCueAck(id)`. */
export interface WatchRunCuePayload {
  id: string;
  text: string;
  /** Say it now rather than after the cue being spoken. */
  interrupt: boolean;
  /**
   * BCP 47 tag of the language the text is written in (the watch's). Empty
   * when the sender does not say, as Wear OS does not; the app language then
   * applies.
   */
  language?: string;
}

/** How hard the wearer rated a finished watch run, 1 to 10. Matches a run by `clientId`. */
export interface WatchRunEffortPayload {
  clientId: string;
  rating: number;
}

export interface WatchRunLivePayload {
  runId: string;
  kind: string;
  place: string;
  status: string;
  autoPaused: boolean;
  /** Active seconds on the watch's clock when it was sent. */
  elapsed: number;
  distanceMeters: number;
  heartRate?: number;
  energyKcal: number;
  lapCount: number;
  stepLabel?: string;
  stepRemaining?: number;
  nextLabel?: string;
  /** Epoch ms on the watch when it was sent. */
  sentAt: number;
  /** The phone's `runStart` request this run began from; absent for a run started on the wrist. */
  requestId?: string;
  /** This run's switches; absent from an older watch build. */
  autoPause?: boolean;
  voiceCues?: boolean;
  /** Whether a pace or heart-rate range is being watched; absent from an older watch build. */
  paceAlert?: boolean;
  heartRateAlert?: boolean;
}

/** One step of a guided walk or run the phone hands the watch. */
export interface WatchRunStartPlanStep {
  label: string;
  seconds: number;
  /** Pace range to hold in this step, seconds per km; both or neither. */
  paceMin?: number;
  paceMax?: number;
  /** Heart-rate range (bpm) to hold in this step; both or neither. */
  hrMin?: number;
  hrMax?: number;
}

/**
 * A saved route for the watch to follow. `points` is flat
 * `[lat, lon, lat, lon, …]` in millionths of a degree (integers keep the
 * property list small: ~20 KB for the 2000-point maximum). `cues` are turn
 * instructions anchored to a point index; the watch words them from `kind`
 * unless `text` is given. See `toWatchRoutePayload` in `src/utils/watchRoute.ts`.
 */
export interface WatchRoutePayload {
  id: string;
  name: string;
  points: number[];
  cues: {
    index: number;
    kind:
      | 'depart'
      | 'straight'
      | 'slight_left'
      | 'left'
      | 'sharp_left'
      | 'slight_right'
      | 'right'
      | 'sharp_right'
      | 'uturn'
      | 'arrive';
    text?: string;
  }[];
}

/**
 * A saved route for the watch's own library (`routeSync`). Same wire shape as
 * the route of a `runStart`; `updatedAt` is the route's `updatedAt` in epoch
 * ms, which the watch uses to keep the newest copy.
 */
export interface WatchRouteSyncPayload {
  route: WatchRoutePayload;
  updatedAt: number;
}

/**
 * What the watch's route library holds (`routeLibrary`): each stored route
 * with the `updatedAt` it was stored at, the ids it turned away (`full` when
 * the library is at `capacity`, `storage` when the file could not be written)
 * and the cap.
 */
export interface WatchRouteLibraryPayload {
  routes: { id: string; updatedAt: number }[];
  rejected: { id: string; reason: string }[];
  capacity: number;
  /** Epoch ms on the watch when it was sent; a stale queued copy is ignored. */
  sentAt: number;
}

/** Asks the watch to start recording a walk or run itself. */
export interface WatchRunStartPayload {
  requestId: string;
  kind: 'run' | 'walk';
  place: 'indoor' | 'outdoor';
  /** Epoch ms; the watch ignores a request older than two minutes. */
  requestedAt: number;
  /** The Record screen's switches for this run (both or neither). */
  autoPause?: boolean;
  voiceCues?: boolean;
  /** Minutes between spoken check-ins (needs voiceCues); 0 or absent for none. */
  checkInMinutes?: number;
  /** Pace range (seconds per km) to stay inside; both or neither. */
  paceMin?: number;
  paceMax?: number;
  /** Heart-rate range (bpm) to stay inside; both or neither. */
  hrMin?: number;
  hrMax?: number;
  plan?: {
    id: string;
    name: string;
    programId?: string;
    programIndex?: number;
    activity?: string;
    startText?: string;
    doneText?: string;
    steps: WatchRunStartPlanStep[];
  };
  /** An outdoor run only: a saved route to follow. Rides this one request, so it reaches the watch exactly when the run does. */
  route?: WatchRoutePayload;
}

export type WatchRunControlAction =
  | 'pause'
  | 'resume'
  | 'lap'
  | 'finish'
  | 'discard'
  | 'autoPauseOn'
  | 'autoPauseOff'
  | 'voiceCuesOn'
  | 'voiceCuesOff'
  | 'paceAlertOn'
  | 'paceAlertOff'
  | 'heartRateAlertOn'
  | 'heartRateAlertOff';

export interface WatchRunControlPayload {
  runId: string;
  action: WatchRunControlAction;
  /** Unique per tap, so a queued copy delivered twice acts once. */
  controlId: string;
}

export type WatchConnectivityEvents = {
  onReachabilityChange: (payload: { isReachable: boolean }) => void;
  onCheckIn: (payload: WatchCheckInPayload) => void;
  onContextRequest: () => void;
  onWaterIntake: (payload: WatchWaterIntakePayload) => void;
  onWaterDelete: (payload: WatchWaterDeletePayload) => void;
  onMedicationTaken: (payload: WatchMedicationTakenPayload) => void;
  onSetCompleted: (payload: WatchSetCompletedPayload) => void;
  onSetUncompleted: (payload: WatchSetUncompletedPayload) => void;
  onRestChanged: (payload: WatchRestChangedPayload) => void;
  onSetTimerStarted: (payload: WatchSetTimerStartedPayload) => void;
  onSetTimerStopped: (payload: WatchSetTimerStoppedPayload) => void;
  onHeartRateBatch: (payload: WatchHeartRateBatchPayload) => void;
  onLiveHeartRate: (payload: WatchLiveHeartRatePayload) => void;
  onWorkoutStop: (payload: WatchWorkoutStopPayload) => void;
  onWorkoutEffort: (payload: WatchWorkoutEffortPayload) => void;
  onWorkoutDiscard: (payload: WatchWorkoutDiscardPayload) => void;
  onWorkoutStartRequested: (payload: WatchWorkoutStartRequestedPayload) => void;
  onWorkoutEdit: (payload: WatchWorkoutEditPayload) => void;
  onPresetUpdateAnswer: (payload: WatchPresetUpdateAnswerPayload) => void;
  onRecordingControl: (payload: WatchRecordingControlPayload) => void;
  onRecordingHeartRate: (payload: WatchRecordingHeartRatePayload) => void;
  onFastStartRequested: (payload: WatchFastStartRequestPayload) => void;
  onFastEndRequested: (payload: WatchFastEndRequestPayload) => void;
  onRunLive: (payload: WatchRunLivePayload) => void;
  onRunCue: (payload: WatchRunCuePayload) => void;
  onRunFinished: (payload: WatchRunFinishedPayload) => void;
  onRunEffort: (payload: WatchRunEffortPayload) => void;
  onRouteLibrary: (payload: WatchRouteLibraryPayload) => void;
};

declare class WatchConnectivityModuleType extends NativeModule<WatchConnectivityEvents> {
  isSupported(): boolean;
  isReachable(): boolean;
  isPaired(): boolean;
  updateContext(context: WatchContextPayload): Promise<void>;
  sendAck(clientId: string, ok: boolean): Promise<void>;
  /**
   * Live stats for a phone GPS recording. `durable` queues the message as
   * well (status changes); the periodic distance refresh is reachable-only.
   */
  updateRecordingState(
    state: WatchRecordingStatePayload,
    durable: boolean
  ): Promise<void>;
  startWorkout(plan: WatchWorkoutStartPayload): Promise<void>;
  /** Starts a walk or run on the watch and opens its app. */
  startRun(request: WatchRunStartPayload): Promise<void>;
  /**
   * Puts a route in the watch's library (queued, delivered once). The watch
   * answers with `onRouteLibrary`, which is how the caller learns it arrived
   * or that the library was full.
   */
  sendRoute(sync: WatchRouteSyncPayload): Promise<void>;
  /** Takes a route out of the watch's library (queued). */
  removeRoute(routeId: string): Promise<void>;
  /** Pause, resume, lap, finish or discard for the run on the watch, or a switch change (`autoPauseOn`/`Off`, `voiceCuesOn`/`Off`, `paceAlertOn`/`Off`, `heartRateAlertOn`/`Off`). */
  sendRunControl(control: WatchRunControlPayload): Promise<void>;
  /** Tells the watch the phone is saying cue `id`, so it stays quiet. */
  sendRunCueAck(id: string): Promise<void>;
  /**
   * The live workout's plan again after exercises, supersets or sets changed
   * on the phone mid-workout. The watch swaps it in without restarting,
   * keeping what was logged there. `revision` (JS ms timestamp) only
   * increases; the watch ignores a copy no newer than the last it took.
   */
  updateWorkoutPlan(
    plan: WatchWorkoutStartPayload & { revision: number }
  ): Promise<void>;
  /**
   * Tells the watch the workout it was armed with has ended on the phone, so
   * it stops its HealthKit session and clears the Workout tab. Takes the
   * session id rather than being argument-less so a stop for an already
   * superseded workout can be ignored watch-side. `discarded` tells the watch
   * the workout was thrown away, not finished: it ends the session without
   * saving it to Health and shows no summary.
   */
  stopWorkout(
    sessionId: string,
    stoppedAt: string,
    discarded: boolean
  ): Promise<void>;
  /**
   * Absolute pause snapshot for the live session. `revision` only increases.
   * `excludedPauseMs` is time already resumed, so a late pause cannot undo it.
   */
  updateIntervalTiming(timing: {
    sessionId: string;
    revision: number;
    paused: boolean;
    pausedAt?: string;
    excludedPauseMs: number;
  }): Promise<void>;
  /**
   * Current targets for every set of the live session, replacing any sent
   * before, plus the sets already logged on the phone. The plan is armed before each exercise's history loads, so a
   * progression bump only reaches the watch through this. `revision` only
   * increases; the watch ignores an older one.
   */
  updateSetTargets(update: {
    sessionId: string;
    /**
     * `armedAt` (epoch ms) of the `startWorkout` this follows. A saved
     * session can be armed again under the same id, and the watch drops an
     * update from an earlier arm.
     */
    armedAt: number;
    revision: number;
    targets: WatchSetTargetPayload[];
    /**
     * Sets logged on the phone. The watch adds these to its own completions
     * (never removes one) and moves past the set on screen if it is listed.
     */
    completedSetIds: string[];
    /**
     * The newest running set timer on the phone: set id to start time
     * (epoch ms). The watch holds one timer, so at most one entry is sent. The
     * watch starts its own hold countdown or stopwatch from that time, so
     * both show the same clock. A timer the phone has stopped is absent.
     */
    setTimers?: Record<string, number>;
    /**
     * Logged sets the phone has flagged as personal records. The watch
     * celebrates one it logged itself, once.
     */
    prSetIds?: string[];
    /**
     * The phone's rest timer. The watch's rest follows it (+15s, pause,
     * Skip), except from an update that does not yet list a set logged on
     * the wrist: that one predates the rest the wrist just started.
     */
    restState: 'resting' | 'paused' | 'ready';
    /** Epoch-ms deadline and length of a running rest; only when resting. */
    restEndsAt?: number;
    restDurationSeconds?: number;
  }): Promise<void>;
  /**
   * Heart-rate batches received before JavaScript was listening. Kept until
   * `ackHeartRateBatches` says the phone has stored them. Async so the read
   * is not on the JS thread.
   */
  pendingHeartRateBatches(): Promise<WatchHeartRateBatchPayload[]>;
  ackHeartRateBatches(clientIds: string[]): Promise<void>;
  /**
   * Wrist-only runs received before JavaScript was listening. Kept until
   * `ackWatchRuns` says the phone has stored them.
   */
  pendingWatchRuns(): Promise<WatchRunFinishedPayload[]>;
  /**
   * The newest `routeLibrary` report received this launch, or null. For a
   * report that arrived before `onRouteLibrary` had a listener. iOS only.
   */
  latestRouteLibrary?(): Promise<WatchRouteLibraryPayload | null>;
  ackWatchRuns(clientIds: string[]): Promise<void>;
  /**
   * Server config that owns batches received after this call. Persisted
   * natively, so a batch that arrives on a cold start is stamped before
   * JavaScript runs. An empty id means no config is active, and batches are
   * then not queued.
   */
  setTelemetryOwner(ownerId: string): Promise<void>;
  /**
   * Batches the native queue evicted (over its cap) or refused (no owner, or
   * malformed) since the last call. Resets to zero.
   */
  takeDroppedHeartRateBatchCount(): Promise<number>;
  setServerCredentials?(
    baseUrl: string,
    headers: Record<string, string>
  ): Promise<void>;
  clearServerCredentials?(): Promise<void>;
}

const WatchConnectivityModule: WatchConnectivityModuleType | null =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<WatchConnectivityModuleType>(
        'WatchConnectivity'
      )
    : null;

export default WatchConnectivityModule;
