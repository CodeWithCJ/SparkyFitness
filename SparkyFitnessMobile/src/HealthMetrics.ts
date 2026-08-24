import { Platform, ImageSourcePropType } from 'react-native';

export interface HealthMetricPermission {
  accessType: 'read' | 'write';
  recordType: string;
}

export type BackgroundDeliveryFrequency = 'hourly' | 'daily' | 'none';

/**
 * How a metric's data is read from the platform health store:
 * - 'cumulative-day': one day-bucketed native aggregation query (per-day totals).
 * - 'min-max-avg-day': one day-bucketed native statistics query (per-day min/max/avg).
 * - 'raw': raw record read, transformed (and optionally day-aggregated) afterwards.
 *
 * readKind describes intent; each platform provider decides capability. A provider
 * with no native read for the requested kind returns null and the sync engine falls
 * back to the raw path (e.g. Android has no basal-energy aggregation, and no native
 * min/max/avg day statistics at all).
 */
export type MetricReadKind = 'cumulative-day' | 'min-max-avg-day' | 'raw';

export interface HealthMetric {
  id: string;
  defaultLabel: string;
  /** Stable localization key for the application-owned metric label. */
  labelKey: string;
  stateKey: string;
  preferenceKey: string;
  recordType: string;
  unit: string;
  icon: ImageSourcePropType;
  permissions: HealthMetricPermission[];
  type: string;
  platforms?: ('android' | 'ios')[];
  category?: string;
  enabled?: boolean; // Set to false to temporarily disable a metric
  backgroundDeliveryFrequency?: BackgroundDeliveryFrequency; // Default: 'daily'
  aggregationStrategy?: 'min-max-avg' | 'sum' | 'last';
  readKind?: MetricReadKind; // Default derived by metricReadKind()
  // Day-aligned rolling lookback floor (in days) for raw reads, so records logged
  // after the fact — event time in the past, entered recently — are still picked up.
  rollingLookbackDays?: number;
}

export const metricReadKind = (
  metric: Pick<HealthMetric, 'readKind' | 'aggregationStrategy'>,
): MetricReadKind =>
  metric.readKind ?? (metric.aggregationStrategy === 'min-max-avg' ? 'min-max-avg-day' : 'raw');

