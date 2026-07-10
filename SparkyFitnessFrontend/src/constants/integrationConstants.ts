export const MANUAL_SYNC_PROVIDERS = [
  'strava',
  'fitbit',
  'polar',
  'withings',
  'garmin',
  'hevy',
] as const;

export type ManualSyncProvider = (typeof MANUAL_SYNC_PROVIDERS)[number];

export const HUAWEI_HEALTH_DATA_SCOPES = [
  'https://www.huawei.com/healthkit/step.read',
  'https://www.huawei.com/healthkit/calories.read',
  'https://www.huawei.com/healthkit/distance.read',
  'https://www.huawei.com/healthkit/heartrate.read',
  'https://www.huawei.com/healthkit/oxygensaturation.read',
  'https://www.huawei.com/healthkit/heightweight.read',
  'https://www.huawei.com/healthkit/sleep.read',
  'https://www.huawei.com/healthkit/activityrecord.read',
] as const;
