import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useKeepAwake } from 'expo-keep-awake';

import ImportHistoryScreen from '../../src/screens/ImportHistoryScreen';
import { useBackfillRunner, type BackfillRunner } from '../../src/hooks/useBackfillRunner';
import { initHealthConnect } from '../../src/services/healthConnectService';
import { isSyncClaimed } from '../../src/services/autoSyncCoordinator';
import type { BackfillCheckpoint } from '../../src/services/backfillCheckpoint';

jest.mock('../../src/hooks/useBackfillRunner', () => ({
  useBackfillRunner: jest.fn(),
}));

jest.mock('../../src/services/healthConnectService', () => ({
  initHealthConnect: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../src/services/autoSyncCoordinator', () => {
  const claimListeners = new Set<() => void>();
  return {
    isSyncClaimed: jest.fn(() => false),
    subscribeSyncClaimed: jest.fn((listener: () => void) => {
      claimListeners.add(listener);
      return () => claimListeners.delete(listener);
    }),
    __notifyClaimListeners: () => {
      for (const listener of claimListeners) listener();
    },
  };
});

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), setOptions: jest.fn() } as never;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const mockUseBackfillRunner = useBackfillRunner as jest.MockedFunction<typeof useBackfillRunner>;
const mockInitHealthConnect = initHealthConnect as jest.Mock;
const mockIsSyncClaimed = isSyncClaimed as jest.Mock;
const { __notifyClaimListeners } = require('../../src/services/autoSyncCoordinator') as {
  __notifyClaimListeners: () => void;
};
const mockUseKeepAwake = useKeepAwake as jest.Mock;

const checkpoint = (overrides: Partial<BackfillCheckpoint> = {}): BackfillCheckpoint => ({
  version: 1,
  status: 'in-progress',
  endEdge: '2026-08-03T04:00:00.000Z',
  cursor: '2026-07-04T04:00:00.000Z',
  floor: '2026-06-20T04:00:00.000Z',
  earliestByRecordType: { Steps: '2026-06-20T10:00:00.000Z' },
  enabledRecordTypes: ['Steps'],
  recordsUploaded: 250,
  startedAt: '2026-08-03T15:00:00.000Z',
  updatedAt: '2026-08-03T15:05:00.000Z',
  ...overrides,
});

const runner = (overrides: Partial<BackfillRunner> = {}): BackfillRunner => ({
  status: 'idle',
  progress: null,
  checkpoint: null,
  lastOutcome: null,
  lastError: undefined,
  frozenSelectionDiffers: false,
  enabledMetricCount: null,
  estimatedMsRemaining: null,
  start: jest.fn(),
  cancel: jest.fn(),
  startOver: jest.fn(),
  ...overrides,
});

const route = { params: undefined } as never;

const renderScreen = () =>
  render(<ImportHistoryScreen navigation={mockNavigation} route={route} />);

