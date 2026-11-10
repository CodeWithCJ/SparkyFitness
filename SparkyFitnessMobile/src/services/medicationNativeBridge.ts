import { Platform } from 'react-native';
import BackgroundWaterModule from '../../modules/background-water';

// iOS only. The Taken / Skip / Snooze buttons on a medication reminder are
// handled natively (modules/background-water/ios/MedicationNotificationActions.swift)
// so they work with the app closed. Everything here is absent on Android and
// in an iOS build made before the native handler existed, and then each call
// is a no-op, so JavaScript keeps handling the buttons as it always did.

/** What the native handler leaves for JavaScript to apply. */
export type NativeMedicationActionResult = { id: string } & (
  | {
      kind: 'action';
      status: 'taken' | 'skipped';
      notificationId: string;
      key: string | null;
      entryDate: string;
      userId: string | null;
      serverId?: string | null;
      takenAt?: string;
      doses: { medicationId: string; scheduleId: string | null }[];
      /** Doses whose write failed; they go onto the retry queue. */
      failedDoses: { medicationId: string; scheduleId: string | null }[];
      loggedCount: number;
    }
  | {
      kind: 'snooze';
      baseKey: string;
      entryDate: string;
      doses: { medicationId: string; scheduleId: string | null }[];
      minutes: number;
    }
  | { kind: 'snoozeFailed'; notificationId: string; entryDate: string }
);

export function isNativeMedicationActionClaimed(
  notificationId: string,
  actionId: string
): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return (
      BackgroundWaterModule?.isMedicationActionClaimed?.(
        notificationId,
        actionId
      ) ?? false
    );
  } catch {
    return false;
  }
}

export function setNativeMedicationSnoozeMinutes(minutes: number): void {
  if (Platform.OS !== 'ios') return;
  try {
    BackgroundWaterModule?.setMedicationSnoozeMinutes?.(minutes);
  } catch {
    // An older native build; the native Snooze then uses its 30 minute default.
  }
}

export function setNativeMedicationActiveUser(userId: string | null): void {
  if (Platform.OS !== 'ios') return;
  try {
    BackgroundWaterModule?.setMedicationActiveUser?.(userId);
  } catch {
    // An older native build; Taken and Skip are then handled by JavaScript.
  }
}

/** Reads what the native handler left. Nothing is removed until acknowledged. */
export function readNativeMedicationActionResults(): NativeMedicationActionResult[] {
  if (Platform.OS !== 'ios') return [];
  try {
    const json = BackgroundWaterModule?.readMedicationActionResults?.();
    if (!json) return [];
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed)
      ? (parsed as NativeMedicationActionResult[])
      : [];
  } catch {
    return [];
  }
}

export function acknowledgeNativeMedicationActionResults(ids: string[]): void {
  if (Platform.OS !== 'ios' || ids.length === 0) return;
  try {
    BackgroundWaterModule?.acknowledgeMedicationActionResults?.(ids);
  } catch {
    // The results stay in the native ledger and are applied again, which is safe.
  }
}

export function addNativeMedicationResultListener(
  listener: () => void
): (() => void) | null {
  if (Platform.OS !== 'ios') return null;
  try {
    const subscription = BackgroundWaterModule?.addListener?.(
      'onMedicationActionResult',
      listener
    );
    return subscription ? () => subscription.remove() : null;
  } catch {
    return null;
  }
}
