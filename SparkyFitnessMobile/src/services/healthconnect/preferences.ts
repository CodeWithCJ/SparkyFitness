import {
  createPreferenceFunctions,
  SyncDuration,
  SyncInterval,
} from '../shared/preferences';

// Re-export types for backward compatibility
export { SyncDuration, SyncInterval };

// AsyncStorage key prefix for all Health Connect preferences. Exported so cleanup
// code can enumerate/remove writeback tracking keys directly.
export const HEALTH_PREFERENCE_PREFIX = '@HealthConnect';

// Create preference functions with Health Connect-specific prefix and log tag
const preferences = createPreferenceFunctions(HEALTH_PREFERENCE_PREFIX, '[HealthConnectService]');

export const saveHealthPreference = preferences.saveHealthPreference;
export const loadHealthPreference = preferences.loadHealthPreference;
export const saveStringPreference = preferences.saveStringPreference;
export const loadStringPreference = preferences.loadStringPreference;
export const saveSyncDuration = preferences.saveSyncDuration;
export const loadSyncDuration = preferences.loadSyncDuration;
