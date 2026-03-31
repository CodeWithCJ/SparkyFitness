import { renderHook, act } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useDraftPersistence } from '../../src/hooks/useDraftPersistence';
import type { ActivityDraft, WorkoutDraft } from '../../src/types/drafts';

jest.mock('../../src/services/workoutDraftService', () => ({
  loadDraft: jest.fn(),
  saveDraft: jest.fn(),
}));

const { loadDraft: mockLoadDraft, saveDraft: mockSaveDraft } = jest.requireMock(
  '../../src/services/workoutDraftService',
);

const makeActivityDraft = (overrides?: Partial<ActivityDraft>): ActivityDraft => ({
  type: 'activity',
  name: '',
  exerciseId: null,
  exerciseName: '',
  exerciseCategory: null,
  caloriesPerHour: 0,
  duration: '',
  distance: '',
  calories: '',
  caloriesManuallySet: false,
  avgHeartRate: '',
  entryDate: '2026-03-12',
  notes: '',
  ...overrides,
});

const makeWorkoutDraft = (overrides?: Partial<WorkoutDraft>): WorkoutDraft => ({
  type: 'workout',
  name: 'Workout',
  entryDate: '2026-03-12',
  exercises: [],
  ...overrides,
});

interface RenderOptions {
  state: ActivityDraft;
  draftType?: 'activity' | 'workout';
  isEditMode?: boolean;
  skipDraftLoad?: boolean;
  onDraftLoaded?: jest.Mock;
  onInitialDate?: jest.Mock;
}

function renderDraftPersistence({
  state,
  draftType = 'activity',
  isEditMode = false,
  skipDraftLoad = false,
  onDraftLoaded = jest.fn(),
  onInitialDate = jest.fn(),
}: RenderOptions) {
  return renderHook(
    ({ state: s }) =>
      useDraftPersistence({
        state: s,
        draftType,
        isEditMode,
        skipDraftLoad,
        onDraftLoaded,
        onInitialDate,
      }),
    { initialProps: { state } },
  );
}

