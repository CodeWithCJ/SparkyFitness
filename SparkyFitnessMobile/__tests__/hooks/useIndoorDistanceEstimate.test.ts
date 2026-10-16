import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useIndoorDistanceEstimate } from '../../src/hooks/useIndoorDistanceEstimate';
import { estimateIndoorDistance } from '../../src/services/stepDistance';
import type { RecordingSession } from '../../src/services/gpsRecordingService';

jest.mock('../../src/services/gpsRecordingService', () => ({
  elapsedSeconds: jest.fn(() => 1500),
}));
jest.mock('../../src/services/stepDistance');

const mockedEstimate = jest.mocked(estimateIndoorDistance);

const finished: RecordingSession = {
  id: 'rec-1',
  activity: 'walk',
  status: 'finished',
  startedAt: 1_000_000,
  finishedAt: 2_800_000,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  indoor: true,
};
const estimate = { steps: 3900, distanceKm: 3.12, calibrated: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockedEstimate.mockResolvedValue(estimate);
});

describe('useIndoorDistanceEstimate', () => {
  it('estimates a finished indoor session from its time window', async () => {
    const { result } = renderHook(() => useIndoorDistanceEstimate(finished));

    await waitFor(() => expect(result.current).toEqual(estimate));
    expect(mockedEstimate).toHaveBeenCalledWith({
      activity: 'walk',
      startedAt: 1_000_000,
      finishedAt: 2_800_000,
      activeSeconds: 1500,
    });
  });

  it('passes the Android counter taken at the start', async () => {
    const { result } = renderHook(() =>
      useIndoorDistanceEstimate({ ...finished, stepCounterAtStart: 1100 })
    );

    await waitFor(() => expect(result.current).toEqual(estimate));
    expect(mockedEstimate).toHaveBeenCalledWith({
      activity: 'walk',
      startedAt: 1_000_000,
      finishedAt: 2_800_000,
      activeSeconds: 1500,
      stepCounterAtStart: 1100,
    });
  });

  it('does nothing for a session that is outdoor, running, or not there', async () => {
    const cases: (RecordingSession | null)[] = [
      null,
      { ...finished, indoor: false },
      { ...finished, status: 'recording', finishedAt: null },
    ];
    for (const session of cases) {
      const { result } = renderHook(() => useIndoorDistanceEstimate(session));
      await act(async () => {});
      expect(result.current).toBeNull();
    }
    expect(mockedEstimate).not.toHaveBeenCalled();
  });

  it('stays empty when the phone cannot estimate', async () => {
    mockedEstimate.mockResolvedValue(null);
    const { result } = renderHook(() => useIndoorDistanceEstimate(finished));

    await act(async () => {});

    expect(result.current).toBeNull();
  });

  it('does not show one session’s estimate on the next', async () => {
    const { result, rerender } = renderHook(
      ({ session }: { session: RecordingSession }) =>
        useIndoorDistanceEstimate(session),
      { initialProps: { session: finished } }
    );
    await waitFor(() => expect(result.current).toEqual(estimate));

    mockedEstimate.mockReturnValue(new Promise(() => {}));
    rerender({ session: { ...finished, id: 'rec-2' } });

    expect(result.current).toBeNull();
  });
});
