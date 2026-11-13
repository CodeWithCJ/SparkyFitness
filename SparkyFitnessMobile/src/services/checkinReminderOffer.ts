import AsyncStorage from '@react-native-async-storage/async-storage';
import { addLog } from './LogService';

const CHECKIN_REMINDER_OFFER_KEY = '@SparkyFitness/checkinReminderOfferShown';

/**
 * Whether the one-time daily check-in reminder offer has already been shown.
 * A read failure counts as shown so the user is never nagged.
 */
export async function hasShownCheckinReminderOffer(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(CHECKIN_REMINDER_OFFER_KEY);
    return value === 'true';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[Check-in Reminder Offer] Failed to read offer flag: ${message}`,
      'WARNING'
    );
    return true;
  }
}

export async function markCheckinReminderOfferShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(CHECKIN_REMINDER_OFFER_KEY, 'true');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(
      `[Check-in Reminder Offer] Failed to persist offer flag: ${message}`,
      'WARNING'
    );
  }
}
