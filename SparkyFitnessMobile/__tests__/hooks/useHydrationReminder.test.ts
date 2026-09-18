import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import {
  cancelWaterReminders,
  reconcileWaterReminders,
  useHydrationReminderReconciler,
  __resetWaterReminderStateForTests,
  type HydrationReminderReconcilerInput,
  type WaterReminderReconcileInput,
} from '../../src/hooks/useHydrationReminder';
import {
  cancelScheduledNotification,
  scheduleWaterReminderNotifications,
} from '../../src/services/notifications';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  scheduleWaterReminderNotifications: jest.fn(),
  cancelScheduledNotification: jest.fn(),
}));

const mockSchedule = scheduleWaterReminderNotifications as jest.MockedFunction<
  typeof scheduleWaterReminderNotifications
>;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const STORAGE_KEY = '@SparkyFitness/waterReminderSchedule';
const at = (day: number, hours: number, minutes = 0) =>
  new Date(2026, 8, day, hours, minutes, 0, 0);
const NOW = at(15, 9, 30);

function reconcileInput(
  overrides: Partial<WaterReminderReconcileInput> = {}
): WaterReminderReconcileInput {
  return {
    today: '2026-09-15',
    lastLoggedAt: at(15, 9),
    goalMetToday: false,
    intervalHours: 2,
    windowStart: '08:00',
    windowEnd: '22:00',
    ...overrides,
  };
}

async function storedIds(): Promise<string[] | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw).notificationIds : null;
}

beforeEach(async () => {
  __resetWaterReminderStateForTests();
  __resetAppPreferencesStoreForTests();
  await AsyncStorage.clear();
  mockSchedule.mockReset().mockResolvedValue(['n1', 'n2']);
  mockCancel.mockReset().mockResolvedValue(undefined);
});

describe('reconcileWaterReminders', () => {
  it('schedules the chain computed from the last log and remembers the ids', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const times = mockSchedule.mock.calls[0][0];
    expect(times[0]).toEqual(at(15, 11));
    expect(times).toHaveLength(12);
    expect(await storedIds()).toEqual(['n1', 'n2']);
  });

  it('is a no-op when nothing relevant changed', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('replaces the chain when a new drink is logged', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    mockSchedule.mockResolvedValueOnce(['n3']);

    await reconcileWaterReminders(
      reconcileInput({ lastLoggedAt: at(15, 10) }),
      at(15, 10)
    );

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n2');
    expect(mockSchedule.mock.calls[1][0][0]).toEqual(at(15, 12));
    expect(await storedIds()).toEqual(['n3']);
  });

  it("moves the chain to tomorrow's window once today's goal is met", async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await reconcileWaterReminders(reconcileInput({ goalMetToday: true }), NOW);

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockSchedule.mock.calls[1][0][0]).toEqual(at(16, 8));
  });

  it('retries on the next reconcile when nothing could be scheduled', async () => {
    mockSchedule.mockResolvedValueOnce([]);
    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(await storedIds()).toBeNull();

    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
    expect(await storedIds()).toEqual(['n1', 'n2']);
  });

  it('cancels the chain when it cannot be persisted', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('storage unavailable')
    );

    await reconcileWaterReminders(reconcileInput(), NOW);

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n2');
    expect(await storedIds()).toBeNull();

    await reconcileWaterReminders(reconcileInput(), NOW);
    expect(await storedIds()).toEqual(['n1', 'n2']);
  });
});

describe('cancelWaterReminders', () => {
  it('cancels and forgets the scheduled chain', async () => {
    await reconcileWaterReminders(reconcileInput(), NOW);
    await cancelWaterReminders();

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockCancel).toHaveBeenCalledWith('n2');
    expect(await storedIds()).toBeNull();
  });

  it('no-ops when nothing is scheduled', async () => {
    await cancelWaterReminders();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('useHydrationReminderReconciler', () => {
  function hookInput(
    overrides: Partial<HydrationReminderReconcilerInput> = {}
  ): HydrationReminderReconcilerInput {
    return {
      today: '2026-09-15',
      lastLoggedAt: null,
      waterMl: 0,
      waterGoalMl: 2500,
      isLoading: false,
      refetch: jest.fn(),
      ...overrides,
    };
  }

  beforeEach(() => {
    useAppPreferencesStore.setState({
      waterReminderIntervalHours: 1,
      waterReminderWindowStart: '00:00',
      waterReminderWindowEnd: '23:59',
    });
  });

  it('schedules once reminders are on and data has loaded', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));
  });

  it('does not schedule while data is still loading', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() =>
      useHydrationReminderReconciler(hookInput({ isLoading: true }))
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('does not schedule while water reminders are off', async () => {
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('turning water reminders off cancels the scheduled chain', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      useAppPreferencesStore.getState().setWaterReminderEnabled(false);
    });

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('n1'));
    await waitFor(async () => expect(await storedIds()).toBeNull());
  });

  it('turning the master notifications toggle off cancels the chain too', async () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    renderHook(() => useHydrationReminderReconciler(hookInput()));
    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));

    act(() => {
      useAppPreferencesStore.getState().setNotificationsEnabled(false);
    });

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('n1'));
  });

  it('refetches when the app returns to the foreground', () => {
    useAppPreferencesStore.getState().setWaterReminderEnabled(true);
    const listeners: ((state: string) => void)[] = [];
    const spy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        listeners.push(handler as (state: string) => void);
        return { remove: jest.fn() } as never;
      });
    const refetch = jest.fn();

    renderHook(() => useHydrationReminderReconciler(hookInput({ refetch })));
    act(() => {
      listeners.forEach((listener) => listener('active'));
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
