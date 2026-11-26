import React from 'react';
import { act, render, fireEvent } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutHeader, {
  buildExerciseProgress,
} from '../../src/components/ActiveWorkoutHeader';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';
import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';
import { formatElapsed } from '../../src/utils/workoutSession';

jest.mock('../../src/hooks/useHeartRateZoneColor', () => ({
  useHeartRateZoneColor: () => null,
}));

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    entry_date: '2026-07-01',
    workout_preset_id: null,
    name: 'Push Day',
    description: null,
    notes: null,
    source: 'sparky',
    total_duration_minutes: 60,
    activity_details: [],
    exercises: [
      {
        id: 'ex-1',
        sets: [{ id: 101 }, { id: 102 }],
      } as any,
      {
        id: 'ex-2',
        sets: [{ id: 201 }],
      } as any,
      {
        id: 'ex-3',
        sets: [{ id: 301 }, { id: 302 }],
      } as any,
    ],
  };
}

describe('formatElapsed', () => {
  it('formats MM:SS under an hour and adds hours once crossed', () => {
    const start = 1_700_000_000_000;
    expect(formatElapsed(start, start)).toBe('00:00');
    expect(formatElapsed(start, start + 59_000)).toBe('00:59');
    expect(formatElapsed(start, start + 61_000)).toBe('01:01');
    expect(formatElapsed(start, start + 3_600_000 + 125_000)).toBe('01:02:05');
  });

  it('shows zero when startedAt is null or in the future', () => {
    expect(formatElapsed(null, 123)).toBe('00:00');
    expect(formatElapsed(2_000, 1_000)).toBe('00:00');
  });
});

describe('buildExerciseProgress', () => {
  it('counts completed sets per exercise', () => {
    const progress = buildExerciseProgress(makeSession(), {
      '101': true,
      '301': true,
    });
    expect(progress).toEqual([
      { entryId: 'ex-1', totalSets: 2, completedSets: 1 },
      { entryId: 'ex-2', totalSets: 1, completedSets: 0 },
      { entryId: 'ex-3', totalSets: 2, completedSets: 1 },
    ]);
  });

  it('returns zero counts for an untouched session', () => {
    const progress = buildExerciseProgress(makeSession(), {});
    expect(progress.every((p) => p.completedSets === 0)).toBe(true);
  });
});

