import {
  ComparisonPredicateOperator,
  deleteObjects,
  queryWorkoutSamples,
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
  type QuantitySampleForSaving,
} from '@kingstinct/react-native-healthkit';
import { addLog } from './LogService';

interface SeedResult {
  success: boolean;
  recordsInserted: number;
  error?: string;
}

const randomInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const HEART_RATE_TYPE = 'HKQuantityTypeIdentifierHeartRate' as const;

/**
 * HealthKit has no dedup on write — every saveWorkoutSample call creates a
 * brand-new, permanent HKWorkout with its own UUID, so tapping a seed button
 * repeatedly (e.g. while iterating through a bug fix) silently piles up
 * duplicate workouts that all sync in as separate diary entries. Each seed
 * function tags its workout with this metadata key and deletes any prior
 * workout carrying the same tag value before writing a new one, so only the
 * latest seed of each kind survives.
 */
const SEED_TAG_KEY = 'SparkyFitnessSeedTag';

const workoutTagFilter = (tag: string) => ({
  metadata: {
    withMetadataKey: SEED_TAG_KEY,
    operatorType: ComparisonPredicateOperator.equalTo,
    value: tag,
  },
});

/**
 * Deleting an HKWorkout does NOT cascade to its associated samples — HealthKit
 * treats the workout and the heart-rate/route objects linked to it as
 * separate objects, and cleanup of the linked ones is the app's job (Apple's
 * own documented pattern: query with the workout predicate, delete those,
 * then delete the workout). Without this, every re-seed would silently leave
 * that workout's heart-rate samples and route permanently orphaned in
 * HealthKit — deleting only the tagged HKWorkoutTypeIdentifier object hides
 * the workout from the diary but never actually cleans up its data.
 */
const deletePriorSeeds = async (tag: string): Promise<void> => {
  try {
    const priorWorkouts = await queryWorkoutSamples({
      filter: workoutTagFilter(tag),
      limit: 0,
    });

    for (const workout of priorWorkouts) {
      try {
        await deleteObjects(HEART_RATE_TYPE, { workout });
      } catch {
        // No HR samples on this workout, or write auth for the type was
        // never requested (the strength seed has none) — nothing to clean up.
      }
      try {
        await deleteObjects('HKWorkoutRouteTypeIdentifier', { workout });
      } catch {
        // No route on this workout (e.g. the strength seed never saves one).
      }
    }

    const deleted = await deleteObjects(
      'HKWorkoutTypeIdentifier',
      workoutTagFilter(tag)
    );
    if (deleted > 0) {
      addLog(`[seedHealthDataIOS] Deleted ${deleted} prior "${tag}" seed workout(s) and their linked samples/routes.`, 'INFO');
    }
  } catch (error) {
    // Best-effort cleanup — a failure here must not block seeding a new one.
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[seedHealthDataIOS] Failed to delete prior "${tag}" seeds: ${message}`, 'WARNING');
  }
};

/**
 * iOS counterpart to seedRichWorkout (seedHealthData.ts, Android). Writes one
 * real HKWorkout via saveWorkoutSample — not a mock — with a route attached
 * via the returned WorkoutProxy.saveWorkoutRoute(), and heart-rate samples
 * passed directly into the workout at creation time so they come back
 * through our own sync's `filter: { workout }` correlation, exactly as a
 * real Apple Watch workout would.
 *
 * Known gap vs Android: saveWorkoutSample(activityType, quantities, start,
 * end, totals?, metadata?) has no parameter for workout events/laps, so a
 * seeded iOS workout cannot carry laps — that's a library limitation, not
 * something this function works around.
 */
export const seedRichWorkoutIOS = async (): Promise<SeedResult> => {
  try {
    await requestAuthorization({
      toShare: [
        'HKWorkoutTypeIdentifier',
        'HKWorkoutRouteTypeIdentifier',
        HEART_RATE_TYPE,
      ],
      toRead: [],
    });

    await deletePriorSeeds('rich-workout-walk');

    const durationMinutes = 12;
    const sampleCount = 40;
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - durationMinutes);
    const endDate = new Date();
    const stepMs = (durationMinutes * 60_000) / sampleCount;

    // Short out-and-back walk so the route visibly bends on the map instead
    // of being a straight line.
    const baseLat = 37.7749;
    const baseLon = -122.4194;

    const heartRateQuantities: QuantitySampleForSaving[] = Array.from(
      { length: sampleCount },
      (_, i) => {
        const t = new Date(startDate.getTime() + i * stepMs);
        const progress = i / (sampleCount - 1);
        // Ramp up, hold, ramp down — real HR shape instead of a flat line.
        const ramp =
          progress < 0.2
            ? progress / 0.2
            : progress > 0.8
              ? (1 - progress) / 0.2
              : 1;
        const bpm = Math.round(95 + ramp * 35 + randomInt(-3, 3));
        return {
          startDate: t,
          endDate: t,
          quantityType: HEART_RATE_TYPE,
          quantity: bpm,
          unit: 'count/min',
        };
      }
    );

    const workout = await saveWorkoutSample(
      WorkoutActivityType.walking,
      heartRateQuantities,
      startDate,
      endDate,
      { distance: 750, energyBurned: 55 },
      { [SEED_TAG_KEY]: 'rich-workout-walk' }
    );

    const route = Array.from({ length: sampleCount }, (_, i) => {
      const t = new Date(startDate.getTime() + i * stepMs);
      const progress = i / (sampleCount - 1);
      const bend = Math.sin(progress * Math.PI) * 0.0015;
      return {
        date: t,
        latitude: baseLat + progress * 0.004,
        longitude: baseLon + bend,
        altitude: 15 + Math.sin(progress * Math.PI * 2) * 5,
        course: 0,
        speed: randomInt(9, 16) / 10,
        horizontalAccuracy: 5,
        verticalAccuracy: 5,
      };
    });

    await workout.saveWorkoutRoute(route);

    return { success: true, recordsInserted: sampleCount + 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[seedHealthDataIOS] Failed to seed rich workout: ${message}`,
      'ERROR'
    );
    return { success: false, recordsInserted: 0, error: message };
  }
};

