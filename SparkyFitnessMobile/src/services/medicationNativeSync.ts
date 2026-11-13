import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { setNativeMedicationSnoozeMinutes } from './medicationNativeBridge';

/**
 * Pushes the Snooze length to the iOS native reminder handler. Preferences load
 * from storage a moment after launch, and a notification-driven launch runs
 * this first, so pushing the default before they load would overwrite the
 * saved length with 30. It waits for hydration instead.
 */
export function syncNativeMedicationSnoozeMinutes(): void {
  const persist = useAppPreferencesStore.persist;
  const push = () =>
    setNativeMedicationSnoozeMinutes(
      useAppPreferencesStore.getState().medicationReminderSnoozeMinutes
    );
  if (!persist || persist.hasHydrated()) {
    push();
    return;
  }
  const unsubscribe = persist.onFinishHydration(() => {
    unsubscribe();
    push();
  });
}
