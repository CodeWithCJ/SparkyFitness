import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelScheduledNotification } from './notifications';

// Where an earlier build of training programs kept its weekly "time for your
// run" reminders. The Diary schedule now lives on the server with the program.
const KEY = '@SparkyFitness/runReminders';

/**
 * Stops any weekly run reminder an earlier build scheduled and forgets what it
 * stored. Safe to call on every launch: it does nothing once there is nothing
 * left.
 */
export async function cancelLegacyRunReminders(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { ids?: unknown };
    if (Array.isArray(parsed.ids)) {
      await Promise.all(
        parsed.ids.map((id) =>
          typeof id === 'string' ? cancelScheduledNotification(id) : undefined
        )
      );
    }
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Left for the next launch.
  }
}
