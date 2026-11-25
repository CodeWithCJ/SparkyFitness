import React from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import OralCareReminderReconciler from '../../src/components/OralCareReminderReconciler';
import { reconcileOralCareReminders } from '../../src/services/oralCareReminderService';
import { useFeatureOnState } from '../../src/hooks/useFeatureOnState';
import { useServerConfigs } from '../../src/hooks/useServerConfigs';
import type { FeatureOnState } from '../../src/utils/featureOnState';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { notifyAccountChanged } from '../../src/offline/events';
import { bumpAccountGeneration } from '../../src/offline/accountGeneration';

jest.mock('../../src/services/oralCareReminderService', () => ({
  reconcileOralCareReminders: jest.fn(async () => undefined),
}));
jest.mock('../../src/hooks/useFeatureOnState', () => ({
  useFeatureOnState: jest.fn(),
}));
jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: jest.fn(),
}));

const mockReconcile = jest.mocked(reconcileOralCareReminders);
const mockUseFeatureState = jest.mocked(useFeatureOnState);
const mockUseServerConfigs = jest.mocked(useServerConfigs);

function mockFeatureState(state: FeatureOnState) {
  const refetch = jest.fn(async () => undefined);
  mockUseFeatureState.mockReturnValue({ state, refetch } as never);
  return refetch;
}

function mockServer(activeConfigId: string | null, isLoading = false) {
  mockUseServerConfigs.mockReturnValue({
    activeConfigId,
    isLoading,
  } as never);
}

const wanted = {
  oralCareRemindersEnabled: true,
  oralCareReminderTimes: ['07:30', '21:15'],
  notificationsEnabled: true,
};

// AppState listeners, so a test can bring the app back to the foreground.
let appStateListeners: ((state: AppStateStatus) => void)[] = [];

describe('OralCareReminderReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
    mockFeatureState('on');
    mockServer('server-1');
    appStateListeners = [];
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateListeners.push(listener as (state: AppStateStatus) => void);
        return { remove: jest.fn() } as never;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is off by default and schedules nothing', async () => {
    useAppPreferencesStore.setState({ notificationsEnabled: true });
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenCalledWith({
        mode: 'off',
        times: ['08:00', '21:00'],
        dismissDelivered: false,
      })
    );
  });

  it('schedules the brushing times while oral care is on', async () => {
    useAppPreferencesStore.setState(wanted);
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith({
        mode: 'on',
        times: ['07:30', '21:15'],
        dismissDelivered: false,
      })
    );
    expect(mockUseFeatureState).toHaveBeenCalledWith('oralCare');
  });

  it('stops them, clearing those shown, while oral care is turned off, and never writes the preferences', async () => {
    useAppPreferencesStore.setState(wanted);
    mockFeatureState('off');
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith({
        mode: 'off',
        times: ['07:30', '21:15'],
        dismissDelivered: true,
      })
    );
    expect(useAppPreferencesStore.getState()).toMatchObject(wanted);
  });

  it('brings them back with the same times when it is turned back on', async () => {
    useAppPreferencesStore.setState(wanted);
    mockFeatureState('off');
    const view = render(<OralCareReminderReconciler />);
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));

    mockFeatureState('on');
    view.rerender(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith({
        mode: 'on',
        times: ['07:30', '21:15'],
        dismissDelivered: false,
      })
    );
  });

  it('keeps them on or off while it is not known, applying the times to the ones scheduled', async () => {
    useAppPreferencesStore.setState(wanted);
    mockFeatureState('unknown');
    const view = render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith({
        mode: 'keep',
        times: ['07:30', '21:15'],
      })
    );

    // A time changed while it is not known reaches the ones scheduled.
    act(() => {
      useAppPreferencesStore.setState({ oralCareReminderTimes: ['06:45'] });
    });
    view.rerender(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith({
        mode: 'keep',
        times: ['06:45'],
      })
    );
  });

  it('still cancels while it is not known when a preference is off', async () => {
    useAppPreferencesStore.setState({
      ...wanted,
      oralCareRemindersEnabled: false,
    });
    mockFeatureState('unknown');
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'off', dismissDelivered: false })
      )
    );
  });

  it('follows the preferences, as before Features, with no server at all', async () => {
    useAppPreferencesStore.setState(wanted);
    mockFeatureState('unknown');
    mockServer(null);
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'on' })
      )
    );
  });

  it('does not take a server configuration still loading for no server', async () => {
    useAppPreferencesStore.setState(wanted);
    mockFeatureState('unknown');
    mockServer(null, true);
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'keep' })
      )
    );
  });

  it('only cancels when notifications are off in the app', async () => {
    useAppPreferencesStore.setState({ ...wanted, notificationsEnabled: false });
    render(<OralCareReminderReconciler />);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'off' })
      )
    );
  });

  it('reads the switch again when the app comes back to the foreground', () => {
    const refetch = mockFeatureState('off');
    render(<OralCareReminderReconciler />);
    act(() => appStateListeners.forEach((listener) => listener('active')));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders again on an account change, so it reads the new account', async () => {
    useAppPreferencesStore.setState(wanted);
    render(<OralCareReminderReconciler />);
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    const renders = mockUseFeatureState.mock.calls.length;

    mockFeatureState('off');
    act(() => {
      bumpAccountGeneration();
      notifyAccountChanged();
    });
    expect(mockUseFeatureState.mock.calls.length).toBeGreaterThan(renders);
    await waitFor(() =>
      expect(mockReconcile).toHaveBeenLastCalledWith(
        expect.objectContaining({ mode: 'off', dismissDelivered: true })
      )
    );
  });
});
