import * as Haptics from 'expo-haptics';
import { createBooleanPreference } from './booleanPreference';

const hapticsPref = createBooleanPreference('@HealthConnect:hapticsEnabled', true);

export const initializeHaptics = hapticsPref.initialize;
export const setHapticsEnabled = hapticsPref.set;
export const useHapticsEnabled = hapticsPref.use;

export function fireSuccessHaptic(): void {
  if (!hapticsPref.get()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
