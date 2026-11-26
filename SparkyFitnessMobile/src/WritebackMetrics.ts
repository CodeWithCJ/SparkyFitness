import { Platform, type ImageSourcePropType } from 'react-native';
import type { BodyWritebackMetricId } from './services/shared/bodyWriteback';

// Writeback metrics (Sparky → OS health store). Kept separate from the read
// HealthMetrics list: those drive background-delivery subscriptions and inbound
// sync, whereas these are outbound and opt-in. Supported on both platforms — Health
// Connect on Android (healthconnect/writeback.ts) and HealthKit on iOS
// (healthkit/writeback.ts), resolved via the top-level ./writeback shim. Off by default.
//
// Mirrors the read metrics' shape (icon + category) so the UI can group them in
// the same accordion style. We start with Nutrition + Hydration; a follow-up PR
// will extend writeback to the other readable metrics (which is why this is a
// category-grouped list rather than a flat pair).

export type WritebackMetricId =
  | 'nutrition'
  | 'hydration'
  | 'toothbrushing'
  | 'exercise'
  | BodyWritebackMetricId;

/** Inclusive local-calendar-day range (YYYY-MM-DD) for a targeted writeback removal.
 *  `null` removal means "all time" (full purge). */
export interface WritebackDateRange {
  from: string;
  to: string;
}

/** Result of a removal: `ok` is false if any record-type delete failed (partial). */
export interface WritebackRemovalResult {
  ok: boolean;
}

type WritebackRecordType =
  | 'Nutrition'
  | 'Hydration'
  | 'Toothbrushing'
  | 'ExerciseSession'
  | BodyWritebackRecordType;

/** The store record type each body metric is written as (#2465). */
export type BodyWritebackRecordType =
  | 'Weight'
  | 'BodyFat'
  | 'Height'
  | 'WaistCircumference'
  | 'BoneMass'
  | 'BodyWaterMass';

export interface WritebackMetric {
  id: WritebackMetricId;
  defaultLabel: string;
  /** Stable localization key for the application-owned metric label. */
  labelKey: string;
  /** loadHealthPreference/saveHealthPreference key (under the @HealthConnect prefix on
   *  Android, @HealthKit on iOS — the platform-resolved preferences module owns it). */
  preferenceKey: string;
  recordType: WritebackRecordType;
  permission: { accessType: 'write'; recordType: WritebackRecordType };
  /**
   * More permissions requested with `permission` whenever this metric is
   * turned on or re-affirmed (the exercise metric's energy and distance writes,
   * and the workout read its duplicate check needs, on Android; iOS expands
   * the workout write itself in healthKitAuthorizationTypes).
   */
  extraPermissions?: {
    accessType: 'read' | 'write';
    recordType: string;
    /** The writer works without it (it skips what this permission covers). */
    optional?: boolean;
  }[];
  /** Platforms the store has a record type for; absent means both. */
  platforms?: ('android' | 'ios')[];
  icon: ImageSourcePropType;
  category: string;
}

const ALL_WRITEBACK_METRICS: WritebackMetric[] = [
  {
    id: 'nutrition',
    labelKey: 'healthMetrics.nutrition',
    defaultLabel: 'Nutrition',
    preferenceKey: 'writebackNutritionEnabled',
    recordType: 'Nutrition',
    permission: { accessType: 'write', recordType: 'Nutrition' },
    icon: require('../assets/icons/health-metrics/nutrition.png'),
    category: 'Nutrition',
  },
  {
    id: 'hydration',
    labelKey: 'healthMetrics.hydration',
    defaultLabel: 'Hydration',
    preferenceKey: 'writebackHydrationEnabled',
    recordType: 'Hydration',
    permission: { accessType: 'write', recordType: 'Hydration' },
    icon: require('../assets/icons/health-metrics/hydration.png'),
    category: 'Nutrition',
  },
  {
    // Brushes logged in Sparky (by hand or with the timer) as Apple Health
    // ToothbrushingEvent samples (#1862). Health Connect has no such record.
    id: 'toothbrushing',
    labelKey: 'healthMetrics.toothbrushing',
    defaultLabel: 'Toothbrushing',
    preferenceKey: 'writebackToothbrushingEnabled',
    recordType: 'Toothbrushing',
    permission: { accessType: 'write', recordType: 'Toothbrushing' },
    icon: require('../assets/icons/health-metrics/stress.png'),
    category: 'Hygiene',
    platforms: ['ios'],
  },
  {
    // Workouts logged in Sparky as one workout per session, with active energy
    // and distance (#1750): HKWorkout on iOS, ExerciseSessionRecord (with a
    // segment per timed set) on Android. Never provider imports.
    id: 'exercise',
    labelKey: 'healthMetrics.exercise',
    defaultLabel: 'Exercise',
    preferenceKey: 'writebackExerciseEnabled',
    recordType: 'ExerciseSession',
    permission: { accessType: 'write', recordType: 'ExerciseSession' },
    extraPermissions:
      Platform.OS === 'android'
        ? [
            // Sessions are still written without energy or distance.
            {
              accessType: 'write',
              recordType: 'ActiveCaloriesBurned',
              optional: true,
            },
            { accessType: 'write', recordType: 'Distance', optional: true },
            // The duplicate check reads sessions; nothing is written without it.
            { accessType: 'read', recordType: 'ExerciseSession' },
          ]
        : undefined,
    icon: require('../assets/icons/health-metrics/exercise_session.png'),
    category: 'Exercise',
  },
];

