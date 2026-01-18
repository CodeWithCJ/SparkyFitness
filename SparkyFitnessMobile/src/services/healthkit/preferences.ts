import {
  createPreferenceFunctions,
  SyncDuration,
  SyncInterval,
} from '../shared/preferences';

// Re-export types for backward compatibility
export { SyncDuration, SyncInterval };

// Create preference functions with HealthKit-specific prefix and log tag
const preferences = createPreferenceFunctions('@HealthKit', '[HealthKitService]');

export const saveHealthPreference = preferences.saveHealthPreference;
export const loadHealthPreference = preferences.loadHealthPreference;
export const saveStringPreference = preferences.saveStringPreference;
export const loadStringPreference = preferences.loadStringPreference;
export const saveSyncDuration = preferences.saveSyncDuration;
export const loadSyncDuration = preferences.loadSyncDuration;