describe('useDraftPersistence', () => {
  let appStateCallbacks: Array<(state: string) => void>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLoadDraft.mockResolvedValue(null);
    appStateCallbacks = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler) => {
      appStateCallbacks.push(handler as (state: string) => void);
      return { remove: jest.fn() } as any;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('draft loading', () => {
    it('loads draft and calls onDraftLoaded when matching type exists', async () => {
      const savedDraft = makeActivityDraft({ exerciseId: 'ex-1', duration: '30' });
      mockLoadDraft.mockResolvedValue(savedDraft);
      const onDraftLoaded = jest.fn();
      const onInitialDate = jest.fn();

      renderDraftPersistence({
        state: makeActivityDraft(),
        onDraftLoaded,
        onInitialDate,
      });

      await act(async () => {});

      expect(mockLoadDraft).toHaveBeenCalled();
      expect(onDraftLoaded).toHaveBeenCalledWith(savedDraft);
      expect(onInitialDate).not.toHaveBeenCalled();
    });

    it('calls onInitialDate when no draft exists', async () => {
      mockLoadDraft.mockResolvedValue(null);
      const onDraftLoaded = jest.fn();
      const onInitialDate = jest.fn();

      renderDraftPersistence({
        state: makeActivityDraft(),
        onDraftLoaded,
        onInitialDate,
      });

      await act(async () => {});

      expect(onDraftLoaded).not.toHaveBeenCalled();
      expect(onInitialDate).toHaveBeenCalled();
    });

    it('calls onInitialDate when saved draft type does not match', async () => {
      mockLoadDraft.mockResolvedValue(makeWorkoutDraft());
      const onDraftLoaded = jest.fn();
      const onInitialDate = jest.fn();

      renderDraftPersistence({
        state: makeActivityDraft(),
        draftType: 'activity',
        onDraftLoaded,
        onInitialDate,
      });

      await act(async () => {});

      expect(onDraftLoaded).not.toHaveBeenCalled();
      expect(onInitialDate).toHaveBeenCalled();
    });

    it('does not load draft in edit mode', async () => {
      renderDraftPersistence({
        state: makeActivityDraft(),
        isEditMode: true,
      });

      await act(async () => {});

      expect(mockLoadDraft).not.toHaveBeenCalled();
    });

    it('does not load draft and calls onInitialDate when skipDraftLoad is true', async () => {
      const onInitialDate = jest.fn();

      renderDraftPersistence({
        state: makeActivityDraft(),
        skipDraftLoad: true,
        onInitialDate,
      });

      expect(mockLoadDraft).not.toHaveBeenCalled();
      expect(onInitialDate).toHaveBeenCalled();
    });
  });

  describe('auto-saving', () => {
    it('saves draft after debounce when state changes', async () => {
      const state1 = makeActivityDraft();
      const { rerender } = renderDraftPersistence({ state: state1 });

      // Wait for draft load to complete (enables saving)
      await act(async () => {});

      const state2 = makeActivityDraft({ duration: '30' });
      rerender({ state: state2 });

      // Not saved yet — still within debounce window
      expect(mockSaveDraft).not.toHaveBeenCalled();

      // Advance past the 300ms debounce
      act(() => jest.advanceTimersByTime(300));

      expect(mockSaveDraft).toHaveBeenCalledWith(state2);
    });

    it('does not save in edit mode', async () => {
      const state1 = makeActivityDraft();
      const { rerender } = renderDraftPersistence({
        state: state1,
        isEditMode: true,
      });

      const state2 = makeActivityDraft({ duration: '30' });
      rerender({ state: state2 });

      act(() => jest.advanceTimersByTime(300));

      expect(mockSaveDraft).not.toHaveBeenCalled();
    });

    it('does not save before draft loading completes', () => {
      // loadDraft returns a pending promise — draft load never completes
      mockLoadDraft.mockReturnValue(new Promise(() => {}));

      const state1 = makeActivityDraft();
      const { rerender } = renderDraftPersistence({ state: state1 });

      const state2 = makeActivityDraft({ duration: '30' });
      rerender({ state: state2 });

      act(() => jest.advanceTimersByTime(300));

      expect(mockSaveDraft).not.toHaveBeenCalled();
    });

    it('does not re-save immediately after restoring a loaded draft', async () => {
      const savedDraft = makeActivityDraft({ exerciseId: 'ex-1', duration: '30' });
      mockLoadDraft.mockResolvedValue(savedDraft);

      const state1 = makeActivityDraft();
      const { rerender } = renderDraftPersistence({ state: state1 });

      // Draft loads, onDraftLoaded fires, sets skipNextSave
      await act(async () => {});

      // Simulate parent updating state after onDraftLoaded (the restored draft)
      rerender({ state: savedDraft });
      act(() => jest.advanceTimersByTime(300));

      expect(mockSaveDraft).not.toHaveBeenCalled();

      // But subsequent changes DO save
      const state3 = makeActivityDraft({ exerciseId: 'ex-1', duration: '45' });
      rerender({ state: state3 });
      act(() => jest.advanceTimersByTime(300));

      expect(mockSaveDraft).toHaveBeenCalledWith(state3);
    });

    it('debounces rapid state changes', async () => {
      const state1 = makeActivityDraft();
      const { rerender } = renderDraftPersistence({ state: state1 });

      await act(async () => {});

      // Rapid changes within the debounce window
      rerender({ state: makeActivityDraft({ duration: '1' }) });
      act(() => jest.advanceTimersByTime(100));

      rerender({ state: makeActivityDraft({ duration: '10' }) });
      act(() => jest.advanceTimersByTime(100));

      const finalState = makeActivityDraft({ duration: '100' });
      rerender({ state: finalState });
      act(() => jest.advanceTimersByTime(300));

      // Only the last state should be saved
      expect(mockSaveDraft).toHaveBeenCalledTimes(1);
      expect(mockSaveDraft).toHaveBeenCalledWith(finalState);
    });
  });

  describe('background and unmount saves', () => {
    it('saves immediately when app goes to background', async () => {
      const state = makeActivityDraft({ duration: '30' });
      renderDraftPersistence({ state });

      await act(async () => {});

      // Trigger background via the captured AppState listener
      act(() => appStateCallbacks[0]('background'));

      expect(mockSaveDraft).toHaveBeenCalledWith(state);
    });

    it('does not listen for AppState changes in edit mode', async () => {
      renderDraftPersistence({
        state: makeActivityDraft(),
        isEditMode: true,
      });

      await act(async () => {});

      expect(AppState.addEventListener).not.toHaveBeenCalled();
    });

    it('flushes pending save on unmount', async () => {
      const state1 = makeActivityDraft();
      const { rerender, unmount } = renderDraftPersistence({ state: state1 });

      await act(async () => {});

      // Change state — starts debounce timer but doesn't save yet
      const state2 = makeActivityDraft({ duration: '30' });
      rerender({ state: state2 });

      expect(mockSaveDraft).not.toHaveBeenCalled();

      // Unmount before debounce completes — should flush
      unmount();

      expect(mockSaveDraft).toHaveBeenCalledWith(state2);
    });

    it('does not save on unmount in edit mode', async () => {
      const { unmount } = renderDraftPersistence({
        state: makeActivityDraft({ duration: '30' }),
        isEditMode: true,
      });

      await act(async () => {});

      unmount();

      expect(mockSaveDraft).not.toHaveBeenCalled();
    });
  });
});