const ALL_HEALTH_METRICS: HealthMetric[] = [
  { id: 'steps', labelKey: 'healthMetrics.steps', defaultLabel: 'Steps', stateKey: 'isStepsSyncEnabled', preferenceKey: 'syncStepsEnabled', recordType: 'Steps', unit: 'count', icon: require('../assets/icons/health-metrics/steps.png'), permissions: [{ accessType: 'read', recordType: 'Steps' }], type: 'step', category: 'Common', backgroundDeliveryFrequency: 'hourly', readKind: 'cumulative-day' },
  { id: 'calories', labelKey: 'healthMetrics.calories', defaultLabel: 'Active Calories', stateKey: 'isCaloriesSyncEnabled', preferenceKey: 'syncCaloriesEnabled', recordType: 'ActiveCaloriesBurned', unit: 'kcal', icon: require('../assets/icons/health-metrics/calories.png'), permissions: [{ accessType: 'read', recordType: 'ActiveCaloriesBurned' }, { accessType: 'read', recordType: 'TotalCaloriesBurned' }, { accessType: 'read', recordType: 'BasalMetabolicRate' }], type: 'Active Calories', category: 'Common', backgroundDeliveryFrequency: 'hourly', readKind: 'cumulative-day' },
  { id: 'totalCalories', labelKey: 'healthMetrics.totalCalories', defaultLabel: 'Total Calories', stateKey: 'isTotalCaloriesSyncEnabled', preferenceKey: 'syncTotalCaloriesEnabled', recordType: 'TotalCaloriesBurned', unit: 'kcal', icon: require('../assets/icons/health-metrics/calories.png'), permissions: [{ accessType: 'read', recordType: 'TotalCaloriesBurned' }], type: 'Active Calories', category: 'Common', backgroundDeliveryFrequency: 'hourly', readKind: 'cumulative-day' },
  { id: 'heartRate', labelKey: 'healthMetrics.heartRate', defaultLabel: 'Heart Rate', stateKey: 'isHeartRateSyncEnabled', preferenceKey: 'syncHeartRateEnabled', recordType: 'HeartRate', unit: 'bpm', icon: require('../assets/icons/health-metrics/heart_rate.png'), permissions: [{ accessType: 'read', recordType: 'HeartRate' }], type: 'heart_rate', category: 'Common', backgroundDeliveryFrequency: 'hourly', aggregationStrategy: 'min-max-avg' },
  { id: 'weight', labelKey: 'healthMetrics.weight', defaultLabel: 'Weight', stateKey: 'isWeightSyncEnabled', preferenceKey: 'syncWeightEnabled', recordType: 'Weight', unit: 'kg', icon: require('../assets/icons/health-metrics/weight.png'), permissions: [{ accessType: 'read', recordType: 'Weight' }], type: 'weight', category: 'Common' },
  { id: 'bloodPressure', labelKey: 'healthMetrics.bloodPressure', defaultLabel: 'Blood Pressure', stateKey: 'isBloodPressureSyncEnabled', preferenceKey: 'syncBloodPressureEnabled', recordType: 'BloodPressure', unit: 'mmHg', icon: require('../assets/icons/health-metrics/blood_pressure.png'), permissions: [{ accessType: 'read', recordType: 'BloodPressure' }], type: 'blood_pressure', category: 'Vitals' },
  { id: 'nutrition', labelKey: 'healthMetrics.nutrition', defaultLabel: 'Nutrition', stateKey: 'isNutritionSyncEnabled', preferenceKey: 'syncNutritionEnabled', recordType: 'Nutrition', unit: 'kcal', icon: require('../assets/icons/health-metrics/nutrition.png'), permissions: [{ accessType: 'read', recordType: 'Nutrition' }], type: 'nutrition', platforms: ['android', 'ios'], category: 'Nutrition', backgroundDeliveryFrequency: 'daily', rollingLookbackDays: 2 },
  { id: 'sleepSession', labelKey: 'healthMetrics.sleepSession', defaultLabel: 'Sleep Session', stateKey: 'isSleepSessionSyncEnabled', preferenceKey: 'syncSleepSessionEnabled', recordType: 'SleepSession', unit: 'min', icon: require('../assets/icons/health-metrics/sleep_session.png'), permissions: [{ accessType: 'read', recordType: 'SleepSession' }], type: 'sleep_session', category: 'Common' },
  { id: 'stress', labelKey: 'healthMetrics.stress', defaultLabel: 'Stress', stateKey: 'isStressSyncEnabled', preferenceKey: 'syncStressEnabled', recordType: 'Stress', unit: 'level', icon: require('../assets/icons/health-metrics/stress.png'), permissions: [{ accessType: 'read', recordType: 'Stress' }], type: 'stress', platforms: ['ios'], category: 'Vitals', enabled: false },
  { id: 'basalBodyTemperature', labelKey: 'healthMetrics.basalBodyTemperature', defaultLabel: 'Basal Body Temperature', stateKey: 'isBasalBodyTemperatureSyncEnabled', preferenceKey: 'syncBasalBodyTemperatureEnabled', recordType: 'BasalBodyTemperature', unit: 'celsius', icon: require('../assets/icons/health-metrics/basal_body_temperature.png'), permissions: [{ accessType: 'read', recordType: 'BasalBodyTemperature' }], type: 'basal_body_temperature', category: 'Vitals' },
  { id: 'basalMetabolicRate', labelKey: 'healthMetrics.basalMetabolicRate', defaultLabel: 'Basal Metabolic Rate', stateKey: 'isBasalMetabolicRateSyncEnabled', preferenceKey: 'syncBasalMetabolicRateEnabled', recordType: 'BasalMetabolicRate', unit: 'kcal', icon: require('../assets/icons/health-metrics/basal_metabolic_rate.png'), permissions: [{ accessType: 'read', recordType: 'BasalMetabolicRate' }], type: 'basal_metabolic_rate', category: 'Body Measurements', backgroundDeliveryFrequency: 'none', readKind: 'cumulative-day' },
  { id: 'bloodGlucose', labelKey: 'healthMetrics.bloodGlucose', defaultLabel: 'Blood Glucose', stateKey: 'isBloodGlucoseSyncEnabled', preferenceKey: 'syncBloodGlucoseEnabled', recordType: 'BloodGlucose', unit: 'mmol/L', icon: require('../assets/icons/health-metrics/blood_glucose.png'), permissions: [{ accessType: 'read', recordType: 'BloodGlucose' }], type: 'blood_glucose', category: 'Vitals', aggregationStrategy: 'min-max-avg' },
  { id: 'bodyFat', labelKey: 'healthMetrics.bodyFat', defaultLabel: 'Body Fat', stateKey: 'isBodyFatSyncEnabled', preferenceKey: 'syncBodyFatEnabled', recordType: 'BodyFat', unit: '%', icon: require('../assets/icons/health-metrics/body_fat.png'), permissions: [{ accessType: 'read', recordType: 'BodyFat' }], type: 'body_fat', category: 'Body Measurements' },
  { id: 'bodyTemperature', labelKey: 'healthMetrics.bodyTemperature', defaultLabel: 'Body Temperature', stateKey: 'isBodyTemperatureSyncEnabled', preferenceKey: 'syncBodyTemperatureEnabled', recordType: 'BodyTemperature', unit: 'celsius', icon: require('../assets/icons/health-metrics/body_temperature.png'), permissions: [{ accessType: 'read', recordType: 'BodyTemperature' }], type: 'body_temperature', category: 'Vitals' },
  { id: 'distance', labelKey: 'healthMetrics.distance', defaultLabel: 'Distance', stateKey: 'isDistanceSyncEnabled', preferenceKey: 'syncDistanceEnabled', recordType: 'Distance', unit: 'm', icon: require('../assets/icons/health-metrics/distance.png'), permissions: [{ accessType: 'read', recordType: 'Distance' }], type: 'distance', platforms: ['android', 'ios'], category: 'Common', backgroundDeliveryFrequency: 'hourly', readKind: 'cumulative-day' },

  // The trailing read permissions cover workout telemetry (heart rate, speed,
  // power, cadence), which is read scoped to a session's time window on Android.
  // Only record types Health Connect actually knows may appear here — it throws
  // InvalidRecordType for anything else and fails the whole request. In
  // particular ExerciseRoute must NOT be listed: iOS authorizes the route via
  // WORKOUT_TELEMETRY_READ_IDENTIFIERS, and Android grants it through the
  // READ_EXERCISE_ROUTES manifest permission plus per-session consent.
  { id: 'exerciseSession', labelKey: 'healthMetrics.exerciseSession', defaultLabel: 'Exercise Session', stateKey: 'isExerciseSessionSyncEnabled', preferenceKey: 'syncExerciseSessionEnabled', recordType: 'ExerciseSession', unit: 'min', icon: require('../assets/icons/health-metrics/exercise_session.png'), permissions: [{ accessType: 'read', recordType: 'ExerciseSession' }, { accessType: 'read', recordType: 'ActiveCaloriesBurned' }, { accessType: 'read', recordType: 'TotalCaloriesBurned' }, { accessType: 'read', recordType: 'Distance' }, { accessType: 'read', recordType: 'HeartRate' }, { accessType: 'read', recordType: 'Speed' }, { accessType: 'read', recordType: 'Power' }, { accessType: 'read', recordType: 'StepsCadence' }, { accessType: 'read', recordType: 'CyclingPedalingCadence' }], type: 'exercise_session', category: 'Common', backgroundDeliveryFrequency: 'hourly' },
  { id: 'floorsClimbed', labelKey: 'healthMetrics.floorsClimbed', defaultLabel: 'Floors Climbed', stateKey: 'isFloorsClimbedSyncEnabled', preferenceKey: 'syncFloorsClimbedEnabled', recordType: 'FloorsClimbed', unit: 'count', icon: require('../assets/icons/health-metrics/floors_climbed.png'), permissions: [{ accessType: 'read', recordType: 'FloorsClimbed' }], type: 'floors_climbed', category: 'Activity', backgroundDeliveryFrequency: 'hourly', readKind: 'cumulative-day' },
  { id: 'height', labelKey: 'healthMetrics.height', defaultLabel: 'Height', stateKey: 'isHeightSyncEnabled', preferenceKey: 'syncHeightEnabled', recordType: 'Height', unit: 'm', icon: require('../assets/icons/health-metrics/height.png'), permissions: [{ accessType: 'read', recordType: 'Height' }], type: 'height', category: 'Body Measurements' },
  { id: 'hydration', labelKey: 'healthMetrics.hydration', defaultLabel: 'Hydration', stateKey: 'isHydrationSyncEnabled', preferenceKey: 'syncHydrationEnabled', recordType: 'Hydration', unit: 'ml', icon: require('../assets/icons/health-metrics/hydration.png'), permissions: [{ accessType: 'read', recordType: 'Hydration' }], type: 'water', category: 'Nutrition' },
  { id: 'leanBodyMass', labelKey: 'healthMetrics.leanBodyMass', defaultLabel: 'Lean Body Mass', stateKey: 'isLeanBodyMassSyncEnabled', preferenceKey: 'syncLeanBodyMassEnabled', recordType: 'LeanBodyMass', unit: 'kg', icon: require('../assets/icons/health-metrics/lean_body_mass.png'), permissions: [{ accessType: 'read', recordType: 'LeanBodyMass' }], type: 'lean_body_mass', category: 'Body Measurements' },

  { id: 'respiratoryRate', labelKey: 'healthMetrics.respiratoryRate', defaultLabel: 'Respiratory Rate', stateKey: 'isRespiratoryRateSyncEnabled', preferenceKey: 'syncRespiratoryRateEnabled', recordType: 'RespiratoryRate', unit: 'breaths/min', icon: require('../assets/icons/health-metrics/respiratory_rate.png'), permissions: [{ accessType: 'read', recordType: 'RespiratoryRate' }], type: 'respiratory_rate', category: 'Vitals', aggregationStrategy: 'min-max-avg' },
  { id: 'restingHeartRate', labelKey: 'healthMetrics.restingHeartRate', defaultLabel: 'Resting Heart Rate', stateKey: 'isRestingHeartRateSyncEnabled', preferenceKey: 'syncRestingHeartRateEnabled', recordType: 'RestingHeartRate', unit: 'bpm', icon: require('../assets/icons/health-metrics/resting_heart_rate.png'), permissions: [{ accessType: 'read', recordType: 'RestingHeartRate' }], type: 'resting_heart_rate', category: 'Vitals' },
  { id: 'heartRateVariability', labelKey: 'healthMetrics.heartRateVariability', defaultLabel: 'Heart Rate Variability', stateKey: 'isHeartRateVariabilitySyncEnabled', preferenceKey: 'syncHeartRateVariabilityEnabled', recordType: 'HeartRateVariabilitySDNN', unit: 'ms', icon: require('../assets/icons/health-metrics/heart_rate.png'), permissions: [{ accessType: 'read', recordType: 'HeartRateVariabilitySDNN' }], type: 'HRV_SDNN', platforms: ['ios'], category: 'Vitals', aggregationStrategy: 'min-max-avg' },
  { id: 'heartRateVariability', labelKey: 'healthMetrics.heartRateVariability', defaultLabel: 'Heart Rate Variability', stateKey: 'isHeartRateVariabilitySyncEnabled', preferenceKey: 'syncHeartRateVariabilityEnabled', recordType: 'HeartRateVariabilityRmssd', unit: 'ms', icon: require('../assets/icons/health-metrics/heart_rate.png'), permissions: [{ accessType: 'read', recordType: 'HeartRateVariabilityRmssd' }], type: 'HRV', platforms: ['android'], category: 'Vitals', aggregationStrategy: 'min-max-avg' },

  { id: 'vo2Max', labelKey: 'healthMetrics.vo2Max', defaultLabel: 'VO2 Max', stateKey: 'isVo2MaxSyncEnabled', preferenceKey: 'syncVo2MaxEnabled', recordType: 'Vo2Max', unit: 'ml/min/kg', icon: require('../assets/icons/health-metrics/vo2_max.png'), permissions: [{ accessType: 'read', recordType: 'Vo2Max' }], type: 'vo2_max', category: 'Body Measurements' },
  { id: 'wheelchairPushes', labelKey: 'healthMetrics.wheelchairPushes', defaultLabel: 'Wheelchair Pushes', stateKey: 'isWheelchairPushesSyncEnabled', preferenceKey: 'syncWheelchairPushesEnabled', recordType: 'WheelchairPushes', unit: 'count', icon: require('../assets/icons/health-metrics/wheelchair_pushes.png'), permissions: [{ accessType: 'read', recordType: 'WheelchairPushes' }], type: 'wheelchair_pushes', category: 'Activity' },
  // ---- Added missing metrics ----
  // Android‑only metrics
  { id: 'speed', labelKey: 'healthMetrics.speed', defaultLabel: 'Speed', stateKey: 'isSpeedSyncEnabled', preferenceKey: 'syncSpeedEnabled', recordType: 'Speed', unit: 'm/s', icon: require('../assets/icons/health-metrics/speed.png'), permissions: [{ accessType: 'read', recordType: 'Speed' }], type: 'speed', platforms: ['android'], category: 'Activity' },
  { id: 'power', labelKey: 'healthMetrics.power', defaultLabel: 'Power', stateKey: 'isPowerSyncEnabled', preferenceKey: 'syncPowerEnabled', recordType: 'Power', unit: 'watts', icon: require('../assets/icons/health-metrics/power.png'), permissions: [{ accessType: 'read', recordType: 'Power' }], type: 'power', platforms: ['android'], category: 'Activity' },
  { id: 'elevationGained', labelKey: 'healthMetrics.elevationGained', defaultLabel: 'Elevation Gained', stateKey: 'isElevationGainedSyncEnabled', preferenceKey: 'syncElevationGainedEnabled', recordType: 'ElevationGained', unit: 'm', icon: require('../assets/icons/health-metrics/elevation_gained.png'), permissions: [{ accessType: 'read', recordType: 'ElevationGained' }], type: 'elevation_gained', platforms: ['android'], category: 'Activity' },
  { id: 'boneMass', labelKey: 'healthMetrics.boneMass', defaultLabel: 'Bone Mass', stateKey: 'isBoneMassSyncEnabled', preferenceKey: 'syncBoneMassEnabled', recordType: 'BoneMass', unit: 'kg', icon: require('../assets/icons/health-metrics/bone_mass.png'), permissions: [{ accessType: 'read', recordType: 'BoneMass' }], type: 'bone_mass', category: 'Body Measurements' },
  { id: 'cervicalMucus', labelKey: 'healthMetrics.cervicalMucus', defaultLabel: 'Cervical Mucus', stateKey: 'isCervicalMucusSyncEnabled', preferenceKey: 'syncCervicalMucusEnabled', recordType: 'CervicalMucus', unit: 'level', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'CervicalMucus' }], type: 'cervical_mucus', platforms: ['android'], category: 'Reproductive' },
  { id: 'cyclingPedalingCadence', labelKey: 'healthMetrics.cyclingPedalingCadence', defaultLabel: 'Cycling Pedaling Cadence', stateKey: 'isCyclingPedalingCadenceSyncEnabled', preferenceKey: 'syncCyclingPedalingCadenceEnabled', recordType: 'CyclingPedalingCadence', unit: 'rpm', icon: require('../assets/icons/health-metrics/cycling_pedaling_cadence.png'), permissions: [{ accessType: 'read', recordType: 'CyclingPedalingCadence' }], type: 'cycling_pedaling_cadence', platforms: ['android'], category: 'Activity' },
  { id: 'intermenstrualBleeding', labelKey: 'healthMetrics.intermenstrualBleeding', defaultLabel: 'Intermenstrual Bleeding', stateKey: 'isIntermenstrualBleedingSyncEnabled', preferenceKey: 'syncIntermenstrualBleedingEnabled', recordType: 'IntermenstrualBleeding', unit: 'level', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'IntermenstrualBleeding' }], type: 'intermenstrual_bleeding', platforms: ['android'], category: 'Reproductive' },
  { id: 'menstruationPeriod', labelKey: 'healthMetrics.menstruationPeriod', defaultLabel: 'Menstruation Period', stateKey: 'isMenstruationPeriodSyncEnabled', preferenceKey: 'syncMenstruationPeriodEnabled', recordType: 'MenstruationPeriod', unit: 'date_range', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'MenstruationPeriod' }], type: 'menstruation_period', platforms: ['android'], category: 'Reproductive' },
  { id: 'ovulationTest', labelKey: 'healthMetrics.ovulationTest', defaultLabel: 'Ovulation Test', stateKey: 'isOvulationTestSyncEnabled', preferenceKey: 'syncOvulationTestEnabled', recordType: 'OvulationTest', unit: 'result', icon: require('../assets/icons/health-metrics/ovulation_test.png'), permissions: [{ accessType: 'read', recordType: 'OvulationTest' }], type: 'ovulation_test', platforms: ['android'], category: 'Reproductive' },
  { id: 'stepsCadence', labelKey: 'healthMetrics.stepsCadence', defaultLabel: 'Steps Cadence', stateKey: 'isStepsCadenceSyncEnabled', preferenceKey: 'syncStepsCadenceEnabled', recordType: 'StepsCadence', unit: 'steps_per_second', icon: require('../assets/icons/health-metrics/steps.png'), permissions: [{ accessType: 'read', recordType: 'StepsCadence' }], type: 'steps_cadence', platforms: ['android'], category: 'Activity', aggregationStrategy: 'min-max-avg' },
  { id: 'bloodOxygenSaturation', labelKey: 'healthMetrics.bloodOxygenSaturation', defaultLabel: 'Blood Oxygen Saturation', stateKey: 'isBloodOxygenSaturationSyncEnabled', preferenceKey: 'syncBloodOxygenSaturationEnabled', recordType: 'OxygenSaturation', unit: 'percent', icon: require('../assets/icons/health-metrics/blood_oxygen_saturation.png'), permissions: [{ accessType: 'read', recordType: 'OxygenSaturation' }], type: 'blood_oxygen_saturation', platforms: ['android'], category: 'Vitals', aggregationStrategy: 'min-max-avg' },
  // iOS‑only metrics
  { id: 'bloodAlcoholContent', labelKey: 'healthMetrics.bloodAlcoholContent', defaultLabel: 'Blood Alcohol Content', stateKey: 'isBloodAlcoholContentSyncEnabled', preferenceKey: 'syncBloodAlcoholContentEnabled', recordType: 'BloodAlcoholContent', unit: 'percent', icon: require('../assets/icons/health-metrics/blood_alcohol_content.png'), permissions: [{ accessType: 'read', recordType: 'BloodAlcoholContent' }], type: 'blood_alcohol_content', platforms: ['ios'], category: 'Vitals' },
  { id: 'bloodOxygenSaturation', labelKey: 'healthMetrics.bloodOxygenSaturation', defaultLabel: 'Blood Oxygen Saturation', stateKey: 'isBloodOxygenSaturationSyncEnabled', preferenceKey: 'syncBloodOxygenSaturationEnabled', recordType: 'BloodOxygenSaturation', unit: 'percent', icon: require('../assets/icons/health-metrics/blood_oxygen_saturation.png'), permissions: [{ accessType: 'read', recordType: 'BloodOxygenSaturation' }], type: 'blood_oxygen_saturation', platforms: ['ios'], category: 'Vitals', aggregationStrategy: 'min-max-avg' },
  { id: 'menstruationFlow', labelKey: 'healthMetrics.menstruationFlow', defaultLabel: 'Menstruation Flow', stateKey: 'isMenstruationFlowSyncEnabled', preferenceKey: 'syncMenstruationFlowEnabled', recordType: 'MenstruationFlow', unit: 'level', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'MenstruationFlow' }], type: 'menstruation_flow', platforms: ['ios'], category: 'Reproductive' },
  { id: 'menstruationPeriod', labelKey: 'healthMetrics.menstruationPeriod', defaultLabel: 'Menstruation Period', stateKey: 'isMenstruationPeriodSyncEnabled', preferenceKey: 'syncMenstruationPeriodEnabled', recordType: 'MenstruationPeriod', unit: 'date_range', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'MenstruationPeriod' }], type: 'menstruation_period', platforms: ['ios'], category: 'Reproductive' },
  { id: 'ovulationTest', labelKey: 'healthMetrics.ovulationTest', defaultLabel: 'Ovulation Test', stateKey: 'isOvulationTestSyncEnabled', preferenceKey: 'syncOvulationTestEnabled', recordType: 'OvulationTest', unit: 'result', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'OvulationTest' }], type: 'ovulation_test', platforms: ['ios'], category: 'Reproductive' },
  { id: 'cervicalMucus', labelKey: 'healthMetrics.cervicalMucus', defaultLabel: 'Cervical Mucus', stateKey: 'isCervicalMucusSyncEnabled', preferenceKey: 'syncCervicalMucusEnabled', recordType: 'CervicalMucus', unit: 'level', icon: require('../assets/icons/health-metrics/placeholder.png'), permissions: [{ accessType: 'read', recordType: 'CervicalMucus' }], type: 'cervical_mucus', platforms: ['ios'], category: 'Reproductive' },
  { id: 'intermenstrualBleeding', labelKey: 'healthMetrics.intermenstrualBleeding', defaultLabel: 'Intermenstrual Bleeding', stateKey: 'isIntermenstrualBleedingSyncEnabled', preferenceKey: 'syncIntermenstrualBleedingEnabled', recordType: 'IntermenstrualBleeding', unit: 'level', icon: require('../assets/icons/health-metrics/women.png'), permissions: [{ accessType: 'read', recordType: 'IntermenstrualBleeding' }], type: 'intermenstrual_bleeding', platforms: ['ios'], category: 'Reproductive' },
  { id: 'nutritionDietaryFatTotal', labelKey: 'healthMetrics.nutritionDietaryFatTotal', defaultLabel: 'Dietary Fat Total', stateKey: 'isNutritionDietaryFatTotalSyncEnabled', preferenceKey: 'syncNutritionDietaryFatTotalEnabled', recordType: 'DietaryFatTotal', unit: 'g', icon: require('../assets/icons/health-metrics/fat.png'), permissions: [{ accessType: 'read', recordType: 'DietaryFatTotal' }], type: 'dietary_fat_total', platforms: ['ios'], category: 'Nutrition', enabled: false, aggregationStrategy: 'sum' },
  { id: 'nutritionDietaryProtein', labelKey: 'healthMetrics.nutritionDietaryProtein', defaultLabel: 'Dietary Protein', stateKey: 'isNutritionDietaryProteinSyncEnabled', preferenceKey: 'syncNutritionDietaryProteinEnabled', recordType: 'DietaryProtein', unit: 'g', icon: require('../assets/icons/health-metrics/protein.png'), permissions: [{ accessType: 'read', recordType: 'DietaryProtein' }], type: 'dietary_protein', platforms: ['ios'], category: 'Nutrition', enabled: false, aggregationStrategy: 'sum' },
  { id: 'nutritionDietarySodium', labelKey: 'healthMetrics.nutritionDietarySodium', defaultLabel: 'Dietary Sodium', stateKey: 'isNutritionDietarySodiumSyncEnabled', preferenceKey: 'syncNutritionDietarySodiumEnabled', recordType: 'DietarySodium', unit: 'mg', icon: require('../assets/icons/health-metrics/sodium.png'), permissions: [{ accessType: 'read', recordType: 'DietarySodium' }], type: 'dietary_sodium', platforms: ['ios'], category: 'Nutrition', enabled: false, aggregationStrategy: 'sum' },
  // Mobility / gait metrics (iOS only)
  { id: 'walkingSpeed', labelKey: 'healthMetrics.walkingSpeed', defaultLabel: 'Walking Speed', stateKey: 'isWalkingSpeedSyncEnabled', preferenceKey: 'syncWalkingSpeedEnabled', recordType: 'WalkingSpeed', unit: 'm/s', icon: require('../assets/icons/health-metrics/walking_speed.png'), permissions: [{ accessType: 'read', recordType: 'WalkingSpeed' }], type: 'walking_speed', platforms: ['ios'], category: 'Mobility', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'walkingStepLength', labelKey: 'healthMetrics.walkingStepLength', defaultLabel: 'Walking Step Length', stateKey: 'isWalkingStepLengthSyncEnabled', preferenceKey: 'syncWalkingStepLengthEnabled', recordType: 'WalkingStepLength', unit: 'cm', icon: require('../assets/icons/health-metrics/walking_step_length.png'), permissions: [{ accessType: 'read', recordType: 'WalkingStepLength' }], type: 'walking_step_length', platforms: ['ios'], category: 'Mobility', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'walkingAsymmetryPercentage', labelKey: 'healthMetrics.walkingAsymmetryPercentage', defaultLabel: 'Walking Asymmetry %', stateKey: 'isWalkingAsymmetrySyncEnabled', preferenceKey: 'syncWalkingAsymmetryEnabled', recordType: 'WalkingAsymmetryPercentage', unit: 'percent', icon: require('../assets/icons/health-metrics/steps.png'), permissions: [{ accessType: 'read', recordType: 'WalkingAsymmetryPercentage' }], type: 'walking_asymmetry', platforms: ['ios'], category: 'Mobility', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'walkingDoubleSupportPercentage', labelKey: 'healthMetrics.walkingDoubleSupportPercentage', defaultLabel: 'Walking Double Support %', stateKey: 'isWalkingDoubleSupportSyncEnabled', preferenceKey: 'syncWalkingDoubleSupportEnabled', recordType: 'WalkingDoubleSupportPercentage', unit: 'percent', icon: require('../assets/icons/health-metrics/steps.png'), permissions: [{ accessType: 'read', recordType: 'WalkingDoubleSupportPercentage' }], type: 'walking_double_support', platforms: ['ios'], category: 'Mobility', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  // Running metrics (iOS only)
  { id: 'runningGroundContactTime', labelKey: 'healthMetrics.runningGroundContactTime', defaultLabel: 'Running Ground Contact Time', stateKey: 'isRunningGroundContactSyncEnabled', preferenceKey: 'syncRunningGroundContactEnabled', recordType: 'RunningGroundContactTime', unit: 'ms', icon: require('../assets/icons/health-metrics/running_speed.png'), permissions: [{ accessType: 'read', recordType: 'RunningGroundContactTime' }], type: 'running_ground_contact', platforms: ['ios'], category: 'Running', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'runningStrideLength', labelKey: 'healthMetrics.runningStrideLength', defaultLabel: 'Running Stride Length', stateKey: 'isRunningStrideLengthSyncEnabled', preferenceKey: 'syncRunningStrideLengthEnabled', recordType: 'RunningStrideLength', unit: 'cm', icon: require('../assets/icons/health-metrics/running_speed.png'), permissions: [{ accessType: 'read', recordType: 'RunningStrideLength' }], type: 'running_stride_length', platforms: ['ios'], category: 'Running', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'runningPower', labelKey: 'healthMetrics.runningPower', defaultLabel: 'Running Power', stateKey: 'isRunningPowerSyncEnabled', preferenceKey: 'syncRunningPowerEnabled', recordType: 'RunningPower', unit: 'watts', icon: require('../assets/icons/health-metrics/running_speed.png'), permissions: [{ accessType: 'read', recordType: 'RunningPower' }], type: 'running_power', platforms: ['ios'], category: 'Running', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'runningVerticalOscillation', labelKey: 'healthMetrics.runningVerticalOscillation', defaultLabel: 'Running Vertical Oscillation', stateKey: 'isRunningVerticalOscillationSyncEnabled', preferenceKey: 'syncRunningVerticalOscillationEnabled', recordType: 'RunningVerticalOscillation', unit: 'cm', icon: require('../assets/icons/health-metrics/running_speed.png'), permissions: [{ accessType: 'read', recordType: 'RunningVerticalOscillation' }], type: 'running_vertical_oscillation', platforms: ['ios'], category: 'Running', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'runningSpeed', labelKey: 'healthMetrics.runningSpeed', defaultLabel: 'Running Speed', stateKey: 'isRunningSpeedSyncEnabled', preferenceKey: 'syncRunningSpeedEnabled', recordType: 'RunningSpeed', unit: 'm/s', icon: require('../assets/icons/health-metrics/running_speed.png'), permissions: [{ accessType: 'read', recordType: 'RunningSpeed' }], type: 'running_speed', platforms: ['ios'], category: 'Running', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  // Cycling metrics (iOS only)
  { id: 'cyclingSpeed', labelKey: 'healthMetrics.cyclingSpeed', defaultLabel: 'Cycling Speed', stateKey: 'isCyclingSpeedSyncEnabled', preferenceKey: 'syncCyclingSpeedEnabled', recordType: 'CyclingSpeed', unit: 'm/s', icon: require('../assets/icons/health-metrics/cycling_speed.png'), permissions: [{ accessType: 'read', recordType: 'CyclingSpeed' }], type: 'cycling_speed', platforms: ['ios'], category: 'Cycling', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'cyclingPower', labelKey: 'healthMetrics.cyclingPower', defaultLabel: 'Cycling Power', stateKey: 'isCyclingPowerSyncEnabled', preferenceKey: 'syncCyclingPowerEnabled', recordType: 'CyclingPower', unit: 'watts', icon: require('../assets/icons/health-metrics/cycling_speed.png'), permissions: [{ accessType: 'read', recordType: 'CyclingPower' }], type: 'cycling_power', platforms: ['ios'], category: 'Cycling', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'cyclingCadence', labelKey: 'healthMetrics.cyclingCadence', defaultLabel: 'Cycling Cadence', stateKey: 'isCyclingCadenceSyncEnabled', preferenceKey: 'syncCyclingCadenceEnabled', recordType: 'CyclingCadence', unit: 'rpm', icon: require('../assets/icons/health-metrics/cycling_speed.png'), permissions: [{ accessType: 'read', recordType: 'CyclingCadence' }], type: 'cycling_cadence', platforms: ['ios'], category: 'Cycling', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'min-max-avg' },
  { id: 'cyclingFunctionalThresholdPower', labelKey: 'healthMetrics.cyclingFunctionalThresholdPower', defaultLabel: 'Cycling Functional Threshold Power', stateKey: 'isCyclingFTPsyncEnabled', preferenceKey: 'syncCyclingFTPEnabled', recordType: 'CyclingFunctionalThresholdPower', unit: 'watts', icon: require('../assets/icons/health-metrics/cycling_speed.png'), permissions: [{ accessType: 'read', recordType: 'CyclingFunctionalThresholdPower' }], type: 'cycling_ftp', platforms: ['ios'], category: 'Cycling', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'last' },
  // Environmental / audio metrics (iOS only)
  { id: 'environmentalAudioExposure', labelKey: 'healthMetrics.environmentalAudioExposure', defaultLabel: 'Environmental Audio Exposure', stateKey: 'isEnvironmentalAudioExposureSyncEnabled', preferenceKey: 'syncEnvironmentalAudioExposureEnabled', recordType: 'EnvironmentalAudioExposure', unit: 'dB', icon: require('../assets/icons/health-metrics/audio_exposure.png'), permissions: [{ accessType: 'read', recordType: 'EnvironmentalAudioExposure' }], type: 'environmental_audio_exposure', platforms: ['ios'], category: 'Environment', enabled: false, aggregationStrategy: 'min-max-avg' },
  { id: 'headphoneAudioExposure', labelKey: 'healthMetrics.headphoneAudioExposure', defaultLabel: 'Headphone Audio Exposure', stateKey: 'isHeadphoneAudioExposureSyncEnabled', preferenceKey: 'syncHeadphoneAudioExposureEnabled', recordType: 'HeadphoneAudioExposure', unit: 'dB', icon: require('../assets/icons/health-metrics/headphone_audio_exposure.png'), permissions: [{ accessType: 'read', recordType: 'HeadphoneAudioExposure' }], type: 'headphone_audio_exposure', platforms: ['ios'], category: 'Environment', enabled: false, aggregationStrategy: 'min-max-avg' },
  // Apple‑specific metrics (iOS only)
  { id: 'appleMoveTime', labelKey: 'healthMetrics.appleMoveTime', defaultLabel: 'Apple Move Time', stateKey: 'isAppleMoveTimeSyncEnabled', preferenceKey: 'syncAppleMoveTimeEnabled', recordType: 'AppleMoveTime', unit: 'seconds', icon: require('../assets/icons/health-metrics/move_time.png'), permissions: [{ accessType: 'read', recordType: 'AppleMoveTime' }], type: 'apple_move_time', platforms: ['ios'], category: 'Apple', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'sum' },
  { id: 'appleExerciseTime', labelKey: 'healthMetrics.appleExerciseTime', defaultLabel: 'Apple Exercise Time', stateKey: 'isAppleExerciseTimeSyncEnabled', preferenceKey: 'syncAppleExerciseTimeEnabled', recordType: 'AppleExerciseTime', unit: 'seconds', icon: require('../assets/icons/health-metrics/exercise_time.png'), permissions: [{ accessType: 'read', recordType: 'AppleExerciseTime' }], type: 'apple_exercise_time', platforms: ['ios'], category: 'Apple', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'sum' },
  { id: 'appleStandTime', labelKey: 'healthMetrics.appleStandTime', defaultLabel: 'Apple Stand Time', stateKey: 'isAppleStandTimeSyncEnabled', preferenceKey: 'syncAppleStandTimeEnabled', recordType: 'AppleStandTime', unit: 'seconds', icon: require('../assets/icons/health-metrics/stand_time.png'), permissions: [{ accessType: 'read', recordType: 'AppleStandTime' }], type: 'apple_stand_time', platforms: ['ios'], category: 'Apple', backgroundDeliveryFrequency: 'none', aggregationStrategy: 'sum' },
  // End of added metrics
];

const HEALTH_METRICS: HealthMetric[] = ALL_HEALTH_METRICS.filter(metric => {
  // Skip metrics explicitly disabled (e.g., for v1)
  if (metric.enabled === false) {
    return false;
  }
  if (metric.platforms) {
    return metric.platforms.includes(Platform.OS as 'android' | 'ios');
  }
  return true;
});

export const CATEGORY_ORDER = [
  'Common',
  'Activity',
  'Vitals',
  'Body Measurements',
  'Nutrition',
  'Reproductive',
  'Mobility',
  'Running',
  'Cycling',
  'Environment',
  'Apple',
];

export { HEALTH_METRICS };

export function getHealthMetricLabel(t: (key: string, options: { defaultValue: string }) => string, metric: Pick<HealthMetric, 'id' | 'defaultLabel'>): string {
  switch (metric.id) {
    case 'steps': return t('healthMetrics.steps', { defaultValue: 'Steps' });
    case 'calories': return t('healthMetrics.calories', { defaultValue: 'Active Calories' });
    case 'totalCalories': return t('healthMetrics.totalCalories', { defaultValue: 'Total Calories' });
    case 'heartRate': return t('healthMetrics.heartRate', { defaultValue: 'Heart Rate' });
    case 'weight': return t('healthMetrics.weight', { defaultValue: 'Weight' });
    case 'bloodPressure': return t('healthMetrics.bloodPressure', { defaultValue: 'Blood Pressure' });
    case 'nutrition': return t('healthMetrics.nutrition', { defaultValue: 'Nutrition' });
    case 'sleepSession': return t('healthMetrics.sleepSession', { defaultValue: 'Sleep Session' });
    case 'stress': return t('healthMetrics.stress', { defaultValue: 'Stress' });
    case 'basalBodyTemperature': return t('healthMetrics.basalBodyTemperature', { defaultValue: 'Basal Body Temperature' });
    case 'basalMetabolicRate': return t('healthMetrics.basalMetabolicRate', { defaultValue: 'Basal Metabolic Rate' });
    case 'bloodGlucose': return t('healthMetrics.bloodGlucose', { defaultValue: 'Blood Glucose' });
    case 'bodyFat': return t('healthMetrics.bodyFat', { defaultValue: 'Body Fat' });
    case 'bodyTemperature': return t('healthMetrics.bodyTemperature', { defaultValue: 'Body Temperature' });
    case 'distance': return t('healthMetrics.distance', { defaultValue: 'Distance' });
    case 'exerciseSession': return t('healthMetrics.exerciseSession', { defaultValue: 'Exercise Session' });
    case 'floorsClimbed': return t('healthMetrics.floorsClimbed', { defaultValue: 'Floors Climbed' });
    case 'height': return t('healthMetrics.height', { defaultValue: 'Height' });
    case 'hydration': return t('healthMetrics.hydration', { defaultValue: 'Hydration' });
    case 'leanBodyMass': return t('healthMetrics.leanBodyMass', { defaultValue: 'Lean Body Mass' });
    case 'respiratoryRate': return t('healthMetrics.respiratoryRate', { defaultValue: 'Respiratory Rate' });
    case 'restingHeartRate': return t('healthMetrics.restingHeartRate', { defaultValue: 'Resting Heart Rate' });
    case 'heartRateVariability': return t('healthMetrics.heartRateVariability', { defaultValue: 'Heart Rate Variability' });
    case 'vo2Max': return t('healthMetrics.vo2Max', { defaultValue: 'VO2 Max' });
    case 'wheelchairPushes': return t('healthMetrics.wheelchairPushes', { defaultValue: 'Wheelchair Pushes' });
    case 'speed': return t('healthMetrics.speed', { defaultValue: 'Speed' });
    case 'power': return t('healthMetrics.power', { defaultValue: 'Power' });
    case 'elevationGained': return t('healthMetrics.elevationGained', { defaultValue: 'Elevation Gained' });
    case 'boneMass': return t('healthMetrics.boneMass', { defaultValue: 'Bone Mass' });
    case 'cervicalMucus': return t('healthMetrics.cervicalMucus', { defaultValue: 'Cervical Mucus' });
    case 'cyclingPedalingCadence': return t('healthMetrics.cyclingPedalingCadence', { defaultValue: 'Cycling Pedaling Cadence' });
    case 'intermenstrualBleeding': return t('healthMetrics.intermenstrualBleeding', { defaultValue: 'Intermenstrual Bleeding' });
    case 'menstruationPeriod': return t('healthMetrics.menstruationPeriod', { defaultValue: 'Menstruation Period' });
    case 'ovulationTest': return t('healthMetrics.ovulationTest', { defaultValue: 'Ovulation Test' });
    case 'stepsCadence': return t('healthMetrics.stepsCadence', { defaultValue: 'Steps Cadence' });
    case 'bloodOxygenSaturation': return t('healthMetrics.bloodOxygenSaturation', { defaultValue: 'Blood Oxygen Saturation' });
    case 'bloodAlcoholContent': return t('healthMetrics.bloodAlcoholContent', { defaultValue: 'Blood Alcohol Content' });
    case 'menstruationFlow': return t('healthMetrics.menstruationFlow', { defaultValue: 'Menstruation Flow' });
    case 'nutritionDietaryFatTotal': return t('healthMetrics.nutritionDietaryFatTotal', { defaultValue: 'Dietary Fat Total' });
    case 'nutritionDietaryProtein': return t('healthMetrics.nutritionDietaryProtein', { defaultValue: 'Dietary Protein' });
    case 'nutritionDietarySodium': return t('healthMetrics.nutritionDietarySodium', { defaultValue: 'Dietary Sodium' });
    case 'walkingSpeed': return t('healthMetrics.walkingSpeed', { defaultValue: 'Walking Speed' });
    case 'walkingStepLength': return t('healthMetrics.walkingStepLength', { defaultValue: 'Walking Step Length' });
    case 'walkingAsymmetryPercentage': return t('healthMetrics.walkingAsymmetryPercentage', { defaultValue: 'Walking Asymmetry %' });
    case 'walkingDoubleSupportPercentage': return t('healthMetrics.walkingDoubleSupportPercentage', { defaultValue: 'Walking Double Support %' });
    case 'runningGroundContactTime': return t('healthMetrics.runningGroundContactTime', { defaultValue: 'Running Ground Contact Time' });
    case 'runningStrideLength': return t('healthMetrics.runningStrideLength', { defaultValue: 'Running Stride Length' });
    case 'runningPower': return t('healthMetrics.runningPower', { defaultValue: 'Running Power' });
    case 'runningVerticalOscillation': return t('healthMetrics.runningVerticalOscillation', { defaultValue: 'Running Vertical Oscillation' });
    case 'runningSpeed': return t('healthMetrics.runningSpeed', { defaultValue: 'Running Speed' });
    case 'cyclingSpeed': return t('healthMetrics.cyclingSpeed', { defaultValue: 'Cycling Speed' });
    case 'cyclingPower': return t('healthMetrics.cyclingPower', { defaultValue: 'Cycling Power' });
    case 'cyclingCadence': return t('healthMetrics.cyclingCadence', { defaultValue: 'Cycling Cadence' });
    case 'cyclingFunctionalThresholdPower': return t('healthMetrics.cyclingFunctionalThresholdPower', { defaultValue: 'Cycling Functional Threshold Power' });
    case 'environmentalAudioExposure': return t('healthMetrics.environmentalAudioExposure', { defaultValue: 'Environmental Audio Exposure' });
    case 'headphoneAudioExposure': return t('healthMetrics.headphoneAudioExposure', { defaultValue: 'Headphone Audio Exposure' });
    case 'appleMoveTime': return t('healthMetrics.appleMoveTime', { defaultValue: 'Apple Move Time' });
    case 'appleExerciseTime': return t('healthMetrics.appleExerciseTime', { defaultValue: 'Apple Exercise Time' });
    case 'appleStandTime': return t('healthMetrics.appleStandTime', { defaultValue: 'Apple Stand Time' });
    default: return t('healthMetrics.unknown', { defaultValue: 'Health metric' });
  }
}

export function getHealthCategoryLabel(
  t: (key: string, options: { defaultValue: string }) => string,
  category: string,
): string {
  switch (category) {
    case 'Common': return t('healthCategories.Common', { defaultValue: 'Common' });
    case 'Activity': return t('healthCategories.Activity', { defaultValue: 'Activity' });
    case 'Vitals': return t('healthCategories.Vitals', { defaultValue: 'Vitals' });
    case 'Body Measurements': return t('healthCategories.Body Measurements', { defaultValue: 'Body Measurements' });
    case 'Nutrition': return t('healthCategories.Nutrition', { defaultValue: 'Nutrition' });
    case 'Reproductive': return t('healthCategories.Reproductive', { defaultValue: 'Reproductive' });
    case 'Mobility': return t('healthCategories.Mobility', { defaultValue: 'Mobility' });
    case 'Running': return t('healthCategories.Running', { defaultValue: 'Running' });
    case 'Cycling': return t('healthCategories.Cycling', { defaultValue: 'Cycling' });
    case 'Environment': return t('healthCategories.Environment', { defaultValue: 'Environment' });
    case 'Apple': return t('healthCategories.Apple', { defaultValue: 'Apple' });
    default: return t('healthCategories.unknown', { defaultValue: 'Other' });
  }
}