/**
 * iOS counterpart to seedRichStrengthWorkout. Same caveat as the Android
 * version applies even harder here: HealthKit has no per-set reps/weight
 * concept at all, and (per the gap above) this seed can't even carry laps —
 * it exists purely to verify activity-type -> modality/category
 * classification and diary rendering for a strength session on iOS.
 */
export const seedRichStrengthWorkoutIOS = async (): Promise<SeedResult> => {
  try {
    await requestAuthorization({
      toShare: ['HKWorkoutTypeIdentifier', HEART_RATE_TYPE],
      toRead: [],
    });

    await deletePriorSeeds('rich-strength-workout');

    const durationMinutes = 35;
    const setCount = 8; // e.g. 4 exercises x 2 sets, alternating work/rest
    const startDate = new Date();
    startDate.setMinutes(startDate.getMinutes() - durationMinutes);
    const endDate = new Date();
    const totalMs = durationMinutes * 60_000;

    const heartRateQuantities: QuantitySampleForSaving[] = [];
    for (let set = 0; set < setCount; set++) {
      const setStartMs = (set / setCount) * totalMs;
      const setEndMs = ((set + 0.6) / setCount) * totalMs; // ~60% work, ~40% rest
      const workSamples = 6;
      for (let i = 0; i <= workSamples; i++) {
        const t = new Date(
          startDate.getTime() +
            setStartMs +
            (i / workSamples) * (setEndMs - setStartMs)
        );
        // Ramps up sharply during the set (exertion).
        const bpm = Math.round(100 + (i / workSamples) * 45 + randomInt(-4, 4));
        heartRateQuantities.push({
          startDate: t,
          endDate: t,
          quantityType: HEART_RATE_TYPE,
          quantity: bpm,
          unit: 'count/min',
        });
      }
      const restStartMs = setEndMs;
      const restEndMs = ((set + 1) / setCount) * totalMs;
      const restSamples = 4;
      for (let i = 0; i <= restSamples; i++) {
        const t = new Date(
          startDate.getTime() +
            restStartMs +
            (i / restSamples) * (restEndMs - restStartMs)
        );
        // Decays back down during rest between sets.
        const bpm = Math.round(145 - (i / restSamples) * 35 + randomInt(-4, 4));
        heartRateQuantities.push({
          startDate: t,
          endDate: t,
          quantityType: HEART_RATE_TYPE,
          quantity: bpm,
          unit: 'count/min',
        });
      }
    }

    await saveWorkoutSample(
      WorkoutActivityType.traditionalStrengthTraining,
      heartRateQuantities,
      startDate,
      endDate,
      { energyBurned: 220 },
      { [SEED_TAG_KEY]: 'rich-strength-workout' }
    );

    return { success: true, recordsInserted: heartRateQuantities.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[seedHealthDataIOS] Failed to seed rich strength workout: ${message}`,
      'ERROR'
    );
    return { success: false, recordsInserted: 0, error: message };
  }
};
