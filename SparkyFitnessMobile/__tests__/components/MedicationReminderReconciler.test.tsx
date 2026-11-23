import React from 'react';
import { AppState } from 'react-native';
import { getCalendars } from 'expo-localization';
import { act, render } from '@testing-library/react-native';

import MedicationReminderReconciler from '../../src/components/MedicationReminderReconciler';
import {
  useMedications,
  useMedicationEntries,
} from '../../src/hooks/useMedications';
import { useMedicationsFeatureState } from '../../src/hooks/useMedicationsFeatureState';
import { useServerConfigs } from '../../src/hooks/useServerConfigs';
import type { MedicationsFeatureState } from '../../src/utils/medicationsFeatureState';
import {
  cancelMedicationRemindersOfOtherServers,
  reconcileMedicationReminders,
} from '../../src/services/medicationReminderService';
import { retryPendingMedicationActions } from '../../src/services/medicationNotificationHandler';
import { maybePromptForExactAlarmPermission } from '../../src/services/notifications';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { getTodayDate } from '../../src/utils/dateUtils';
import * as offlineEvents from '../../src/offline/events';
import { notifyAccountChanged } from '../../src/offline/events';
import {
  accountGeneration,
  bumpAccountGeneration,
} from '../../src/offline/accountGeneration';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
  useMedicationEntries: jest.fn(),
}));

jest.mock('../../src/hooks/useMedicationsFeatureState', () => ({
  useMedicationsFeatureState: jest.fn(),
}));

jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: jest.fn(),
}));

jest.mock('../../src/services/medicationReminderService', () => ({
  reconcileMedicationReminders: jest.fn(async () => undefined),
  cancelMedicationRemindersOfOtherServers: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/medicationNotificationHandler', () => ({
  retryPendingMedicationActions: jest.fn(async () => false),
}));

jest.mock('../../src/services/notifications', () => ({
  maybePromptForExactAlarmPermission: jest.fn(async () => undefined),
  registerLocalizedNotificationPresentation: jest.fn(async () => undefined),
}));

const mockUseMedications = useMedications as jest.MockedFunction<
  typeof useMedications
>;
const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<
  typeof useMedicationEntries
>;
const mockUseFeatureState = jest.mocked(useMedicationsFeatureState);
const mockUseServerConfigs = jest.mocked(useServerConfigs);
const mockReconcile = reconcileMedicationReminders as jest.MockedFunction<
  typeof reconcileMedicationReminders
>;
const mockMaybePrompt =
  maybePromptForExactAlarmPermission as jest.MockedFunction<
    typeof maybePromptForExactAlarmPermission
  >;

const medications = [{ id: 'med-1', name: 'Metformin' }] as never;
const timedMedications = [
  {
    id: 'med-1',
    name: 'Metformin',
    schedules: [{ id: 'sched-1', time_of_day: '09:00' }],
  },
] as never;
const entries = [{ id: 'entry-1', medication_id: 'med-1' }] as never;

function mockQueries({
  meds = undefined as unknown,
  medEntries = undefined as unknown,
  loadingMeds = false,
  loadingEntries = false,
  refetchMeds = jest.fn(),
  refetchEntries = jest.fn(),
} = {}) {
  mockUseMedications.mockReturnValue({
    data: meds,
    isLoading: loadingMeds,
    refetch: refetchMeds,
  } as never);
  mockUseMedicationEntries.mockReturnValue({
    data: medEntries,
    isLoading: loadingEntries,
    refetch: refetchEntries,
  } as never);
  return { refetchMeds, refetchEntries };
}

function mockFeatureState(state: MedicationsFeatureState) {
  const refetch = jest.fn();
  mockUseFeatureState.mockReturnValue({ state, refetch } as never);
  return refetch;
}

