import { renderHook } from '@testing-library/react-native';
import { useWatchRunBarContent } from '../../src/hooks/useWatchRunBarContent';
import { useWatchRunLive } from '../../src/stores/watchRunLiveStore';

jest.mock('../../src/stores/watchRunLiveStore', () => ({
  useWatchRunLive: jest.fn(),
}));
jest.mock('../../src/components/Icon', () => 'Icon');

const options = {
  distanceUnit: 'km' as const,
  accentColor: '#000',
  onOpen: jest.fn(),
};

const run = (overrides: Record<string, unknown> = {}) => ({
  kind: 'run',
  status: 'running',
  autoPaused: false,
  elapsedNow: 600,
  distanceMeters: 2000,
  ...overrides,
});

test('is null when the watch is not sending a run', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(null);
  expect(
    renderHook(() => useWatchRunBarContent(options)).result.current
  ).toBeNull();
});

test('shows the clock, distance and pace for a run on the watch', () => {
  jest.mocked(useWatchRunLive).mockReturnValue(run() as never);
  const { result } = renderHook(() => useWatchRunBarContent(options));
  expect(result.current).toMatchObject({
    topStatusLine: 'On your watch',
    primaryLine: 'Run',
    countdownLabel: '10:00',
    secondaryLine: '2.00 km · 5:00 /km',
  });
  expect(result.current?.leftButton).toBeNull();
  result.current?.onCenterPress();
  expect(options.onOpen).toHaveBeenCalled();
});

test('says walk, paused and auto-paused', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ kind: 'walk', status: 'paused' }) as never);
  expect(
    renderHook(() => useWatchRunBarContent(options)).result.current
  ).toMatchObject({ primaryLine: 'Walk', topStatusLine: 'Paused' });
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ status: 'paused', autoPaused: true }) as never);
  expect(
    renderHook(() => useWatchRunBarContent(options)).result.current
      ?.topStatusLine
  ).toBe('Auto-paused');
});

test('names a jump rope, with no distance or pace line', () => {
  jest
    .mocked(useWatchRunLive)
    .mockReturnValue(run({ kind: 'jumpRope', distanceMeters: 0 }) as never);
  expect(
    renderHook(() => useWatchRunBarContent(options)).result.current
  ).toMatchObject({
    primaryLine: 'Jump Rope',
    secondaryLine: '',
  });
});
