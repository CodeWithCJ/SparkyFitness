import * as Haptics from 'expo-haptics';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

export function fireSuccessHaptic(): void {
  if (!useAppPreferencesStore.getState().hapticsEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Light selection tick — used for drag-reorder position changes. */
export function fireSelectionHaptic(): void {
  if (!useAppPreferencesStore.getState().hapticsEnabled) return;
  Haptics.selectionAsync().catch(() => {});
}
