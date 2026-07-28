import React from 'react';
import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';

import MedicationReminderReconciler from '../../src/components/MedicationReminderReconciler';
import { useMedications, useMedicationEntries } from '../../src/hooks/useMedications';
import { reconcileMedicationReminders } from '../../src/services/medicationReminderService';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useMedications', () => ({
  useMedications: jest.fn(),
  useMedicationEntries: jest.fn(),
}));

jest.mock('../../src/services/medicationReminderService', () => ({
  reconcileMedicationReminders: jest.fn(async () => undefined),
}));

const mockUseMedications = useMedications as jest.MockedFunction<typeof useMedications>;
const mockUseMedicationEntries = useMedicationEntries as jest.MockedFunction<
  typeof useMedicationEntries
>;
const mockReconcile = reconcileMedicationReminders as jest.MockedFunction<
  typeof reconcileMedicationReminders
>;

const medications = [{ id: 'med-1', name: 'Metformin' }] as never;
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

describe('MedicationReminderReconciler', () => {
  let appStateSpy: jest.SpyInstance;
  let removeSubscription: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
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

    expect(mockReconcile).toHaveBeenCalledWith(medications, entries);
    expect(toJSON()).toBeNull();
  });

  it('enables both queries scoped to today while reminders are active', () => {
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);

    const today = getTodayDate();
    expect(mockUseMedications).toHaveBeenCalledWith({ activeOnly: true, enabled: true });
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
      expect(mockReconcile).toHaveBeenCalledWith([], []);
      expect(mockUseMedications).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
      expect(mockUseMedicationEntries).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: false }),
      );
      expect(appStateSpy).not.toHaveBeenCalled();
    },
  );

  it('re-runs reconciliation when the repeats preference changes', () => {
    mockQueries({ meds: medications, medEntries: entries });

    render(<MedicationReminderReconciler />);
    expect(mockReconcile).toHaveBeenCalledTimes(1);

    act(() => {
      useAppPreferencesStore.setState({ medicationReminderRepeats: false });
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

  it('removes the AppState subscription on unmount', () => {
    mockQueries({ meds: medications, medEntries: entries });

    const { unmount } = render(<MedicationReminderReconciler />);
    unmount();

    expect(removeSubscription).toHaveBeenCalled();
  });
});
