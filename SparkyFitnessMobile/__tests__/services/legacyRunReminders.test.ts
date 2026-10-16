import AsyncStorage from '@react-native-async-storage/async-storage';
import { cancelLegacyRunReminders } from '../../src/services/legacyRunReminders';
import { cancelScheduledNotification } from '../../src/services/notifications';

jest.mock('../../src/services/notifications', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
}));

const KEY = '@SparkyFitness/runReminders';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

test('does nothing when there is nothing left from the old reminders', async () => {
  await cancelLegacyRunReminders();
  expect(cancelScheduledNotification).not.toHaveBeenCalled();
});

test('cancels the old weekly reminders and forgets them', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ days: [2, 4], hour: 7, ids: ['a', 'b'] })
  );
  await cancelLegacyRunReminders();
  expect(cancelScheduledNotification).toHaveBeenCalledWith('a');
  expect(cancelScheduledNotification).toHaveBeenCalledWith('b');
  expect(await AsyncStorage.getItem(KEY)).toBeNull();
});
