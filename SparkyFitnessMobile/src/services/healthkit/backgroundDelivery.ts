import {
  enableBackgroundDelivery,
  disableBackgroundDelivery,
  disableAllBackgroundDelivery,
  subscribeToChanges,
  UpdateFrequency
} from '@kingstinct/react-native-healthkit';
import type { ObjectTypeIdentifier, SampleTypeIdentifier } from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { HEALTHKIT_TYPE_MAP } from './index';
import { HEALTH_METRICS } from '../../HealthMetrics';
import type { BackgroundDeliveryFrequency, HealthMetric } from '../../HealthMetrics';
import { loadHealthPreference } from './preferences';

function getBackgroundDeliveryFrequency(recordType: string): BackgroundDeliveryFrequency {
  const metric = HEALTH_METRICS.find(m => m.recordType === recordType);
  return metric?.backgroundDeliveryFrequency ?? 'daily';
}

type NativeUpdateFrequency = typeof UpdateFrequency[keyof typeof UpdateFrequency];

function toUpdateFrequency(frequency: BackgroundDeliveryFrequency): NativeUpdateFrequency | null {
  if (frequency === 'none') return null;
  // UpdateFrequency.hourly (2) < UpdateFrequency.daily (3) — lower = more aggressive
  return frequency === 'hourly' ? UpdateFrequency.hourly : UpdateFrequency.daily;
}

async function getEnabledIdentifierFrequencies(options?: {
  forceEnabledRecordTypes?: string[];
  forceDisabledRecordTypes?: string[];
}): Promise<Map<string, NativeUpdateFrequency>> {
  const forceEnabledRecordTypes = new Set(options?.forceEnabledRecordTypes ?? []);
  const forceDisabledRecordTypes = new Set(options?.forceDisabledRecordTypes ?? []);
  const identifierFrequencies = new Map<string, NativeUpdateFrequency>();

  for (const metric of HEALTH_METRICS) {
    const enabled = await isMetricEnabled(metric, forceEnabledRecordTypes, forceDisabledRecordTypes);
    if (!enabled) continue;

    const frequency = metric.backgroundDeliveryFrequency ?? 'daily';
    const updateFreq = toUpdateFrequency(frequency);
    if (updateFreq === null) continue;

    for (const id of resolveHKIdentifiers(metric.recordType)) {
      const existing = identifierFrequencies.get(id);
      if (existing === undefined || updateFreq < existing) {
        identifierFrequencies.set(id, updateFreq);
      }
    }
  }

  return identifierFrequencies;
}

async function isMetricEnabled(
  metric: HealthMetric,
  forceEnabledRecordTypes: Set<string>,
  forceDisabledRecordTypes: Set<string>,
): Promise<boolean> {
  if (forceDisabledRecordTypes.has(metric.recordType)) {
    return false;
  }
  if (forceEnabledRecordTypes.has(metric.recordType)) {
    return true;
  }
  return Boolean(await loadHealthPreference<boolean>(metric.preferenceKey));
}

// Active observer subscriptions keyed by HK identifier
const subscriptions = new Map<string, { remove: () => void }>();

// Module-level state for subscription management
let storedCallback: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
// Incremented each time rebuildSubscriptions is called so that stale async
// rebuilds discard their results instead of registering orphaned observers.
let rebuildGeneration = 0;

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
  const frequency = getBackgroundDeliveryFrequency(recordType);
  if (toUpdateFrequency(frequency) === null) {
    addLog(`[BackgroundDelivery] Skipping background delivery for ${recordType} (foreground-only)`, 'DEBUG');
  }

  const desiredFrequencies = await getEnabledIdentifierFrequencies({
    forceEnabledRecordTypes: [recordType],
  });
  const identifiers = resolveHKIdentifiers(recordType);
  for (const id of identifiers) {
    const desiredFrequency = desiredFrequencies.get(id);
    if (desiredFrequency === undefined) {
      continue;
    }

    try {
      await enableBackgroundDelivery(id as ObjectTypeIdentifier, desiredFrequency);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[BackgroundDelivery] Failed to enable for ${id}: ${message}`, 'ERROR');
    }
  }
}

export async function disableBackgroundDeliveryForMetric(recordType: string): Promise<void> {
  const identifiers = resolveHKIdentifiers(recordType);
  const desiredFrequencies = await getEnabledIdentifierFrequencies({
    forceDisabledRecordTypes: [recordType],
  });

  for (const id of identifiers) {
    const desiredFrequency = desiredFrequencies.get(id);
    if (desiredFrequency !== undefined) {
      addLog(`[BackgroundDelivery] Keeping delivery for ${id}: still needed by another enabled metric`, 'DEBUG');
      try {
        await enableBackgroundDelivery(id as ObjectTypeIdentifier, desiredFrequency);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[BackgroundDelivery] Failed to update frequency for ${id}: ${message}`, 'ERROR');
      }
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
  const identifierFrequencies = await getEnabledIdentifierFrequencies();

  addLog(`[BackgroundDelivery] Registering background delivery for ${identifierFrequencies.size} HK types`, 'DEBUG');

  for (const [id, freq] of identifierFrequencies) {
    try {
      await enableBackgroundDelivery(id as ObjectTypeIdentifier, freq);
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

  const generation = ++rebuildGeneration;

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
      // A newer rebuild was started while we were loading preferences —
      // discard these results to avoid registering orphaned observers.
      if (generation !== rebuildGeneration) {
        addLog(`[BackgroundDelivery] Discarding stale rebuild (generation ${generation}, current ${rebuildGeneration})`, 'DEBUG');
        return;
      }

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