// Body measurements from the daily check-in (#2465), one switch each. Each also
// asks to read its own type: the writer skips a day when another app already has
// the same value on it, and writes anyway without that read access.
const bodyMetric = (
  id: BodyWritebackMetricId,
  recordType: BodyWritebackRecordType,
  labelKey: string,
  defaultLabel: string,
  preferenceKey: string,
  icon: ImageSourcePropType,
  platforms?: ('android' | 'ios')[]
): WritebackMetric => ({
  id,
  labelKey,
  defaultLabel,
  preferenceKey,
  recordType,
  permission: { accessType: 'write', recordType },
  extraPermissions: [{ accessType: 'read', recordType, optional: true }],
  platforms,
  icon,
  category: 'Body Measurements',
});

const BODY_WRITEBACK_METRICS: WritebackMetric[] = [
  bodyMetric(
    'weight',
    'Weight',
    'healthMetrics.weight',
    'Weight',
    'writebackWeightEnabled',
    require('../assets/icons/health-metrics/weight.png')
  ),
  bodyMetric(
    'bodyFat',
    'BodyFat',
    'healthMetrics.bodyFat',
    'Body Fat',
    'writebackBodyFatEnabled',
    require('../assets/icons/health-metrics/body_fat.png')
  ),
  bodyMetric(
    'height',
    'Height',
    'healthMetrics.height',
    'Height',
    'writebackHeightEnabled',
    require('../assets/icons/health-metrics/height.png')
  ),
  // Health Connect has no waist record.
  bodyMetric(
    'waistCircumference',
    'WaistCircumference',
    'healthMetrics.waistCircumference',
    'Waist Circumference',
    'writebackWaistEnabled',
    require('../assets/icons/health-metrics/lean_body_mass.png'),
    ['ios']
  ),
  // Apple Health has no bone mass or body water type.
  bodyMetric(
    'boneMass',
    'BoneMass',
    'healthMetrics.boneMass',
    'Bone Mass',
    'writebackBoneMassEnabled',
    require('../assets/icons/health-metrics/bone_mass.png'),
    ['android']
  ),
  bodyMetric(
    'bodyWaterMass',
    'BodyWaterMass',
    'healthMetrics.bodyWaterMass',
    'Body Water Mass',
    'writebackBodyWaterEnabled',
    require('../assets/icons/health-metrics/hydration.png'),
    ['android']
  ),
];

/** Every permission a writeback metric asks for: its own, then any extras. */
export const writebackMetricPermissions = (
  metric: WritebackMetric
): { accessType: 'read' | 'write'; recordType: string }[] => [
  metric.permission,
  ...(metric.extraPermissions ?? []).map(({ accessType, recordType }) => ({
    accessType,
    recordType,
  })),
];

/**
 * The permissions a metric cannot work without that are missing from what was
 * granted: its own and its non-optional extras. Turning a metric on succeeds
 * when this is empty, even if an optional extra was declined.
 */
export const missingRequiredWritebackPermissions = (
  metric: WritebackMetric,
  granted: readonly { accessType?: string; recordType?: string }[]
): { accessType: 'read' | 'write'; recordType: string }[] =>
  [
    metric.permission,
    ...(metric.extraPermissions ?? []).filter((p) => !p.optional),
  ]
    .map(({ accessType, recordType }) => ({ accessType, recordType }))
    .filter(
      (required) =>
        !granted.some(
          (g) =>
            g.accessType === required.accessType &&
            g.recordType === required.recordType
        )
    );

/** The writeback metrics this platform's health store can hold. */
export const WRITEBACK_METRICS: WritebackMetric[] = [
  ...ALL_WRITEBACK_METRICS,
  ...BODY_WRITEBACK_METRICS,
].filter(
  (metric) =>
    !metric.platforms ||
    metric.platforms.includes(Platform.OS as 'android' | 'ios')
);

/** Order categories render in (mirrors the read section's grouping). */
export const WRITEBACK_CATEGORY_ORDER: string[] = [
  'Nutrition',
  'Exercise',
  'Body Measurements',
  'Hygiene',
];
