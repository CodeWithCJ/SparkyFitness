import {
  enableBackgroundDelivery,
  disableBackgroundDelivery,
  disableAllBackgroundDelivery,
  subscribeToChanges,
} from '@kingstinct/react-native-healthkit';
import type { ObjectTypeIdentifier, SampleTypeIdentifier } from '@kingstinct/react-native-healthkit';
import { UpdateFrequency } from '@kingstinct/react-native-healthkit';

import { addLog } from '../LogService';
import { HEALTHKIT_TYPE_MAP } from './index';
import { HEALTH_METRICS } from '../../HealthMetrics';
import { loadHealthPreference } from './preferences';

// Active observer subscriptions keyed by HK identifier
const subscriptions = new Map<string, { remove: () => void }>();

// Module-level state for subscription management
let storedCallback: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Resolve a metric recordType to the set of real HK identifiers it maps to.
 * BloodPressure expands to systolic + diastolic; the 'BloodPressure' sentinel is skipped.
 * Multiple recordTypes may map to the same HK identifier (e.g. Workout/ExerciseSession/ExerciseRoute
 * all → HKWorkoutTypeIdentifier), so callers should deduplicate when batching.
 */
function resolveHKIdentifiers(recordType: string): string[] {
  if (recordType === 'BloodPressure') {
    return [
      HEALTHKIT_TYPE_MAP['BloodPressureSystolic'],
      HEALTHKIT_TYPE_MAP['BloodPressureDiastolic'],
    ].filter(Boolean);
  }

  const identifier = HEALTHKIT_TYPE_MAP[recordType];
  if (!identifier || identifier === 'BloodPressure') {
    return [];
  }
  return [identifier];
}

export async function enableBackgroundDeliveryForMetric(recordType: string): Promise<void> {
  const identifiers = resolveHKIdentifiers(recordType);
  for (const id of identifiers) {
    try {
      await enableBackgroundDelivery(id as ObjectTypeIdentifier, UpdateFrequency.hourly);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to enable for ${id}: ${message}`, 'ERROR');
    }
  }
}

export async function disableBackgroundDeliveryForMetric(recordType: string): Promise<void> {
  const identifiers = resolveHKIdentifiers(recordType);

  // Build the set of HK identifiers still needed by other enabled metrics.
  // The caller saves the preference before calling this, so the metric being
  // disabled already reads as false — no need to filter it out explicitly.
  const stillNeeded = new Set<string>();
  for (const metric of HEALTH_METRICS) {
    const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
    if (!enabled) continue;
    for (const id of resolveHKIdentifiers(metric.recordType)) {
      stillNeeded.add(id);
    }
  }

  for (const id of identifiers) {
    if (stillNeeded.has(id)) {
      addLog(`[BackgroundDelivery] Keeping delivery for ${id}: still needed by another enabled metric`, 'DEBUG');
      continue;
    }
    try {
      await disableBackgroundDelivery(id as ObjectTypeIdentifier);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to disable for ${id}: ${message}`, 'ERROR');
    }
  }
}

export async function setupBackgroundDeliveryForEnabledMetrics(): Promise<void> {
  // Collect all unique HK identifiers for enabled metrics
  const identifiers = new Set<string>();

  for (const metric of HEALTH_METRICS) {
    const enabled = await loadHealthPreference<boolean>(metric.preferenceKey);
    if (!enabled) continue;
    for (const id of resolveHKIdentifiers(metric.recordType)) {
      identifiers.add(id);
    }
  }

  addLog(`[BackgroundDelivery] Registering background delivery for ${identifiers.size} HK types`, 'DEBUG');

  for (const id of identifiers) {
    try {
      await enableBackgroundDelivery(id as ObjectTypeIdentifier, UpdateFrequency.hourly);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to enable for ${id}: ${message}`, 'ERROR');
    }
  }
}

/**
 * Read current metric preferences and (re-)subscribe to HealthKit observer
 * queries for all enabled metrics. Cleans up any existing subscriptions first.
 */
function rebuildSubscriptions(): void {
  cleanupAllSubscriptions();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;

  const callback = storedCallback;
  if (!callback) return;

  const identifiersToSubscribe = new Set<string>();
  const enabledChecks: Promise<void>[] = [];

  for (const metric of HEALTH_METRICS) {
    enabledChecks.push(
      loadHealthPreference<boolean>(metric.preferenceKey).then((enabled) => {
        if (!enabled) return;
        for (const id of resolveHKIdentifiers(metric.recordType)) {
          identifiersToSubscribe.add(id);
        }
      }),
    );
  }

  const debouncedCallback = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      callback();
    }, 5000);
  };

  Promise.all(enabledChecks)
    .then(() => {
      addLog(`[BackgroundDelivery] Subscribing to changes for ${identifiersToSubscribe.size} HK types`, 'DEBUG');
      for (const id of identifiersToSubscribe) {
        try {
          const sub = subscribeToChanges(id as SampleTypeIdentifier, () => {
            addLog(`[BackgroundDelivery] Change detected for ${id}`, 'DEBUG');
            debouncedCallback();
          });
          subscriptions.set(id, sub);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          addLog(`[BackgroundDelivery] Failed to subscribe to ${id}: ${message}`, 'ERROR');
        }
      }
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to set up subscriptions: ${message}`, 'ERROR');
    });
}

/**
 * Subscribe to HealthKit observer queries for all enabled metrics.
 * When any observer fires (typically after phone unlock with new data),
 * waits for a debounce window then invokes `onDataAvailable` once.
 * Returns a cleanup function.
 */
export function subscribeToEnabledMetricChanges(
  onDataAvailable: () => void,
): () => void {
  storedCallback = onDataAvailable;
  rebuildSubscriptions();

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    cleanupAllSubscriptions();
    storedCallback = null;
  };
}

/**
 * Rebuild observer subscriptions from current metric preferences.
 * Call this after toggling metrics in Settings so that newly enabled
 * metrics start firing observers, and disabled ones stop.
 * No-op if subscribeToEnabledMetricChanges has not been called yet.
 */
export function refreshSubscriptions(): void {
  if (!storedCallback) return;
  rebuildSubscriptions();
}

/**
 * Start HealthKit observers: enable background delivery and subscribe to
 * metric changes. Safe to call multiple times — tears down existing
 * subscriptions first. Provide the callback that should fire when new
 * health data is available.
 */
export function startObservers(onDataAvailable: () => void): void {
  setupBackgroundDeliveryForEnabledMetrics().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[BackgroundDelivery] Failed to setup background delivery: ${message}`, 'ERROR');
  });

  // subscribeToEnabledMetricChanges cleans up any existing subscriptions
  subscribeToEnabledMetricChanges(onDataAvailable);
}

/**
 * Stop all HealthKit observers and disable background delivery.
 */
export function stopObservers(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  cleanupAllSubscriptions();
  storedCallback = null;

  disableAllBackgroundDelivery().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[BackgroundDelivery] Failed to disable all background delivery: ${message}`, 'ERROR');
  });
}

export function cleanupAllSubscriptions(): void {
  for (const [id, sub] of subscriptions) {
    try {
      sub.remove();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to remove subscription for ${id}: ${message}`, 'ERROR');
    }
  }
  subscriptions.clear();
}

export { disableAllBackgroundDelivery };
