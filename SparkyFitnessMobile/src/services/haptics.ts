import * as Haptics from 'expo-haptics';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

export function fireSuccessHaptic(): void {
  if (!useAppPreferencesStore.getState().hapticsEnabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