describe('ImportHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitHealthConnect.mockResolvedValue(true);
    mockIsSyncClaimed.mockReturnValue(false);
  });

  test('idle: pressing Start begins the import once the health store initialized', async () => {
    const state = runner();
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    fireEvent.press(getByText('Start Import'));

    expect(state.start).toHaveBeenCalledTimes(1);
  });

  test('idle: shows the enabled data-type count only once it has loaded', () => {
    mockUseBackfillRunner.mockReturnValue(runner({ enabledMetricCount: null }));
    const loading = renderScreen();
    expect(loading.getByText('Data types enabled')).toBeTruthy();
    expect(loading.queryByText('7')).toBeNull();
    loading.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({ enabledMetricCount: 7 }));
    const loaded = renderScreen();
    expect(loaded.getByText('7')).toBeTruthy();
  });

  test('idle: Start stays disabled while another sync holds the claim', async () => {
    mockIsSyncClaimed.mockReturnValue(true);
    const state = runner();
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    fireEvent.press(getByText('Start Import'));

    expect(state.start).not.toHaveBeenCalled();
  });

  test('idle: Start stays disabled when the health store fails to initialize', async () => {
    mockInitHealthConnect.mockResolvedValue(false);
    const state = runner();
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    fireEvent.press(getByText('Start Import'));

    expect(state.start).not.toHaveBeenCalled();
  });

  test('running: holds a keep-awake lock and wires the pause button to cancel', async () => {
    const state = runner({
      status: 'running',
      progress: {
        phase: 'importing',
        totalDays: 44,
        importedDays: 30,
        currentWindow: { start: new Date(2026, 6, 4), end: new Date(2026, 7, 3) },
        recordsUploaded: 100,
        historyAccessGranted: true,
      },
    });
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    expect(mockUseKeepAwake).toHaveBeenCalledWith('import-history');
    fireEvent.press(getByText('Pause Import'));
    expect(state.cancel).toHaveBeenCalledTimes(1);

    // cancel() only stops the run at the next window boundary; the button
    // reflects the pending pause and blocks repeat presses until then.
    expect(getByText('Pausing…')).toBeTruthy();
    fireEvent.press(getByText('Pausing…'));
    expect(state.cancel).toHaveBeenCalledTimes(1);
  });

  test('running: probing shows no day counts; importing shows them', async () => {
    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'running',
      progress: {
        phase: 'probing',
        totalDays: 0,
        importedDays: 0,
        currentWindow: null,
        recordsUploaded: 0,
        historyAccessGranted: true,
      },
    }));
    const probing = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());
    expect(probing.queryByText(/of \d+ days/)).toBeNull();
    probing.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'running',
      progress: {
        phase: 'importing',
        totalDays: 44,
        importedDays: 30,
        currentWindow: { start: new Date(2026, 6, 4), end: new Date(2026, 7, 3) },
        recordsUploaded: 100,
        historyAccessGranted: true,
      },
    }));
    const importing = renderScreen();
    await waitFor(() => expect(importing.getByText('30')).toBeTruthy());
    expect(importing.getByText('of 44 days')).toBeTruthy();
  });

  test('running: shows the time estimate only once pace is known', () => {
    const importingProgress = {
      phase: 'importing' as const,
      totalDays: 44,
      importedDays: 30,
      currentWindow: null,
      recordsUploaded: 100,
      historyAccessGranted: true,
    };

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'running',
      progress: importingProgress,
      estimatedMsRemaining: null,
    }));
    const noPace = renderScreen();
    expect(noPace.getByText('—')).toBeTruthy();
    noPace.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'running',
      progress: importingProgress,
      estimatedMsRemaining: 5 * 60_000,
    }));
    const minutes = renderScreen();
    expect(minutes.queryByText('—')).toBeNull();
    expect(minutes.getByText('5 min')).toBeTruthy();
    minutes.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'running',
      progress: importingProgress,
      estimatedMsRemaining: 20_000,
    }));
    const subMinute = renderScreen();
    expect(subMinute.getByText('Under a minute')).toBeTruthy();
  });

  test('interrupted: Resume resumes and Start Over restarts', async () => {
    const state = runner({ status: 'interrupted', lastOutcome: 'quota', checkpoint: checkpoint() });
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    fireEvent.press(getByText('Resume'));
    expect(state.start).toHaveBeenCalledTimes(1);

    fireEvent.press(getByText('Start Over'));
    expect(state.startOver).toHaveBeenCalledTimes(1);
  });

  test('interrupted: derives progress from the checkpoint when no live progress exists', async () => {
    // Fresh mount after a restart: `progress` is null, so day counts and the
    // record total must come from the checkpoint; time remaining is unknown.
    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      progress: null,
      checkpoint: checkpoint(),
    }));

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    // cursor→endEdge = 30 days imported, floor→endEdge = 44 days total.
    expect(getByText('30')).toBeTruthy();
    expect(getByText('of 44 days')).toBeTruthy();
    expect(getByText('250')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
  });

  test('interrupted: falls back to the checkpoint cursor for the month when the last progress had no window', async () => {
    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      progress: {
        phase: 'importing',
        totalDays: 44,
        importedDays: 30,
        currentWindow: null,
        recordsUploaded: 250,
        historyAccessGranted: true,
      },
      checkpoint: checkpoint(),
    }));

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    expect(getByText(/Around July 2026/)).toBeTruthy();
  });

  test('interrupted: the reason callout renders for abnormal stops but not manual pauses', async () => {
    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      lastOutcome: 'quota',
      checkpoint: checkpoint(),
    }));
    const quota = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());
    expect(quota.getByTestId('paused-reason-callout')).toBeTruthy();
    quota.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      lastOutcome: 'cancelled',
      checkpoint: checkpoint(),
    }));
    const paused = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());
    expect(paused.queryByTestId('paused-reason-callout')).toBeNull();
  });

  test('interrupted: the metric-selection notice renders only when the frozen set differs', async () => {
    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      checkpoint: checkpoint(),
      frozenSelectionDiffers: false,
    }));
    const unchanged = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());
    expect(unchanged.queryByTestId('metric-selection-notice')).toBeNull();
    unchanged.unmount();

    mockUseBackfillRunner.mockReturnValue(runner({
      status: 'interrupted',
      checkpoint: checkpoint(),
      frozenSelectionDiffers: true,
    }));
    const changed = renderScreen();
    await waitFor(() => expect(changed.getByTestId('metric-selection-notice')).toBeTruthy());
  });

  test('interrupted: buttons re-enable when the abandoned run releases the claim', async () => {
    // Backing out mid-run leaves the old run holding the claim until its window
    // boundary; the buttons must wake up when it frees, without a remount.
    mockIsSyncClaimed.mockReturnValue(true);
    const state = runner({ status: 'interrupted', lastOutcome: 'cancelled', checkpoint: checkpoint() });
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText, getByTestId, queryByTestId } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    expect(getByTestId('sync-claimed-note')).toBeTruthy();
    fireEvent.press(getByText('Resume'));
    expect(state.start).not.toHaveBeenCalled();

    act(() => {
      mockIsSyncClaimed.mockReturnValue(false);
      __notifyClaimListeners();
    });

    expect(queryByTestId('sync-claimed-note')).toBeNull();
    fireEvent.press(getByText('Resume'));
    expect(state.start).toHaveBeenCalledTimes(1);
  });

  test('done: shows the day and record totals and offers Start Over', async () => {
    const state = runner({
      status: 'done',
      checkpoint: checkpoint({ status: 'done', recordsUploaded: 1234 }),
    });
    mockUseBackfillRunner.mockReturnValue(state);

    const { getByText } = renderScreen();
    await waitFor(() => expect(mockInitHealthConnect).toHaveBeenCalled());

    // floor→endEdge = 44 days; record count is locale-formatted.
    expect(getByText('44')).toBeTruthy();
    expect(getByText('44 days imported')).toBeTruthy();
    expect(getByText('1,234')).toBeTruthy();
    fireEvent.press(getByText('Start Over'));
    expect(state.startOver).toHaveBeenCalledTimes(1);
  });
});
