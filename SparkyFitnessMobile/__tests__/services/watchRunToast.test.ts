import Toast from 'react-native-toast-message';
import { announceWatchRun } from '../../src/services/watchRunToast';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';
import type { WatchRunPayload } from '../../src/utils/watchRun';

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn(), hide: jest.fn() },
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));
jest.mock('../../src/components/recording/RunProgramCard', () => ({
  programWorkoutLabel: () => 'Week 1, run 2',
}));
jest.mock('../../src/hooks/queryClient', () => ({
  queryClient: { getQueryData: jest.fn(() => undefined) },
}));

const t = ((_key: string, options?: { defaultValue?: string }) =>
  options?.defaultValue ?? _key) as never;

const run: WatchRunPayload = {
  clientId: 'x',
  kind: 'run',
  place: 'indoor',
  startedAt: new Date(2026, 9, 10, 8, 0).getTime(),
  endedAt: new Date(2026, 9, 10, 8, 30).getTime(),
  activeSeconds: 1800,
  distanceMeters: 5000,
  activeEnergyKcal: 300,
  route: [],
  heartRate: [],
  laps: [],
  lapDistances: [],
  distanceSeries: [],
  planId: null,
  program: null,
  planCompleted: false,
};

beforeEach(() => jest.clearAllMocks());

test('tells the person the watch run is saved, with distance and time', () => {
  announceWatchRun(run, 'km', t);
  const options = jest.mocked(Toast.show).mock.calls[0][0];
  expect(options.text1).toBe('Run from your watch saved');
  expect(options.text2).toContain('5.00 km · 30:00');
});

test('says walk for a walk', () => {
  announceWatchRun({ ...run, kind: 'walk' }, 'km', t);
  expect(jest.mocked(Toast.show).mock.calls[0][0].text1).toBe(
    'Walk from your watch saved'
  );
});

test('tapping opens the summary screen with the run', () => {
  announceWatchRun(run, 'miles', t);
  jest.mocked(Toast.show).mock.calls[0][0].onPress?.();
  expect(navigationRef.navigate).toHaveBeenCalledWith(
    'RunSummary',
    expect.objectContaining({
      activity: 'run',
      distanceUnit: 'miles',
      distanceMeters: 5000,
      program: null,
    })
  );
});
