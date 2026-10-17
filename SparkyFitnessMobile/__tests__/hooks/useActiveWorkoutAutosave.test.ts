import { act, renderHook } from '@testing-library/react-native';
import { AppState, type NativeEventSubscription } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  KeyboardController,
  KeyboardEvents,
} from 'react-native-keyboard-controller';
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
import { ApiError } from '../../src/services/api/errors';
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
  fireRestCompleteCue: jest.fn(),
}));

const mockUpdateWorkout = updateWorkout as jest.MockedFunction<
  typeof updateWorkout
>;
const mockInvalidate = invalidateExerciseCache as jest.MockedFunction<
  typeof invalidateExerciseCache
>;
const mockSyncCache = syncExerciseSessionInCache as jest.MockedFunction<
  typeof syncExerciseSessionInCache
>;
const mockAddLog = addLog as jest.MockedFunction<typeof addLog>;
const mockToastShow = Toast.show as jest.MockedFunction<typeof Toast.show>;
const mockKeyboardVisible = KeyboardController.isVisible as jest.MockedFunction<
  typeof KeyboardController.isVisible
>;
const mockAddKeyboardListener =
  KeyboardEvents.addListener as jest.MockedFunction<
    typeof KeyboardEvents.addListener
  >;

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
        new Date(completedMs).toISOString()
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
        location: null,
        exercises: expect.any(Array),
      });
    });

    it('marks the store clean and syncs the history cache after a save', async () => {
      renderAutosave();
      startAndEdit();
      await advance(AUTOSAVE_DEBOUNCE_MS);

      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(mockSyncCache).toHaveBeenCalledWith(
        queryClient,
        expect.objectContaining({
          id: 'session-1',
        })
      );
      // Date-keyed caches are only invalidated at flush points.
      expect(mockInvalidate).not.toHaveBeenCalled();
    });

    it('keeps a single request in flight and queues one trailing save', async () => {
      renderAutosave();
      startAndEdit(80);

      let resolveFirst!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
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
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );
      await advance(AUTOSAVE_DEBOUNCE_MS);
      const staleServerEcho = getStore().session!;

      // Mid-flight edit: the response must not clobber this newer value.
      act(() => {
        getStore().updateSetField('101', { weight: 95 });
      });

      let resolveTrailing!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveTrailing = resolve;
          })
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
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
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

  describe('while a set is being edited', () => {
    type ResolveSave = (session: PresetSessionResponse) => Promise<void>;

    function renderEditable(editing: boolean) {
      return renderHook(
        (props: { editing: boolean }) => useActiveWorkoutAutosave(props),
        {
          initialProps: { editing },
          wrapper: createQueryWrapper(queryClient),
        }
      );
    }

    /** The server's copy of the live session, with these set ids reassigned. */
    function serverCopy(ids: Record<string, number>): PresetSessionResponse {
      const local = getStore().session!;
      return {
        ...local,
        exercises: local.exercises.map((exercise) => ({
          ...exercise,
          sets: exercise.sets.map((set) => ({
            ...set,
            id: ids[String(set.id)] ?? set.id,
          })),
        })),
      };
    }

    /** Make the next save hang until the returned function resolves it. */
    function deferNextSave(): ResolveSave {
      let resolve!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          })
      );
      return async (session) => {
        await act(async () => {
          resolve(session);
          await jest.advanceTimersByTimeAsync(0);
        });
      };
    }

    function sentSetIds(call: number): (number | undefined)[] {
      const payload = mockUpdateWorkout.mock.calls[call]![1];
      return payload.exercises![0]!.sets!.map((set) => set.id);
    }

    // The jest preset mocks AppState.currentState as a function; a response
    // is only held while the app is in the foreground.
    const currentStateDescriptor = Object.getOwnPropertyDescriptor(
      AppState,
      'currentState'
    );

    function setAppState(state: string): void {
      Object.defineProperty(AppState, 'currentState', {
        get: () => state,
        configurable: true,
      });
    }

    beforeEach(() => {
      // Editing ends with the keyboard already gone unless a test says not.
      mockKeyboardVisible.mockReturnValue(false);
      setAppState('active');
    });

    afterEach(() => {
      mockKeyboardVisible.mockReturnValue(true);
      if (currentStateDescriptor != null) {
        Object.defineProperty(AppState, 'currentState', currentStateDescriptor);
      }
    });

    it('still sends the save on the usual debounce', async () => {
      renderEditable(true);
      startAndEdit();

      await advance(AUTOSAVE_DEBOUNCE_MS - 1);
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
      await advance(1);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
    });

    it('does not push back a pending save when a cell gains focus', async () => {
      const { rerender } = renderEditable(false);
      startAndEdit();

      await advance(AUTOSAVE_DEBOUNCE_MS - 500);
      rerender({ editing: true });
      await advance(500);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
    });

    it('holds a response that lands mid-edit and adopts it once editing ends', async () => {
      const { rerender } = renderEditable(false);
      startAndEdit(80);
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);

      // The lifter taps a cell before the reply arrives.
      rerender({ editing: true });
      const localBefore = getStore().session;
      await resolveSave(serverCopy({ '101': 501, '102': 502 }));

      expect(getStore().session).toBe(localBefore);
      expect(getStore().hasUnsavedChanges).toBe(true);

      rerender({ editing: false });
      await advance(0);
      const sets = getStore().session!.exercises[0].sets;
      expect(sets.map((set) => set.id)).toEqual([501, 502]);
      expect(sets[0].weight).toBe(80);
      expect(getStore().hasUnsavedChanges).toBe(false);
      // Adopting a clean echo leaves nothing for another save.
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
    });

    it('keeps edits made while the response was held and sends them with the server ids', async () => {
      const { rerender } = renderEditable(false);
      act(() => {
        getStore().startWorkout(makeSession());
        getStore().addSetToExercise('ex-uuid-1');
      });
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(sentSetIds(0)).toEqual([101, 102, undefined]);

      rerender({ editing: true });
      await resolveSave(serverCopy({ '-1': 103 }));
      act(() => {
        getStore().updateSetField('-1', { reps: 12 });
      });

      rerender({ editing: false });
      await advance(0);
      const sets = getStore().session!.exercises[0].sets;
      expect(sets.map((set) => set.id)).toEqual([101, 102, 103]);
      expect(sets[2].reps).toBe(12);
      expect(getStore().hasUnsavedChanges).toBe(true);

      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(2);
      expect(sentSetIds(1)).toEqual([101, 102, 103]);
      const resent = mockUpdateWorkout.mock.calls[1]![1].exercises![0]!.sets!;
      expect(resent[2]!.reps).toBe(12);
    });

    it('adopts a held response before any other save builds its payload', async () => {
      const { rerender } = renderEditable(false);
      act(() => {
        getStore().startWorkout(makeSession());
        getStore().addSetToExercise('ex-uuid-1');
      });
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      rerender({ editing: true });
      await resolveSave(serverCopy({ '-1': 103 }));
      expect(getStore().session!.exercises[0].sets[2].id).toBe(-1);

      // e.g. the watch logs a set while the phone still has a cell focused.
      act(() => {
        getStore().completeSet('101');
      });
      await act(async () => {
        await saveActiveWorkoutSession(queryClient);
      });

      expect(sentSetIds(1)).toEqual([101, 102, 103]);
    });

    it('takes in a held response on flush, even mid-edit', async () => {
      const { result, rerender } = renderEditable(false);
      startAndEdit(80);
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      rerender({ editing: true });
      await resolveSave(serverCopy({ '101': 501, '102': 502 }));

      await act(async () => {
        await result.current.flush();
      });

      expect(
        getStore().session!.exercises[0].sets.map((set) => set.id)
      ).toEqual([501, 502]);
      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
    });

    it('waits for the keyboard to finish closing before adopting', async () => {
      const { rerender } = renderEditable(false);
      startAndEdit(80);
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      rerender({ editing: true });
      await resolveSave(serverCopy({ '101': 501, '102': 502 }));

      // Log dismisses the keyboard as it ends editing: still closing.
      mockKeyboardVisible.mockReturnValue(true);
      mockAddKeyboardListener.mockClear();
      rerender({ editing: false });
      await advance(0);
      expect(getStore().session!.exercises[0].sets[0].id).toBe(101);

      const didHide = mockAddKeyboardListener.mock.calls.find(
        ([event]) => event === 'keyboardDidHide'
      );
      expect(didHide).toBeDefined();
      act(() => {
        didHide![1]({
          height: 0,
          duration: 0,
          timestamp: 0,
          target: -1,
          type: 'default',
          appearance: 'light',
        });
      });
      expect(getStore().session!.exercises[0].sets[0].id).toBe(501);
    });

    describe('when the app leaves the foreground', () => {
      let appStateListeners: ((state: string) => void)[];
      // The jest preset's AppState mock: a spy over it would restore it to
      // an empty implementation, so its own implementation is swapped back.
      const mockAddEventListener = AppState.addEventListener as jest.Mock;
      const defaultAddEventListener =
        mockAddEventListener.getMockImplementation();
      beforeEach(() => {
        appStateListeners = [];
        mockAddEventListener.mockImplementation(
          (_: string, handler: (state: string) => void) => {
            appStateListeners.push(handler);
            return { remove: jest.fn() } as unknown as NativeEventSubscription;
          }
        );
      });

      afterEach(() => {
        mockAddEventListener.mockImplementation(defaultAddEventListener);
      });

      // The held response lives only in memory; an app killed in the
      // background must come back with the server's ids in the store.
      it('takes in a held response mid-edit', async () => {
        const { rerender } = renderEditable(false);
        startAndEdit(80);
        const resolveSave = deferNextSave();
        await advance(AUTOSAVE_DEBOUNCE_MS);
        rerender({ editing: true });
        await resolveSave(serverCopy({ '101': 501, '102': 502 }));
        expect(getStore().session!.exercises[0].sets[0].id).toBe(101);

        act(() => {
          for (const listener of appStateListeners) listener('background');
        });

        expect(
          getStore().session!.exercises[0].sets.map((set) => set.id)
        ).toEqual([501, 502]);
        expect(getStore().hasUnsavedChanges).toBe(false);
      });

      // iOS reports inactive (app switcher, a call) before background, and a
      // swipe from the app switcher can kill the app without reaching it.
      it.each(['inactive', 'background'])(
        'does not hold a response that lands while the app is %s',
        async (appState) => {
          const { rerender } = renderEditable(false);
          startAndEdit(80);
          const resolveSave = deferNextSave();
          await advance(AUTOSAVE_DEBOUNCE_MS);
          rerender({ editing: true });
          setAppState(appState);
          await resolveSave(serverCopy({ '101': 501, '102': 502 }));

          expect(
            getStore().session!.exercises[0].sets.map((set) => set.id)
          ).toEqual([501, 502]);
          expect(getStore().hasUnsavedChanges).toBe(false);
        }
      );
    });

    it('drops a held response once its live run has been replaced', async () => {
      const { rerender } = renderEditable(false);
      startAndEdit(80);
      const resolveSave = deferNextSave();
      await advance(AUTOSAVE_DEBOUNCE_MS);
      rerender({ editing: true });
      await resolveSave(serverCopy({ '101': 501, '102': 502 }));

      // Discarded and started again from the same diary session.
      await advance(1_000);
      act(() => {
        getStore().clearWorkout({ discarded: true });
        getStore().startWorkout(makeSession());
      });
      const restarted = getStore().session;

      rerender({ editing: false });
      await advance(0);
      expect(getStore().session).toBe(restarted);
      expect(getStore().session!.exercises[0].sets[0].id).toBe(101);
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
        [
          'sessionId: session-1',
          'session source: sparky',
          'status: unknown',
          'server response: network down',
        ]
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

    it('logs ApiError status and exact body for workout plan conflicts', async () => {
      renderAutosave();
      const body = JSON.stringify({
        message:
          'Nested exercise editing is only supported for manual, sparky, or workout plan sessions.',
      });
      mockUpdateWorkout.mockRejectedValue(
        new ApiError('Request failed', 409, body)
      );
      startAndEdit();
      await advance(AUTOSAVE_DEBOUNCE_MS);

      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(getStore().hasUnsavedChanges).toBe(true);
      expect(mockAddLog).toHaveBeenCalledWith(
        'Active workout autosave failed',
        'ERROR',
        [
          'sessionId: session-1',
          'session source: sparky',
          'status: 409',
          `server response: ${body}`,
        ]
      );
    });

    it('logs the session captured before the request when the store changes mid-flight', async () => {
      renderAutosave();
      const planSession = { ...makeSession(), source: 'Workout Plan' };
      act(() => {
        getStore().startWorkout(planSession);
        getStore().updateSetField('101', { weight: 80 });
      });

      let rejectRequest!: (error: Error) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectRequest = reject;
          })
      );
      await advance(AUTOSAVE_DEBOUNCE_MS);
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);

      // The user ends the workout while the save is in flight.
      act(() => {
        getStore().clearWorkout();
      });

      await act(async () => {
        rejectRequest(new Error('network down'));
      });

      expect(mockAddLog).toHaveBeenCalledWith(
        'Active workout autosave failed',
        'ERROR',
        [
          'sessionId: session-1',
          'session source: Workout Plan',
          'status: unknown',
          'server response: network down',
        ]
      );
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

    it('flushes a Workout Plan session with a completed set and clears dirty state', async () => {
      const { result } = renderAutosave();
      const planSession = { ...makeSession(), source: 'Workout Plan' };
      act(() => {
        getStore().startWorkout(planSession);
        getStore().completeActiveSet();
      });

      // The beforeEach echo mock is the successful server response.
      let ok = false;
      await act(async () => {
        ok = await result.current.flush();
      });

      expect(ok).toBe(true);
      expect(getStore().hasUnsavedChanges).toBe(false);
      expect(mockUpdateWorkout).toHaveBeenCalledWith(
        'session-1',
        expect.objectContaining({
          exercises: [
            expect.objectContaining({
              sets: [
                expect.objectContaining({
                  reps: 10,
                  weight: 60,
                  completed_at: expect.any(String),
                }),
                expect.anything(),
              ],
            }),
          ],
        })
      );
    });
  });

  describe('saveActiveWorkoutSession', () => {
    it("returns 'clean' when there is nothing to save", async () => {
      await expect(saveActiveWorkoutSession(queryClient)).resolves.toBe(
        'clean'
      );
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

      await expect(saveActiveWorkoutSession(queryClient)).resolves.toBe(
        'clean'
      );
      expect(mockUpdateWorkout).not.toHaveBeenCalled();
      expect(mockAddLog).toHaveBeenCalledWith(
        'Active workout autosave skipped: session has no exercises',
        'WARNING'
      );
    });

    it('never overlaps two saves, even from different callers', async () => {
      startAndEdit(80);
      let resolveFirst!: (session: PresetSessionResponse) => void;
      mockUpdateWorkout.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );

      // e.g. the autosave hook and the watch bridge's per-set flush.
      const first = saveActiveWorkoutSession(queryClient);
      const second = saveActiveWorkoutSession(queryClient);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      const echo = getStore().session!;

      // An edit lands while the first request is in flight.
      act(() => {
        getStore().updateSetField('101', { weight: 90 });
      });

      await act(async () => {
        resolveFirst(echo);
        await jest.advanceTimersByTimeAsync(0);
      });
      await expect(first).resolves.toBe('saved');
      await expect(second).resolves.toBe('saved');

      // The queued save ran after the first response and sent the fresh state.
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(2);
      const sent = mockUpdateWorkout.mock.calls[1]![1].exercises![0]!;
      expect(sent.sets![0]!.weight).toBe(90);
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
          [['101', '102']]
        );
      } finally {
        useActiveWorkoutStore.setState({ applyServerSession: original });
      }
    });
  });

  describe('flushActiveWorkoutBeforeClear', () => {
    it('saves, invalidates the entry date, and resolves true', async () => {
      startAndEdit();
      await expect(flushActiveWorkoutBeforeClear(queryClient)).resolves.toBe(
        true
      );
      expect(mockUpdateWorkout).toHaveBeenCalledTimes(1);
      expect(mockInvalidate).toHaveBeenCalledWith(queryClient, '2026-03-20');
    });

    it('resolves false on failure without invalidating', async () => {
      mockUpdateWorkout.mockRejectedValue(new Error('network down'));
      startAndEdit();
      await expect(flushActiveWorkoutBeforeClear(queryClient)).resolves.toBe(
        false
      );
      expect(mockInvalidate).not.toHaveBeenCalled();
      expect(getStore().hasUnsavedChanges).toBe(true);
    });
  });
});