describe('ActiveWorkoutHeader', () => {
  const start = 1_700_000_000_000;

  beforeEach(() => {
    // The elapsed clock reads the wall clock and ticks on its own.
    jest.useFakeTimers();
    jest.setSystemTime(start + 62_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function renderHeaderComponent(
    completedSetIds: Record<string, true>,
    overrides?: {
      onBack?: () => void;
      onDiscard?: () => void;
      onEndWorkout?: () => void;
      onRename?: () => void;
      onReorder?: () => void;
      onAddExercise?: () => void;
      onOpenSettings?: () => void;
      onClearAllSets?: () => void;
    }
  ) {
    const progress = buildExerciseProgress(makeSession(), completedSetIds);
    return render(
      <ActiveWorkoutHeader
        name="Push Day"
        startedAt={start}
        progress={progress}
        focusBar={{ position: 1, total: 3 }}
        onBack={overrides?.onBack ?? jest.fn()}
        onDiscard={overrides?.onDiscard ?? jest.fn()}
        onEndWorkout={overrides?.onEndWorkout}
        onRename={overrides?.onRename}
        onReorder={overrides?.onReorder}
        onAddExercise={overrides?.onAddExercise}
        onOpenSettings={overrides?.onOpenSettings}
        onClearAllSets={overrides?.onClearAllSets}
      />
    );
  }

  it('renders the elapsed clock pill', () => {
    const { getByText } = renderHeaderComponent({});
    expect(getByText('01:02')).toBeTruthy();
  });

  describe('beside a side strip', () => {
    function renderStrip() {
      const progress = buildExerciseProgress(makeSession(), {
        '101': true,
        '102': true,
      });
      return render(
        <ActiveWorkoutHeader
          name="Push Day"
          startedAt={start}
          progress={progress}
          focusBar={{ position: 1, total: 3 }}
          buttonsInStrip
          onBack={jest.fn()}
          onDiscard={jest.fn()}
        />
      );
    }

    it('shows the compact title block with elapsed time and the done count, no buttons', () => {
      const { getByText, queryByLabelText, getAllByText } = renderStrip();
      expect(getAllByText('Push Day').length).toBeGreaterThanOrEqual(1);
      expect(getByText('01:02 elapsed')).toBeTruthy();
      expect(getByText('1 / 3 exercises')).toBeTruthy();
      expect(queryByLabelText('Back')).toBeNull();
      expect(queryByLabelText('Workout menu')).toBeNull();
    });
  });

  describe('focus bar', () => {
    function renderFocusBar(onOpenList?: () => void, onBack = jest.fn()) {
      const progress = buildExerciseProgress(makeSession(), {});
      return render(
        <ActiveWorkoutHeader
          name="Push Day"
          startedAt={start}
          progress={progress}
          focusBar={{ position: 2, total: 3, onOpenList }}
          onBack={onBack}
          onDiscard={jest.fn()}
        />
      );
    }

    it('shows the elapsed pill, the list button with the position and the menu', () => {
      const { getByText, getByLabelText, queryByText, queryByTestId } =
        renderFocusBar(jest.fn());
      expect(getByText('2/3')).toBeTruthy();
      expect(getByLabelText('Exercise list').props.accessibilityValue).toEqual({
        text: 'Exercise 2 of 3',
      });
      expect(getByText('01:02')).toBeTruthy();
      expect(getByLabelText('01:02 elapsed')).toBeTruthy();
      expect(getByLabelText('Workout menu')).toBeTruthy();
      expect(queryByText('01:02 elapsed')).toBeNull();
      expect(queryByTestId('focus-header-heart-rate')).toBeNull();
      expect(queryByTestId('focus-header-calories')).toBeNull();
    });

    it('adds the live heart rate and the energy to the pill only when present', () => {
      act(() => {
        useActiveWorkoutStore.setState({
          sessionId: 'session-1',
          startedAt: start,
        });
        useLiveHeartRateStore.setState({
          reading: {
            sessionId: 'session-1',
            exerciseEntryId: 'ex-2',
            bpm: 141,
            at: start + 61_000,
          },
        });
      });
      const progress = buildExerciseProgress(makeSession(), {});
      const { getByLabelText, getByText, queryByTestId, rerender } = render(
        <ActiveWorkoutHeader
          name="Push Day"
          startedAt={start}
          progress={progress}
          focusBar={{
            position: 2,
            total: 3,
            exerciseEntryId: 'ex-2',
            caloriesKcal: 123.4,
          }}
          onBack={jest.fn()}
          onDiscard={jest.fn()}
        />
      );
      expect(getByText('141')).toBeTruthy();
      expect(getByLabelText('Heart rate 141 bpm')).toBeTruthy();
      expect(getByText('123')).toBeTruthy();
      expect(getByLabelText('Energy 123 kcal')).toBeTruthy();
      // Another exercise has no reading of its own.
      rerender(
        <ActiveWorkoutHeader
          name="Push Day"
          startedAt={start}
          progress={progress}
          focusBar={{ position: 1, total: 3, exerciseEntryId: 'ex-1' }}
          onBack={jest.fn()}
          onDiscard={jest.fn()}
        />
      );
      expect(queryByTestId('focus-header-heart-rate')).toBeNull();
      expect(queryByTestId('focus-header-calories')).toBeNull();
      act(() => {
        useLiveHeartRateStore.setState({ reading: null });
        useActiveWorkoutStore.setState({ sessionId: null, startedAt: null });
      });
    });

    it('draws the workout menu as grouped cards', () => {
      const progress = buildExerciseProgress(makeSession(), {});
      const { queryAllByTestId, getByTestId } = render(
        <ActiveWorkoutHeader
          name="Push Day"
          startedAt={start}
          progress={progress}
          focusBar={{ position: 1, total: 3 }}
          onBack={jest.fn()}
          onAddExercise={jest.fn()}
          onEndWorkout={jest.fn()}
          onDiscard={jest.fn()}
        />
      );
      expect(queryAllByTestId('action-sheet-card')).toHaveLength(3);
      expect(getByTestId('action-sheet-item-discard')).toBeTruthy();
    });

    it('opens the exercise list from the list button', () => {
      const onOpenList = jest.fn();
      const { getByLabelText } = renderFocusBar(onOpenList);
      fireEvent.press(getByLabelText('Exercise list'));
      expect(onOpenList).toHaveBeenCalledTimes(1);
    });

    it('drops the list button when there is no list to open, and still goes back', () => {
      const onBack = jest.fn();
      const { queryByLabelText, getByLabelText } = renderFocusBar(
        undefined,
        onBack
      );
      expect(queryByLabelText('Exercise list')).toBeNull();
      fireEvent.press(getByLabelText('Back'));
      expect(onBack).toHaveBeenCalledTimes(1);
    });

    it('ticks the elapsed pill on its own', () => {
      const { getByText } = renderFocusBar(jest.fn());
      act(() => {
        jest.advanceTimersByTime(1_000);
      });
      expect(getByText('01:03')).toBeTruthy();
    });
  });

  it('fires onBack from the back button', () => {
    const onBack = jest.fn();
    const { getByLabelText } = renderHeaderComponent({}, { onBack });
    fireEvent.press(getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('opens the kebab menu and fires onDiscard from Discard workout', () => {
    const onDiscard = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onDiscard }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Discard workout'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('shows Rename workout and fires onRename when provided', () => {
    const onRename = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onRename }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Rename workout'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('omits Rename workout when onRename is not provided', () => {
    const { getByLabelText, queryByText } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryByText('Rename workout')).toBeNull();
  });

  it('omits Reorder exercises when onReorder is not provided', () => {
    const { getByLabelText, queryByText } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryByText('Reorder exercises')).toBeNull();
  });

  it('shows Reorder exercises and fires onReorder when provided', () => {
    const onReorder = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onReorder }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Reorder exercises'));
    expect(onReorder).toHaveBeenCalledTimes(1);
  });

  it('shows Add exercise and fires onAddExercise when provided', () => {
    const onAddExercise = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onAddExercise }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Add exercise'));
    expect(onAddExercise).toHaveBeenCalledTimes(1);
  });

  it('omits Add exercise and Clear all logged sets when their handlers are absent', () => {
    const { getByLabelText, queryByText } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryByText('Add exercise')).toBeNull();
    expect(queryByText('Clear all logged sets')).toBeNull();
  });

  it('shows Clear all logged sets and fires onClearAllSets when provided', () => {
    const onClearAllSets = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onClearAllSets }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Clear all logged sets'));
    expect(onClearAllSets).toHaveBeenCalledTimes(1);
  });

  it('shows Workout settings and fires onOpenSettings when provided', () => {
    const onOpenSettings = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent(
      {},
      { onOpenSettings }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Workout settings'));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('omits Workout settings when onOpenSettings is not provided', () => {
    const { getByLabelText, queryByText } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryByText('Workout settings')).toBeNull();
  });

  it('separates the full menu into edit, workout, finish, and danger cards', () => {
    const { getByLabelText, queryAllByTestId } = renderHeaderComponent(
      {},
      {
        onEndWorkout: jest.fn(),
        onRename: jest.fn(),
        onReorder: jest.fn(),
        onAddExercise: jest.fn(),
        onOpenSettings: jest.fn(),
        onClearAllSets: jest.fn(),
      }
    );
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryAllByTestId('action-sheet-card')).toHaveLength(4);
  });

  it('renders the minimal menu (Discard only) as a single card', () => {
    const { getByLabelText, queryAllByTestId } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryAllByTestId('action-sheet-card')).toHaveLength(1);
  });
});
