import { act, renderHook } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import type { PresetSessionResponse } from '@workspace/shared';
import {
  AUTOSAVE_DEBOUNCE_MS,
  flushActiveWorkoutBeforeClear,
  saveActiveWorkoutSession,
  useActiveWorkoutAutosave,
} from '../../src/hooks/useActiveWorkoutAutosave';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { updateWorkout } from '../../src/services/api/exerciseApi';
import { invalidateExerciseCache } from '../../src/hooks/invalidateExerciseCache';
import { syncExerciseSessionInCache } from '../../src/hooks/syncExerciseSessionInCache';
import { addLog } from '../../src/services/LogService';
import {
  createQueryWrapper,
  createTestQueryClient,
  type QueryClient,
} from './queryTestUtils';

jest.mock('../../src/services/api/exerciseApi', () => ({
  updateWorkout: jest.fn(),
}));

jest.mock('../../src/hooks/invalidateExerciseCache', () => ({
  invalidateExerciseCache: jest.fn(),
}));

jest.mock('../../src/hooks/syncExerciseSessionInCache', () => ({
  syncExerciseSessionInCache: jest.fn(),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  scheduleRestNotification: jest.fn(async () => 'notif-abc'),
  cancelScheduledNotification: jest.fn(async () => undefined),
  fireRestCompleteHaptic: jest.fn(),
}));

const mockUpdateWorkout = updateWorkout as jest.MockedFunction<typeof updateWorkout>;
const mockInvalidate = invalidateExerciseCache as jest.MockedFunction<
  typeof invalidateExerciseCache
>;
const mockSyncCache = syncExerciseSessionInCache as jest.MockedFunction<
  typeof syncExerciseSessionInCache
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-03-20',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      {
        id: 'ex-uuid-1',
        exercise_id: 'ex-1',
        duration_minutes: 20,
        calories_burned: 150,
        entry_date: '2026-03-20',
        notes: null,
        distance: null,
        avg_heart_rate: null,
        source: null,
        exercise_snapshot: {
          id: 'ex-1',
          name: 'Bench Press',
          category: 'Strength',
          calories_per_hour: 400,
          images: ['bench.jpg'],
        } as any,
        activity_details: [],
        sets: [
          {
            id: 101,
            set_number: 1,
            set_type: 'normal',
            reps: 10,
            weight: 60,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
          {
            id: 102,
            set_number: 2,
            set_type: 'normal',
            reps: 8,
            weight: 70,
            duration: null,
            rest_time: 60,
            notes: null,
            rpe: null,
          },
        ],
      } as any,
    ],
  };
}

function getStore() {
  return useActiveWorkoutStore.getState();
}

