import { RESPIRATION_METRICS } from '@/pages/Reports/respirationMetrics';

// Body Battery metric names as they come from Garmin sync
export const BODY_BATTERY_METRICS = [
  'Body Battery Highest',
  'Body Battery Lowest',
  'Body Battery At Wake',
  'Body Battery Charged',
  'Body Battery Drained',
  'Body Battery Current',
];

export const HIDDEN_CUSTOM_METRICS = [
  ...BODY_BATTERY_METRICS,
  ...RESPIRATION_METRICS, // Shown in dedicated Respiration card
  'Average SpO2', // Shown in Sleep tab SpO2 card
  'Average Overnight HRV', // Shown in Sleep tab HRV card
  'GLP Hunger',
  'GLP Food Noise',
  'GLP Fullness',
  'GLP Energy',
];
