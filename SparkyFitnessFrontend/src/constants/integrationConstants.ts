export const MANUAL_SYNC_PROVIDERS = [
  'strava',
  'fitbit',
  'oura',
  'polar',
  'withings',
  'garmin',
  'hevy',
] as const;

export type ManualSyncProvider = (typeof MANUAL_SYNC_PROVIDERS)[number];
