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
}

/** A request from the watch to delete one logged drink. */
export interface WatchWaterDeletePayload {
  /** Stable id generated on the watch, to dedupe a re-delivered transfer. */
  clientId: string;
  /** The `water_intake_entries` row id, as relayed in `waterLog` below. */
  entryId: string;
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
   * Saved workouts the wearer can start from the wrist. Names and ids only;
   * the phone still builds and arms the session. Absent on an older phone.
   */
  startableWorkouts?: { presetId: string; name: string }[] | null;
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

export interface WatchWorkoutStopPayload {
  sessionId: string;
}

export interface WatchWorkoutDiscardPayload {
  sessionId: string;
  /** Epoch ms of the arm that was discarded. Absent from an older watch. */
  armedAt?: number;
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

export type WatchConnectivityEvents = {
  onReachabilityChange: (payload: { isReachable: boolean }) => void;
  onCheckIn: (payload: WatchCheckInPayload) => void;
  onContextRequest: () => void;
  onWaterIntake: (payload: WatchWaterIntakePayload) => void;
  onWaterDelete: (payload: WatchWaterDeletePayload) => void;
  onSetCompleted: (payload: WatchSetCompletedPayload) => void;
  onRestChanged: (payload: WatchRestChangedPayload) => void;
  onSetTimerStarted: (payload: WatchSetTimerStartedPayload) => void;
  onSetTimerStopped: (payload: WatchSetTimerStoppedPayload) => void;
  onHeartRateBatch: (payload: WatchHeartRateBatchPayload) => void;
  onLiveHeartRate: (payload: WatchLiveHeartRatePayload) => void;
  onWorkoutStop: (payload: WatchWorkoutStopPayload) => void;
  onWorkoutDiscard: (payload: WatchWorkoutDiscardPayload) => void;
  onWorkoutStartRequested: (payload: WatchWorkoutStartRequestedPayload) => void;
  onPresetUpdateAnswer: (payload: WatchPresetUpdateAnswerPayload) => void;
};

declare class WatchConnectivityModuleType extends NativeModule<WatchConnectivityEvents> {
  isSupported(): boolean;
  isReachable(): boolean;
  isPaired(): boolean;
  updateContext(context: WatchContextPayload): Promise<void>;
  sendAck(clientId: string, ok: boolean): Promise<void>;
  startWorkout(plan: WatchWorkoutStartPayload): Promise<void>;
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
}

// iOS-only: WatchConnectivity has no Android equivalent, so this resolves to
// null there and every caller must guard on it. Prefer the guarded hook in
// src/hooks/useWatchCheckInBridge.ts over importing this module directly.
const WatchConnectivityModule: WatchConnectivityModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<WatchConnectivityModuleType>(
        'WatchConnectivity'
      )
    : null;

export default WatchConnectivityModule;
