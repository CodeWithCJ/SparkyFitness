import { AppState } from 'react-native';
import BackgroundWaterModule from '../../modules/background-water';
import type { WaterContainer } from '../types/measurements';
import { normalizeUrl } from '../utils/serverUrl';
import {
  WATER_UNIT_LABELS,
  formatVolumeForUnit,
  getServingVolume,
  volumeFromMl,
} from '../utils/unitConversions';
import { addLog } from './LogService';
import { setNativeMedicationActiveUser } from './medicationNativeBridge';
import { getAuthHeaders } from './api/authService';
import { getActiveServerConfig, proxyHeadersToRecord } from './storage';

/** What the native "Log water" shortcut needs to log a drink with the app closed. */
export interface BackgroundWaterConfig {
  baseUrl: string;
  headers: Record<string, string>;
  /** Absent when the user has no water container yet; water actions then ask for one. */
  containerId?: number;
  containerName?: string;
  volumeLabel?: string | null;
  /** The unit a weight is spoken or typed in; the server always stores kg. */
  weightUnit: 'kg' | 'lbs';
}

type BackgroundWaterContainer = Pick<
  WaterContainer,
  | 'id'
  | 'name'
  | 'volume'
  | 'unit'
  | 'servings_per_container'
  | 'linked_food_id'
>;

/** What one drink holds, in the container's own unit, e.g. "16 oz". */
export function drinkVolumeLabel(
  container: BackgroundWaterContainer
): string | null {
  // Volumes are stored in millilitres and divided into servings; a container
  // linked to a food has no volume of its own.
  const ml = getServingVolume(container);
  if (!ml || ml <= 0) return null;
  const unit = container.unit;
  return `${formatVolumeForUnit(volumeFromMl(ml, unit), unit)} ${WATER_UNIT_LABELS[unit] ?? unit}`;
}

export function buildBackgroundWaterConfig(
  server: Awaited<ReturnType<typeof getActiveServerConfig>>,
  container: BackgroundWaterContainer | undefined,
  weightUnit: 'kg' | 'lbs' = 'kg'
): BackgroundWaterConfig | null {
  if (!server) return null;
  const baseUrl = normalizeUrl(server.url);
  // The app refuses plain HTTP outside development; the shortcut must too.
  if (!__DEV__ && baseUrl.toLowerCase().startsWith('http://')) return null;
  return {
    baseUrl,
    headers: {
      ...proxyHeadersToRecord(server.proxyHeaders),
      ...getAuthHeaders(server),
      'X-Meal-Model-Version': '2',
    },
    ...(container
      ? {
          containerId: container.id,
          containerName: container.name,
          volumeLabel: drinkVolumeLabel(container),
        }
      : {}),
    weightUnit,
  };
}

let syncQueue: Promise<unknown> = Promise.resolve();

/**
 * Runs one sync or clear at a time, in the order asked. Without this, a sync
 * waiting on the stored login could finish after a clear and write the login
 * back after the server was removed.
 */
function enqueue(task: () => Promise<void>): Promise<void> {
  const result = syncQueue.then(task, task);
  syncQueue = result;
  return result;
}

async function store(config: BackgroundWaterConfig | null): Promise<void> {
  if (!BackgroundWaterModule) return;
  try {
    const stored = await BackgroundWaterModule.setConfig(
      config ? JSON.stringify(config) : null
    );
    if (stored === false) {
      addLog('[Background water] The device refused to store it', 'WARNING');
    }
  } catch (error) {
    addLog(`[Background water] Could not update: ${String(error)}`, 'WARNING');
  }
}

/**
 * Keeps the native copy of the login in step with the signed-in server, the
 * dashboard's container and the weight unit. With no signed-in server the copy
 * is erased, so nothing about the account stays readable outside the app.
 */
export function syncBackgroundWater(
  container: BackgroundWaterContainer | undefined,
  weightUnit: 'kg' | 'lbs' = 'kg'
): Promise<void> {
  return enqueue(async () => {
    if (!BackgroundWaterModule) return;
    try {
      await store(
        buildBackgroundWaterConfig(
          await getActiveServerConfig(),
          container,
          weightUnit
        )
      );
    } catch (error) {
      addLog(
        `[Background water] Could not update: ${String(error)}`,
        'WARNING'
      );
    }
  });
}

/** Erases the native copy, e.g. when the user signs out or removes the server. */
export function clearBackgroundWater(): Promise<void> {
  // The native medication reminder handler also forgets whose reminders it may log.
  return enqueue(() => {
    setNativeMedicationActiveUser(null);
    return store(null);
  });
}

/**
 * Tells the native medication reminder handler which account's reminders it may
 * log. Queued with the syncs and clears, so a sign-out's reset and a later
 * sign-in's id are applied in the order they were asked and never overwrite
 * each other.
 */
export function syncMedicationActiveUser(userId: string): Promise<void> {
  return enqueue(async () => {
    setNativeMedicationActiveUser(userId);
  });
}

/**
 * Android: puts the "Log water" launcher shortcut back, labelled in the app
 * language. Registering the quick actions replaces every dynamic shortcut,
 * this one included, so it runs after them. Queued with the syncs and clears
 * so it never brings the shortcut back after a sign-out.
 */
export function refreshBackgroundWaterShortcut(
  shortLabel: string,
  longLabel: string
): Promise<void> {
  return enqueue(async () => {
    if (!BackgroundWaterModule?.refreshShortcut) return;
    try {
      BackgroundWaterModule.refreshShortcut(shortLabel, longLabel);
    } catch (error) {
      addLog(
        `[Background water] Could not restore the shortcut: ${String(error)}`,
        'WARNING'
      );
    }
  });
}

export function onAppBecameActive(run: () => void): () => void {
  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
  return () => subscription.remove();
}