/** Start a workout and make one dirtying edit. */
function startAndEdit(weight = 80) {
  act(() => {
    getStore().startWorkout(makeSession());
    getStore().updateSetField('101', { weight });
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe('useActiveWorkoutAutosave', () => {
  let queryClient: QueryClient;

  function renderAutosave() {
    return renderHook(() => useActiveWorkoutAutosave(), {
      wrapper: createQueryWrapper(queryClient),
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    queryClient = createTestQueryClient();
    // Echo the live session back, as a server whose state matches ours would.
    mockUpdateWorkout.mockImplementation(async () => getStore().session!);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('debounced background save', () => {
    it('does not save while the session is clean', async () => {
      renderAutosave();
      act(() => {
        getStore().startWorkout(makeSession());
      });
      await advance(AUTOSAVE_DEBOUNCE_MS * 3);
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
    });

    it('completing a set fires a debounced save carrying completed_at', async () => {
      renderAutosave();
      act(() => {
        getStore().startWorkout(makeSession());
      });

      let completedMs = 0;
      act(() => {
        completedMs = Date.now();
        getStore().completeActiveSet();
      });

      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      const payload = mockUpdateWorkout.mock.calls[0][1] as {
        exercises: { sets: { completed_at: string | null }[] }[];
      };
      expect(payload.exercises[0].sets[0].completed_at).toBe(
        new Date(completedMs).toISOString(),
      );
      expect(payload.exercises[0].sets[1].completed_at).toBeNull();
    });

    it('unchecking a set fires a debounced save clearing completed_at', async () => {
      renderAutosave();
      act(() => {
        getStore().startWorkout(makeSession());
        getStore().completeActiveSet();
      });
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);

      act(() => {
        getStore().uncompleteSet('101');
      });
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(2);
      const payload = mockUpdateWorkout.mock.calls[1][1] as {
        exercises: { sets: { completed_at: string | null }[] }[];
      };
      expect(payload.exercises[0].sets[0].completed_at).toBeNull();
    });

    it('saves once, AUTOSAVE_DEBOUNCE_MS after the last edit', async () => {
      renderAutosave();
      startAndEdit();

      await advance(AUTOSAVE_DEBOUNCE_MS - 1);
      expect(mockUpdateWorkout).not.toHaveBeenCalled();

      // A second edit restarts the debounce window.
      act(() => {
        getStore().updateSetField('102', { reps: 9 });
      });
      await advance(AUTOSAVE_DEBOUNCE_MS - 1);
      expect(mockUpdateWorkout).not.toHaveBeenCalled();

      await advance(1);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(mockUpdateWorkout).toHaveBeenCalledWith('session-1', {
        name: 'Push Day',
        exercises: expect.any(Array),
      });
    });

    it('marks the store clean and syncs the history cache after a save', async () => {
      renderAutosave();
      startAndEdit();
      await advance(AUTOSAVE_DEBOUNCE_MS);

      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(mockSyncCache).toHaveBeenCalledWith(queryClient, expect.objectContaining({
        id: 'session-1',
      }));
      // Date-keyed caches are only invalidated at flush points.
      expect(mockInvalidate).not.toHaveBeenCalled();
    });

    it('keeps a single request in flight and queues one trailing save', async () => {
      renderAutosave();
      startAndEdit(80);

      let resolveFirst!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );

      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      const staleServerEcho = getStore().session!;

      // Two more edits land while the first request is in flight.
      act(() => {
        getStore().updateSetField('101', { weight: 90 });
      });
      await advance(AUTOSAVE_DEBOUNCE_MS);
      act(() => {
        getStore().updateSetField('102', { reps: 6 });
      });
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFirst(staleServerEcho);
        await jest.advanceTimersByTimeAsync(0);
      });

      // Exactly one trailing save for both queued edits.
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(2);
      expect(getStore().hasUnsavedChanges).toBe(false);
      const set101 = getStore().session!.exercises[0].sets[0];
      expect(set101.weight).toBe(90);
    });

    it('keeps newer local edits when the response is stale (revision captured at send time)', async () => {
      renderAutosave();
      startAndEdit(80);

      let resolveFirst!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      await advance(AUTOSAVE_DEBOUNCE_MS);
      const staleServerEcho = getStore().session!;

      // Mid-flight edit: the response must not clobber this newer value.
      act(() => {
        getStore().updateSetField('101', { weight: 95 });
      });

      let resolveTrailing!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveTrailing = resolve;
        }),
      );
      await advance(AUTOSAVE_DEBOUNCE_MS);
      await act(async () => {
        resolveFirst(staleServerEcho);
        await jest.advanceTimersByTimeAsync(0);
      });

      // The stale response only grafted ids; the newer edit survives and the
      // session stays dirty until the trailing save lands.
      const set101 = getStore().session!.exercises[0].sets[0];
      expect(set101.weight).toBe(95);
      expect(getStore().hasUnsavedChanges).toBe(true);

      await act(async () => {
        resolveTrailing(getStore().session!);
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(getStore().hasUnsavedChanges).toBe(false);
    });

    it('a reorder landing mid-flight skips the graft and the trailing save converges', async () => {
      renderAutosave();
      const session = makeSession();
      session.exercises.push({
        ...makeSession().exercises[0],
        id: 'ex-uuid-2',
        exercise_id: 'ex-2',
        sets: [{ ...makeSession().exercises[0].sets[0], id: 201 }],
      } as any);
      act(() => {
        getStore().startWorkout(session);
        getStore().updateSetField('101', { weight: 80 });
      });

      let resolveFirst!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () => new Promise((resolve) => {
          resolveFirst = resolve;
        }),
      );
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      const staleServerEcho = getStore().session!;

      // Grouping reorders the exercises while the save is in flight.
      act(() => {
        getStore().supersetWith('ex-uuid-2', 'ex-uuid-1');
      });
      expect(getStore().session!.exercises.map((e) => e.id)).toEqual([
        'ex-uuid-2',
        'ex-uuid-1',
      ]);

      await advance(AUTOSAVE_DEBOUNCE_MS); // queue the trailing save
      await act(async () => {
        resolveFirst(staleServerEcho);
        await jest.advanceTimersByTimeAsync(0);
      });

      // The stale (pre-reorder) response was not grafted positionally, and
      // the trailing save resent the reordered shape…
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(2);
      const trailingPayload = mockUpdateWorkout.mock.calls[1][1] as {
        exercises: { id?: string }[];
      };
      expect(trailingPayload.exercises.map((e) => e.id)).toEqual([
        'ex-uuid-2',
        'ex-uuid-1',
      ]);
      // …whose echo converged the store to clean in the reordered order.
      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(getStore().session!.exercises.map((e) => e.id)).toEqual([
        'ex-uuid-2',
        'ex-uuid-1',
      ]);
    });
  });

  describe('failures', () => {
    it('fails silently in the background: store stays dirty, no toast, error logged', async () => {
      renderAutosave();
      mockUpdateWorkout.mockRejectedValue(new Error('network down'));
      startAndEdit();
      await advance(AUTOSAVE_DEBOUNCE_MS);

      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(getStore().hasUnsavedChanges).toBe(true);
      expect(mockToastShow).not.toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith(
        'Active workout autosave failed',
        'ERROR',
        ['network down'],
      );
    });

    it('toasts once per failure streak at flush, and recovers on success', async () => {
      const { result } = renderAutosave();
      mockUpdateWorkout.mockRejectedValue(new Error('network down'));
      startAndEdit();

      let ok = true;
      await act(async () => {
        ok = await result.current.flush();
      });
      expect(ok).toBe(false);
      expect(mockToastShow).toHaveBeenCalledTimes(1);
      expect(mockInvalidate).not.toHaveBeenCalled();

      // Second failing flush in the same streak stays silent.
      await act(async () => {
        ok = await result.current.flush();
      });
      expect(ok).toBe(false);
      expect(mockToastShow).toHaveBeenCalledTimes(1);

      // Recovery: a successful flush saves, invalidates, and re-arms the toast.
      mockUpdateWorkout.mockImplementation(async () => getStore().session!);
      await act(async () => {
        ok = await result.current.flush();
      });
      expect(ok).toBe(true);
      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
      expect(mockToastShow).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush', () => {
    it('invalidates date caches only after a background save actually landed', async () => {
      const { result } = renderAutosave();
      startAndEdit();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockInvalidate).not.toHaveBeenCalled();

      await act(async () => {
        await result.current.flush();
      });
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
      expect(mockInvalidate).toHaveBeenCalledWith(queryClient, '2026-03-20');

      // A second flush with nothing new saved does not invalidate again.
      await act(async () => {
        await result.current.flush();
      });
      expect(mockInvalidate).toHaveBeenCalledTimes(1);
    });

    it('cancels the pending debounce timer and saves immediately', async () => {
      const { result } = renderAutosave();
      startAndEdit();

      await act(async () => {
        await result.current.flush();
      });
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(getStore().hasUnsavedChanges).toBe(false);

      // The debounce timer was cleared — no second save fires later.
      await advance(AUTOSAVE_DEBOUNCE_MS * 2);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
    });

    it('resolves true without saving when the session is clean', async () => {
      const { result } = renderAutosave();
      act(() => {
        getStore().startWorkout(makeSession());
      });

      let ok = false;
      await act(async () => {
        ok = await result.current.flush();
      });
      expect(ok).toBe(true);
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe('saveActiveWorkoutSession', () => {
    it("returns 'clean' when there is nothing to save", async () => {
      await expect(saveActiveWorkoutSession(queryClient)).resolves.toBe('clean');
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
    });

    it("skips sessions with no exercises and reports 'clean'", async () => {
      act(() => {
        getStore().startWorkout(makeSession());
      });
      useActiveWorkoutStore.setState({
        session: { ...makeSession(), exercises: [] },
        hasUnsavedChanges: true,
      });

      await expect(saveActiveWorkoutSession(queryClient)).resolves.toBe('clean');
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith(
        'Active workout autosave skipped: session has no exercises',
        'WARNING',
      );
    });

    it('captures the revision and entry-id order at send time and hands them to applyServerSession', async () => {
      startAndEdit();
      const revisionAtSend = getStore().sessionRevision;
      const original = getStore().applyServerSession;
      const spy = jest.fn(original);
      useActiveWorkoutStore.setState({ applyServerSession: spy });
      try {
        await saveActiveWorkoutSession(queryClient);
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'session-1' }),
          revisionAtSend,
          ['ex-uuid-1'],
        );
      } finally {
        useActiveWorkoutStore.setState({ applyServerSession: original });
      }
    });
  });

  describe('flushActiveWorkoutBeforeClear', () => {
    it('saves, invalidates the entry date, and resolves true', async () => {
      startAndEdit();
      await expect(flushActiveWorkoutBeforeClear(queryClient)).resolves.toBe(true);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(mockInvalidate).toHaveBeenCalledWith(queryClient, '2026-03-20');
    });

    it('resolves false on failure without invalidating', async () => {
      mockUpdateWorkout.mockRejectedValue(new Error('network down'));
      startAndEdit();
      await expect(flushActiveWorkoutBeforeClear(queryClient)).resolves.toBe(false);
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect(getStore().hasUnsavedChanges).toBe(true);
    });
  });
});
