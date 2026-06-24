import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * An app-local boolean preference: an in-memory value backed by AsyncStorage,
 * with a subscribe hook for live UI updates. Used for device-only toggles that
 * are never synced to the server (haptics, sound effects, local notifications,
 * dashboard card visibility, ...).
 */
export interface BooleanPreference {
  /** Load the persisted value into memory. Idempotent; safe to call at app start. */
  initialize: () => Promise<void>;
  /** Update the value, notify subscribers, and persist it. */
  set: (value: boolean) => Promise<void>;
  /** Synchronous read of the current in-memory value. */
  get: () => boolean;
  /** React hook returning the current value and re-rendering on change. */
  use: () => boolean;
  /** Test-only — resets module state back to the default. */
  __reset: () => void;
}

export function createBooleanPreference(
  storageKey: string,
  defaultValue: boolean,
): BooleanPreference {
  let value = defaultValue;
  let initialized = false;
  const listeners = new Set<(value: boolean) => void>();

  return {
    async initialize() {
      if (initialized) return;
      try {
        const saved = await AsyncStorage.getItem(storageKey);
        // A user toggle that landed during the await above already set
        // `initialized = true`; don't clobber their choice with stored state.
        if (!initialized && saved !== null) {
          value = saved === 'true';
        }
      } catch {
        // fall back to the default
      } finally {
        if (!initialized) {
          initialized = true;
          listeners.forEach((l) => l(value));
        }
      }
    },

    async set(next) {
      // An explicit user toggle wins over any still-pending initialize().
      initialized = true;
      value = next;
      listeners.forEach((l) => l(next));
      try {
        await AsyncStorage.setItem(storageKey, String(next));
      } catch {
        // ignore — in-memory value still updates so the UI responds immediately
      }
    },

    get() {
      return value;
    },

    use() {
      return useSyncExternalStore(
        (callback) => {
          listeners.add(callback);
          return () => {
            listeners.delete(callback);
          };
        },
        () => value,
      );
    },

    __reset() {
      value = defaultValue;
      initialized = false;
      listeners.clear();
    },
  };
}
