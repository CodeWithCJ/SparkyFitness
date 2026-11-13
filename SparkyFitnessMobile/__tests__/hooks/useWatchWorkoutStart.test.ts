import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useWatchWorkoutStart } from '../../src/hooks/useWatchWorkoutStart';
import { fetchDailySummary } from '../../src/services/api/dailySummaryApi';
import { fetchActiveWorkoutPlans } from '../../src/services/api/workoutPlansApi';
import { getWorkoutPresetById } from '../../src/services/api/workoutPresetsApi';
import { getActiveServerConfigId } from '../../src/services/storage';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';

let handler: ((p: { presetId: string; serverId: string }) => void) | null =
  null;
jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    startWorkout: jest.fn(async () => {}),
    addListener: jest.fn((_e: string, cb: typeof handler) => {
      handler = cb;
      return { remove: jest.fn() };
    }),
  },
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 'srv'),
}));
jest.mock('../../src/services/api/workoutPlansApi', () => ({
  fetchActiveWorkoutPlans: jest.fn(),
}));
jest.mock('../../src/services/api/dailySummaryApi', () => ({
  fetchDailySummary: jest.fn(),
}));
jest.mock('../../src/services/api/workoutPresetsApi', () => ({
  getWorkoutPresetById: jest.fn(),
}));

const preset = {
  id: 42,
  name: 'Upper',
  workout_format: 'standard',
  time_cap_seconds: null,
  exercises: [
    {
      exercise_id: 'e1',
      sort_order: 0,
      sets: [{ set_number: 1, set_type: 'normal', reps: 5 }],
    },
  ],
};

function plan(presetId: string) {
  const a = { id: '7', workout_preset_id: presetId, sets: [] };
  return {
    id: 'p1',
    plan_name: 'Plan',
    schedule_type: 'weekly',
    assignments: [a],
    next_assignment: a,
    next_assignments: [a],
  };
}

async function fire() {
  const start = jest.fn(async () => {});
  renderHook(() => useWatchWorkoutStart(true, true, start));
  handler?.({ presetId: '42', serverId: 'srv' });
  await waitFor(() => expect(start).toHaveBeenCalled());
  return start.mock.calls[0]![0] as unknown as {
    workoutPlanAssignmentId?: number;
    exercises: { workout_plan_assignment_id?: number }[];
  };
}

describe('useWatchWorkoutStart plan link', () => {
  beforeEach(() => {
    (getWorkoutPresetById as jest.Mock).mockResolvedValue(preset);
    (getActiveServerConfigId as jest.Mock).mockReset();
    (getActiveServerConfigId as jest.Mock).mockResolvedValue('srv');
    (fetchActiveWorkoutPlans as jest.Mock).mockReset();
    (fetchDailySummary as jest.Mock).mockReset();
    (fetchDailySummary as jest.Mock).mockResolvedValue({
      exerciseSessions: [],
    });
    useActiveWorkoutStore.setState({ sessionId: null, sourcePresetId: null });
  });

  it('links the session to the plan assignment due for the preset', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([plan('42')]);
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBe(7);
    expect(args.exercises[0]!.workout_plan_assignment_id).toBe(7);
  });

  it('starts the preset plain when no plan assignment matches', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([plan('43')]);
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBeUndefined();
    expect(args.exercises[0]!.workout_plan_assignment_id).toBeUndefined();
  });

  it('starts the preset plain when that assignment is already logged today', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([plan('42')]);
    (fetchDailySummary as jest.Mock).mockResolvedValue({
      exerciseSessions: [{ workout_plan_assignment_id: '7' }],
    });
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBeUndefined();
    expect(args.exercises[0]!.workout_plan_assignment_id).toBeUndefined();
  });

  it('starts the preset plain when the diary fails to load', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([plan('42')]);
    (fetchDailySummary as jest.Mock).mockRejectedValue(new Error('x'));
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBeUndefined();
    expect(args.exercises[0]!.workout_plan_assignment_id).toBeUndefined();
  });

  it('starts the preset plain when no plan is due or plans fail to load', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockRejectedValue(new Error('x'));
    const args = await fire();
    expect(args.workoutPlanAssignmentId).toBeUndefined();
    expect(args.exercises[0]!.workout_plan_assignment_id).toBeUndefined();
  });

  it('does not start when the server changes during the plan fetch', async () => {
    let plansFetched = false;
    let sawNewServer = false;
    (getActiveServerConfigId as jest.Mock).mockImplementation(async () => {
      if (!plansFetched) return 'srv';
      sawNewServer = true;
      return 'other';
    });
    (fetchActiveWorkoutPlans as jest.Mock).mockImplementation(async () => {
      plansFetched = true;
      return [plan('42')];
    });
    const start = jest.fn(async () => {});
    renderHook(() => useWatchWorkoutStart(true, true, start));
    handler?.({ presetId: '42', serverId: 'srv' });
    await waitFor(() => expect(sawNewServer).toBe(true));
    expect(start).not.toHaveBeenCalled();
  });

  it('does not start when the same preset is already live after the plan fetch', async () => {
    let release: (plans: ReturnType<typeof plan>[]) => void = () => {};
    (fetchActiveWorkoutPlans as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const start = jest.fn(async () => {});
    renderHook(() => useWatchWorkoutStart(true, true, start));
    handler?.({ presetId: '42', serverId: 'srv' });
    await waitFor(() => expect(fetchActiveWorkoutPlans).toHaveBeenCalled());
    useActiveWorkoutStore.setState({
      sessionId: 'live',
      sourcePresetId: 42,
    });
    release([plan('42')]);
    await waitFor(() =>
      expect(getActiveServerConfigId).toHaveBeenCalledTimes(3)
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('does not start a request that outlived a disable and re-enable', async () => {
    let release: (plans: ReturnType<typeof plan>[]) => void = () => {};
    (fetchActiveWorkoutPlans as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );
    const start = jest.fn(async () => {});
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useWatchWorkoutStart(enabled, true, start),
      { initialProps: { enabled: true } }
    );
    handler?.({ presetId: '42', serverId: 'srv' });
    await waitFor(() => expect(fetchActiveWorkoutPlans).toHaveBeenCalled());
    rerender({ enabled: false });
    rerender({ enabled: true });
    await act(async () => {
      release([plan('42')]);
    });
    expect(start).not.toHaveBeenCalled();
  });

  it('re-arms the watch instead of starting a new session when the same preset is already live', async () => {
    useActiveWorkoutStore.setState({
      sessionId: 'live-42',
      sourcePresetId: 42,
      session: {
        id: 'live-42',
        type: 'preset',
        name: 'Upper',
        entry_date: '2026-10-19',
        total_duration_minutes: 0,
        exercises: [],
      } as any,
    });
    const start = jest.fn(async () => {});
    renderHook(() => useWatchWorkoutStart(true, true, start));
    handler?.({ presetId: '42', serverId: 'srv' });
    await waitFor(() =>
      expect(getActiveServerConfigId).toHaveBeenCalledTimes(2)
    );
    expect(start).not.toHaveBeenCalled();
  });

  it('ignores a start request missing serverId', async () => {
    (fetchActiveWorkoutPlans as jest.Mock).mockResolvedValue([]);
    const start = jest.fn(async () => {});
    renderHook(() => useWatchWorkoutStart(true, true, start));
    handler?.({ presetId: '42', serverId: '' });
    expect(getActiveServerConfigId).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });
});
