export const MANUAL_SYNC_PROVIDERS = [
  'strava',
  'fitbit',
  'oura',
  'polar',
  'coros_mcp',
  'withings',
  'garmin',
  'hevy',
  'liftosaur',
  'intervals',
] as const;

export type ManualSyncProvider = (typeof MANUAL_SYNC_PROVIDERS)[number];
