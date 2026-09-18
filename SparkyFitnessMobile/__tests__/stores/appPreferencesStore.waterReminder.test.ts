import AsyncStorage from '@react-native-async-storage/async-storage';
import { waitFor } from '@testing-library/react-native';
import {
  WATER_REMINDER_INTERVAL_OPTIONS,
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

const STORE_KEY = '@SparkyFitness/app-preferences';

describe('water reminder preferences', () => {
  beforeEach(() => {
    __resetAppPreferencesStoreForTests();
  });

  it('defaults to off, every 2 hours, from 08:00 to 22:00', () => {
    const state = useAppPreferencesStore.getState();
    expect(state.waterReminderEnabled).toBe(false);
    expect(state.waterReminderIntervalHours).toBe(2);
    expect(state.waterReminderWindowStart).toBe('08:00');
    expect(state.waterReminderWindowEnd).toBe('22:00');
  });

  it('offers exactly the 1, 2, 3 and 4 hour intervals', () => {
    expect(WATER_REMINDER_INTERVAL_OPTIONS).toEqual([1, 2, 3, 4]);
  });

  it('updates each field through its setter', () => {
    const store = useAppPreferencesStore.getState();
    store.setWaterReminderEnabled(true);
    store.setWaterReminderIntervalHours(3);
    store.setWaterReminderWindow('07:30', '21:00');

    const state = useAppPreferencesStore.getState();
    expect(state.waterReminderEnabled).toBe(true);
    expect(state.waterReminderIntervalHours).toBe(3);
    expect(state.waterReminderWindowStart).toBe('07:30');
    expect(state.waterReminderWindowEnd).toBe('21:00');
  });

  it('persists the water reminder fields', async () => {
    const store = useAppPreferencesStore.getState();
    store.setWaterReminderEnabled(true);
    store.setWaterReminderIntervalHours(4);
    store.setWaterReminderWindow('09:00', '20:00');

    await waitFor(async () => {
      const raw = await AsyncStorage.getItem(STORE_KEY);
      expect(raw).not.toBeNull();
      const { state } = JSON.parse(raw as string);
      expect(state).toEqual(
        expect.objectContaining({
          waterReminderEnabled: true,
          waterReminderIntervalHours: 4,
          waterReminderWindowStart: '09:00',
          waterReminderWindowEnd: '20:00',
        })
      );
    });
  });
});
