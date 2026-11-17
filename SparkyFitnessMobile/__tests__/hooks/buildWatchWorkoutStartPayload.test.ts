import { act } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import { buildWatchWorkoutStartPayload } from '../../src/hooks/useStartLiveWorkout';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: { isSupported: jest.fn(() => true) },
}));

function sessionWith(modality: string, set: Record<string, unknown>) {
  return {
    type: 'preset',
    id: 'session-1',
    name: 'Day',
    exercises: [
      {
        id: 'entry-1',
        exercise_id: 'ex-1',
        exercise_snapshot: { id: 'ex-1', name: 'Thing', modality },
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: null,
            weight: null,
            duration: null,
            distance: null,
            rest_time: 60,
            notes: null,
            rpe: null,
            ...set,
          },
        ],
      },
    ],
  } as unknown as PresetSessionResponse;
}

function firstSet(session: PresetSessionResponse) {
  act(() => {
    useActiveWorkoutStore.getState().startWorkout(session);
  });
  const payload = buildWatchWorkoutStartPayload(
    session,
    ((_key: string, opts?: { defaultValue?: string }) =>
      opts?.defaultValue ?? '') as never,
    Date.now()
  );
  return payload.exercises[0].sets[0];
}

describe('buildWatchWorkoutStartPayload set kinds', () => {
  beforeEach(() => {
    __resetActiveWorkoutStoreForTests();
  });

  it("sends the set's own rest apart from the rest before it", () => {
    const set = firstSet(sessionWith('weight_reps', { rest_time: 90 }));
    expect(set).toMatchObject({ restAfterSeconds: 90 });
  });

  it('marks a carry and sends its distance in km', () => {
    const set = firstSet(
      sessionWith('weight_distance', { weight: 40, distance: 0.03 })
    );
    expect(set).toMatchObject({
      carry: true,
      targetWeightKg: 40,
      targetDistanceKm: 0.03,
      targetReps: null,
    });
    expect(set.timed).toBeUndefined();
  });

  it('marks a loaded hold as timed and weighted', () => {
    const set = firstSet(
      sessionWith('weight_duration', { weight: 20, duration: 45 })
    );
    expect(set).toMatchObject({
      timed: true,
      weighted: true,
      targetWeightKg: 20,
      targetDurationSec: 45,
      targetReps: null,
    });
    expect(set.carry).toBeUndefined();
  });

  it('leaves an ordinary set unmarked', () => {
    const set = firstSet(sessionWith('weight_reps', { weight: 60, reps: 5 }));
    expect(set.carry).toBeUndefined();
    expect(set.weighted).toBeUndefined();
    expect(set.timed).toBeUndefined();
  });
});