function mockActiveServer(
  server: 'active' | 'none' | 'loading' | 'keychainFailed' | 'readFailed'
) {
  mockUseServerConfigs.mockReturnValue({
    allConfigs: [],
    activeConfig:
      server === 'active'
        ? { id: 'server-1', url: 'https://example.test', apiKey: 'key' }
        : null,
    // The stored id: kept when only the keychain read failed, unknown while
    // loading or after a failed read.
    activeConfigId:
      server === 'active' || server === 'keychainFailed'
        ? 'server-1'
        : server === 'none'
          ? null
          : undefined,
    refetch: jest.fn(),
    isLoading: server === 'loading',
  } as never);
}

describe('MedicationReminderReconciler', () => {
  let appStateSpy: jest.SpyInstance;
  let removeSubscription: jest.Mock;

  // Every AppState listener the component registered hears the change.
  const emitAppState = (state: string) => {
    for (const [, handler] of appStateSpy.mock.calls) {
      (handler as (next: string) => void)(state);
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockFeatureState('on');
    mockActiveServer('active');
    removeSubscription = jest.fn();
    appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: removeSubscription } as never);
  });

  afterEach(() => {
    appStateSpy.mockRestore();
  });

  it('reconciles with the loaded medications and entries and renders nothing', () => {
    mockQueries({ meds: medications, medEntries: entries });

    const { toJSON } = render(<MedicationReminderReconciler />);

    expect(mockReconcile).toHaveBeenCalledWith(medications, entries, {
      active: true,
      accountGeneration: accountGeneration(),
    });
    expect(toJSON()).toBeNull();
  });

  it('renders again and reconciles once an account change is done, with nothing else changing', () => {
    mockQueries({ meds: medications, medEntries: entries });
    render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    // The account change (as useAuth makes it: the count goes up, then the
    // event once the old account is cleared) cancelled every reminder; the
    // cleared cache does not tell the queries, and nothing else on screen
    // changes.
    const before = accountGeneration();
    bumpAccountGeneration();
    act(() => {
      notifyAccountChanged();
    });

    expect(mockReconcile).toHaveBeenCalledTimes(2);
    expect(mockReconcile).toHaveBeenLastCalledWith(medications, entries, {
      active: true,
      accountGeneration: before + 1,
    });

    // And every account change after it, not only the first.
    bumpAccountGeneration();
    act(() => {
      notifyAccountChanged();
    });
    expect(mockReconcile).toHaveBeenCalledTimes(3);
    expect(mockReconcile).toHaveBeenLastCalledWith(medications, entries, {
      active: true,
      accountGeneration: before + 2,
    });
  });

  it('stops listening for account changes once unmounted', () => {
    mockQueries({ meds: medications, medEntries: entries });
    const unsubscribe = jest.fn();
    const subscribe = jest
      .spyOn(offlineEvents, 'subscribeAccountChanged')
      .mockReturnValue(unsubscribe);
    const { unmount } = render(<MedicationReminderReconciler />);
    expect(subscribe).toHaveBeenCalledTimes(1);

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    subscribe.mockRestore();
  });

  it('passes the account its data were read for, so the queue drops a reconcile that comes after an account change started', () => {
    mockQueries({ meds: medications, medEntries: entries });
    const readUnder = accountGeneration();
    const { rerender } = render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenLastCalledWith(medications, entries, {
      active: true,
      accountGeneration: readUnder,
    });

    bumpAccountGeneration();
    act(() => {
      notifyAccountChanged();
    });
    rerender(<MedicationReminderReconciler />);

    expect(mockReconcile).toHaveBeenLastCalledWith(medications, entries, {
      active: true,
      accountGeneration: readUnder + 1,
    });
  });

  it('enables both queries scoped to today while reminders are active', () => {
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);

    const today = getTodayDate();
    expect(mockUseMedications).toHaveBeenCalledWith({
      activeOnly: true,
      enabled: true,
    });
    expect(mockUseMedicationEntries).toHaveBeenCalledWith({
      fromDate: today,
      toDate: today,
      enabled: true,
    });
  });

  it('waits for both queries before reconciling', () => {
    mockQueries({ meds: medications, loadingEntries: true });

    render(<MedicationReminderReconciler />);

    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it.each([
    ['medication reminders pref', { medicationRemindersEnabled: false }],
    ['app notifications toggle', { notificationsEnabled: false }],
  ])(
    'disables the queries and reconciles with empty data when the %s is off',
    (_label, prefs) => {
      useAppPreferencesStore.setState(prefs);
      mockQueries();

      render(<MedicationReminderReconciler />);

      // The empty reconcile is the cancellation sweep for already-scheduled
      // reminders; it must run even though the queries never load.
      expect(mockReconcile).toHaveBeenCalledWith([], [], {
        active: false,
        accountGeneration: accountGeneration(),
      });
      expect(mockUseMedications).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      expect(mockUseMedicationEntries).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      // Only the feature choices listener; the clock poll stays off.
      expect(appStateSpy).toHaveBeenCalledTimes(1);
    }
  );

  it('nudges for the exact-alarm permission once timed schedules load', () => {
    mockQueries({ meds: timedMedications, medEntries: entries });

    render(<MedicationReminderReconciler />);

    expect(mockMaybePrompt).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['no medication has a timed schedule', medications],
    ['there are no medications', [] as never],
  ])('does not nudge for exact alarms when %s', (_label, meds) => {
    mockQueries({ meds, medEntries: entries });

    render(<MedicationReminderReconciler />);

    expect(mockMaybePrompt).not.toHaveBeenCalled();
  });

  it('does not nudge for exact alarms while reminders are off or queries are loading', () => {
    useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
    mockQueries({ meds: timedMedications, medEntries: entries });
    render(<MedicationReminderReconciler />);
    expect(mockMaybePrompt).not.toHaveBeenCalled();

    useAppPreferencesStore.setState({ medicationRemindersEnabled: true });
    mockQueries({ meds: undefined, loadingMeds: true });
    render(<MedicationReminderReconciler />);
    expect(mockMaybePrompt).not.toHaveBeenCalled();
  });

  it('re-runs reconciliation when the repeats preference changes', () => {
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    act(() => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
    });

    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  it('re-runs reconciliation when the hide-names preference changes', () => {
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    act(() => {
      useAppPreferencesStore.setState({ medicationReminderHideNames: true });
    });

    expect(mockReconcile).toHaveBeenCalledTimes(2);
  });

  it('refetches both queries when the app returns to the foreground', () => {
    const { refetchMeds, refetchEntries } = mockQueries({
      meds: medications,
      medEntries: entries,
    });

    render(<MedicationReminderReconciler />);

    const handler = appStateSpy.mock.calls[0][1] as (state: string) => void;
    act(() => handler('background'));
    expect(refetchMeds).not.toHaveBeenCalled();

    act(() => handler('active'));
    expect(refetchMeds).toHaveBeenCalledTimes(1);
    expect(refetchEntries).toHaveBeenCalledTimes(1);
  });

  it('re-runs reconciliation on foreground resume when the device timezone changed even if query data is unchanged', () => {
    const mockGetCalendars = getCalendars as jest.MockedFunction<
      typeof getCalendars
    >;
    mockGetCalendars.mockReturnValue([
      {
        calendar: 'gregory',
        timeZone: 'America/Los_Angeles',
        uses24hourClock: false,
        firstWeekday: 1,
      },
    ]);
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    mockGetCalendars.mockReturnValue([
      {
        calendar: 'gregory',
        timeZone: 'America/Chicago',
        uses24hourClock: false,
        firstWeekday: 1,
      },
    ]);

    const handler = appStateSpy.mock.calls[0][1] as (state: string) => void;
    act(() => handler('active'));

    expect(mockReconcile).toHaveBeenCalledTimes(2);

    mockGetCalendars.mockImplementation(() => [
      {
        calendar: 'gregory',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        uses24hourClock: false,
        firstWeekday: 1,
      },
    ]);
  });

  it('re-runs reconciliation while staying open in the foreground when the device timezone changes without a calendar event', () => {
    jest.useFakeTimers();
    try {
      const mockGetCalendars = getCalendars as jest.MockedFunction<
        typeof getCalendars
      >;
      mockGetCalendars.mockReturnValue([
        {
          calendar: 'gregory',
          timeZone: 'America/Los_Angeles',
          uses24hourClock: false,
          firstWeekday: 1,
        },
      ]);
      mockQueries({ meds: medications, medEntries: entries });

      render(<MedicationReminderReconciler />);
      expect(mockReconcile).toHaveBeenCalledTimes(1);

      // Android expo-localization 57.0.2 does not emit a calendar event on
      // ACTION_TIMEZONE_CHANGED; the foreground poll detects the zone change.
      mockGetCalendars.mockReturnValue([
        {
          calendar: 'gregory',
          timeZone: 'America/Chicago',
          uses24hourClock: false,
          firstWeekday: 1,
        },
      ]);

      act(() => {
        jest.advanceTimersByTime(30_000);
      });

      expect(mockReconcile).toHaveBeenCalledTimes(2);

      mockGetCalendars.mockImplementation(() => [
        {
          calendar: 'gregory',
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          uses24hourClock: false,
          firstWeekday: 1,
        },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes the AppState subscription on unmount', () => {
    mockQueries({ meds: medications, medEntries: entries });

    const { unmount } = render(<MedicationReminderReconciler />);
    unmount();

    expect(removeSubscription).toHaveBeenCalled();
  });

  describe('Medications turned on or off (#3487)', () => {
    it('cancels every reminder, with the queries off and no exact-alarm prompt, while Medications is off', () => {
      mockFeatureState('off');
      mockQueries({ meds: timedMedications, medEntries: entries });

      render(<MedicationReminderReconciler />);

      expect(mockReconcile).toHaveBeenCalledTimes(1);
      expect(mockReconcile).toHaveBeenCalledWith([], [], {
        active: false,
        accountGeneration: accountGeneration(),
      });
      expect(mockUseMedications).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      expect(mockUseMedicationEntries).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false })
      );
      expect(mockMaybePrompt).not.toHaveBeenCalled();
      // The reminder settings are kept for when it comes back.
      expect(useAppPreferencesStore.getState().medicationRemindersEnabled).toBe(
        true
      );
    });

    it.each(['active', 'loading', 'keychainFailed', 'readFailed'] as const)(
      "leaves the active server's reminders as they are while it is not known whether Medications is on (server %s)",
      (server) => {
        mockFeatureState('unknown');
        mockActiveServer(server);
        mockQueries({ meds: timedMedications, medEntries: entries });

        render(<MedicationReminderReconciler />);

        expect(mockReconcile).not.toHaveBeenCalled();
        expect(mockMaybePrompt).not.toHaveBeenCalled();
        expect(mockUseMedications).toHaveBeenCalledWith(
          expect.objectContaining({ enabled: false })
        );
        // Only the reminders of a server switched away from stop.
        expect(cancelMedicationRemindersOfOtherServers).toHaveBeenCalled();
        // Waiting Taken / Skip presses are replayed: the reconcile that
        // flushes them is not run.
        expect(retryPendingMedicationActions).toHaveBeenCalled();
      }
    );

    it('cancels the reminders of the server switched away from again when the active server changes while it is not known', () => {
      mockFeatureState('unknown');
      mockActiveServer('active');
      mockQueries();
      const { rerender } = render(<MedicationReminderReconciler />);
      expect(cancelMedicationRemindersOfOtherServers).toHaveBeenCalledTimes(1);

      mockUseServerConfigs.mockReturnValue({
        allConfigs: [],
        activeConfig: {
          id: 'server-2',
          url: 'https://other.example.test',
          apiKey: 'key',
        },
        activeConfigId: 'server-2',
        refetch: jest.fn(),
        isLoading: false,
      } as never);
      rerender(<MedicationReminderReconciler />);

      expect(cancelMedicationRemindersOfOtherServers).toHaveBeenCalledTimes(2);
      expect(mockReconcile).not.toHaveBeenCalled();
    });

    it.each<MedicationsFeatureState>(['on', 'off'])(
      "does not cancel other servers' reminders or replay presses itself once the state is known (%s)",
      (state) => {
        mockFeatureState(state);
        mockQueries({ meds: medications, medEntries: entries });

        render(<MedicationReminderReconciler />);

        expect(mockReconcile).toHaveBeenCalledTimes(1);
        expect(cancelMedicationRemindersOfOtherServers).not.toHaveBeenCalled();
        expect(retryPendingMedicationActions).not.toHaveBeenCalled();
      }
    );

    it.each([
      ['medication reminders pref', { medicationRemindersEnabled: false }],
      ['app notifications toggle', { notificationsEnabled: false }],
    ])(
      'cancels every reminder when the %s is turned off while it is not known whether Medications is on',
      (_label, prefs) => {
        mockFeatureState('unknown');
        mockActiveServer('active');
        mockQueries();

        render(<MedicationReminderReconciler />);
        expect(mockReconcile).not.toHaveBeenCalled();

        act(() => {
          useAppPreferencesStore.setState(prefs);
        });

        expect(mockReconcile).toHaveBeenLastCalledWith([], [], {
          active: false,
          accountGeneration: accountGeneration(),
        });
      }
    );

    it('cancels every reminder when there is no server at all', () => {
      mockFeatureState('unknown');
      mockActiveServer('none');
      mockQueries();

      render(<MedicationReminderReconciler />);

      expect(mockReconcile).toHaveBeenCalledWith([], [], {
        active: false,
        accountGeneration: accountGeneration(),
      });
    });

    it('schedules the reminders again once Medications is turned back on', () => {
      mockFeatureState('off');
      mockQueries();
      const { rerender } = render(<MedicationReminderReconciler />);
      expect(mockReconcile).toHaveBeenLastCalledWith([], [], {
        active: false,
        accountGeneration: accountGeneration(),
      });

      mockFeatureState('on');
      mockQueries({ meds: timedMedications, medEntries: entries });
      rerender(<MedicationReminderReconciler />);

      expect(mockReconcile).toHaveBeenLastCalledWith(
        timedMedications,
        entries,
        { active: true, accountGeneration: accountGeneration() }
      );
      expect(mockMaybePrompt).toHaveBeenCalledTimes(1);
    });

    it('leaves the schedule alone while the choices reload after being known, even when the hide-names setting changes', () => {
      mockQueries({ meds: medications, medEntries: entries });
      const { rerender } = render(<MedicationReminderReconciler />);
      expect(mockReconcile).toHaveBeenCalledTimes(1);

      mockFeatureState('unknown');
      rerender(<MedicationReminderReconciler />);
      act(() => {
        useAppPreferencesStore.setState({ medicationReminderHideNames: true });
      });

      expect(mockReconcile).toHaveBeenCalledTimes(1);
    });

    it.each<MedicationsFeatureState>(['on', 'off', 'unknown'])(
      'reads the feature choices again when the app returns to the foreground (%s)',
      (state) => {
        const refetchChoices = mockFeatureState(state);
        mockQueries({ meds: medications, medEntries: entries });

        render(<MedicationReminderReconciler />);

        act(() => emitAppState('background'));
        expect(refetchChoices).not.toHaveBeenCalled();

        act(() => emitAppState('active'));
        expect(refetchChoices).toHaveBeenCalledTimes(1);
      }
    );

    it('reads only the feature choices on return while reminders are off', () => {
      useAppPreferencesStore.setState({ medicationRemindersEnabled: false });
      const refetchChoices = mockFeatureState('on');
      const { refetchMeds, refetchEntries } = mockQueries();

      const { unmount } = render(<MedicationReminderReconciler />);
      act(() => emitAppState('active'));

      expect(refetchChoices).toHaveBeenCalledTimes(1);
      expect(refetchMeds).not.toHaveBeenCalled();
      expect(refetchEntries).not.toHaveBeenCalled();

      unmount();
      expect(removeSubscription).toHaveBeenCalledTimes(1);
    });
  });
});
