import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

const STORE_KEY = '@SparkyFitness/app-preferences';

describe('check-in reminder preferences', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('defaults to off with a single 20:30 reminder', () => {
    const state = useAppPreferencesStore.getState();
    expect(state.checkinRemindersEnabled).toBe(false);
    expect(state.checkinReminderTimes).toEqual(['20:30']);
  });

  it('normalizes times through the setter', () => {
    const store = useAppPreferencesStore.getState();
    store.setCheckinReminderTimes(['21:00', '08:00', '08:00', '25:00', '7:5']);
    expect(useAppPreferencesStore.getState().checkinReminderTimes).toEqual([
      '08:00',
      '21:00',
    ]);
    store.setCheckinReminderTimes([]);
    expect(useAppPreferencesStore.getState().checkinReminderTimes).toEqual([
      '20:30',
    ]);
  });

  it('persists both fields', async () => {
    const store = useAppPreferencesStore.getState();
    store.setCheckinRemindersEnabled(true);
    store.setCheckinReminderTimes(['07:00', '19:15']);

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      expect(raw).not.toBeNull();
      const { state } = JSON.parse(raw as string);
      expect(state).toEqual(
        expect.objectContaining({
          checkinRemindersEnabled: true,
          checkinReminderTimes: ['07:00', '19:15'],
        })
      );
    });
  });
});
