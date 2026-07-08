import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { ExerciseEntryResponse } from '@workspace/shared';
import ActiveWorkoutExerciseCard from '../../src/components/ActiveWorkoutExerciseCard';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

// Counts mounts (not renders) so a test can assert the thumbnail <Image> is
// reconciled in place across expand/collapse instead of being remounted (a
// remount triggers a fresh network fetch and the visible flash we fixed).
jest.mock('../../src/components/SafeImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  let mounts = 0;
  const SafeImage = () => {
    React.useEffect(() => {
      mounts += 1;
    }, []);
    return <View testID="safe-image" />;
  };
  return {
    __esModule: true,
    default: SafeImage,
    __getMountCount: () => mounts,
    __resetMountCount: () => {
      mounts = 0;
    },
  };
});

// Surface state/mode/badge on the stub so tests can assert what the card
// derived for each row.
jest.mock('../../src/components/ActiveWorkoutSetRow', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ set, state, mode, completedBadge, isFocused, nextSetId, entryId }: any) => (
      <View
        testID={`set-row-${set.id}`}
        accessibilityLabel={`row ${set.id} ${state}${mode === 'view' ? ' read-only' : ''}${completedBadge ? ' badged' : ''}${isFocused ? ' focused' : ''}`}
        accessibilityHint={`next:${nextSetId ?? 'none'} entry:${entryId ?? 'none'}`}
      />
    ),
  };
});

jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(() => ({ data: null })),
}));

// The card only touches the store to capture the PR baseline; a selector-based
// stub exposes a stable spy for that action.
jest.mock('../../src/stores/activeWorkoutStore', () => {
  const capturePrBaseline = jest.fn();
  return {
    __esModule: true,
    useActiveWorkoutStore: (selector: (s: { capturePrBaseline: unknown }) => unknown) =>
      selector({ capturePrBaseline }),
    __capturePrBaseline: capturePrBaseline,
  };
});

const mockSafeImage = jest.requireMock('../../src/components/SafeImage') as {
  __getMountCount: () => number;
  __resetMountCount: () => void;
};
const mockUseExerciseStats = jest.requireMock('../../src/hooks/useExerciseStats')
  .useExerciseStats as jest.Mock;
const mockCapturePrBaseline = jest.requireMock('../../src/stores/activeWorkoutStore')
  .__capturePrBaseline as jest.Mock;

/** Stats fixture with a historical best of 100kg × 5. */
const STATS_WITH_BEST = {
  data: {
    bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
    lastSet: null,
  },
};

function makeExercise(overrides?: Partial<ExerciseEntryResponse>): ExerciseEntryResponse {
  return {
    id: 'ex-uuid-1',
    exercise_id: 'ex-1',
    duration_minutes: 20,
    calories_burned: 150,
    entry_date: '2026-03-20',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: 'ex-1',
      name: 'Bench Press',
      category: 'Strength',
      images: [],
      primary_muscles: null,
      secondary_muscles: null,
      equipment: null,
      instructions: null,
      force: null,
      level: null,
      mechanic: null,
    },
    activity_details: [],
    sets: [
      {
        id: 101,
        set_number: 1,
        set_type: 'normal',
        reps: 10,
        weight: 60,
        duration: null,
        rest_time: 90,
        notes: null,
        rpe: null,
        completed_at: null,
      },
    ],
    ...overrides,
  };
}

type CardProps = React.ComponentProps<typeof ActiveWorkoutExerciseCard>;

function renderCard(expanded: boolean, props?: Partial<CardProps>) {
  const callbacks = {
    onToggleExpanded: jest.fn(),
    onPressRestChip: jest.fn(),
    onPressMetricHeader: jest.fn(),
    onPressOverflow: jest.fn(),
    onComplete: jest.fn(),
    onUncomplete: jest.fn(),
    onCommitField: jest.fn(),
    onDeleteSet: jest.fn(),
    onLongPressSet: jest.fn(),
    onAddSet: jest.fn(),
  };
  const utils = render(
    <ActiveWorkoutExerciseCard
      exercise={makeExercise()}
      expanded={expanded}
      completedSetIds={{}}
      activeSetId="101"
      metricColumn="rpe"
      weightUnit="kg"
      getImageSource={() => null}
      {...callbacks}
      {...props}
    />,
  );
  return { ...utils, callbacks };
}

describe('ActiveWorkoutExerciseCard', () => {
  beforeEach(() => {
    mockUseExerciseStats.mockClear();
    mockUseExerciseStats.mockReturnValue({ data: null });
    mockCapturePrBaseline.mockClear();
  });

  it('renders the overflow trigger when expanded and fires onPressOverflow', () => {
    const { getByLabelText, callbacks } = renderCard(true);

    fireEvent.press(getByLabelText('More options for Bench Press'));

    expect(callbacks.onPressOverflow).toHaveBeenCalledTimes(1);
    expect(callbacks.onPressOverflow).toHaveBeenCalledWith(
      'ex-uuid-1',
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );
  });

  it('offers no overflow trigger while collapsed (expand first)', () => {
    const { queryByLabelText } = renderCard(false);
    expect(queryByLabelText('More options for Bench Press')).toBeNull();
  });

  it('keeps the thumbnail image mounted across expand/collapse (no reload flash)', () => {
    mockSafeImage.__resetMountCount();
    const callbacks = {
      onToggleExpanded: jest.fn(),
      onPressMetricHeader: jest.fn(),
    };
    const element = (expanded: boolean) => (
      <ActiveWorkoutExerciseCard
        exercise={makeExercise()}
        expanded={expanded}
        completedSetIds={{}}
        activeSetId="101"
        metricColumn="rpe"
        weightUnit="kg"
        getImageSource={() => null}
        onPressThumb={jest.fn()}
        {...callbacks}
      />
    );
    const { rerender } = render(element(false));
    expect(mockSafeImage.__getMountCount()).toBe(1);

    // Collapsed and expanded share an identical root → header → thumb prefix,
    // so React reconciles the image in place rather than remounting it.
    rerender(element(true));
    rerender(element(false));
    expect(mockSafeImage.__getMountCount()).toBe(1);
  });

  describe('long-press menu (live)', () => {
    it('opens the overflow menu from a collapsed row long-press', () => {
      const { getByLabelText, callbacks } = renderCard(false);
      fireEvent(getByLabelText('Expand Bench Press'), 'longPress');
      expect(callbacks.onPressOverflow).toHaveBeenCalledWith(
        'ex-uuid-1',
        expect.objectContaining({ x: expect.any(Number) }),
      );
    });

    it('opens the overflow menu from an expanded name long-press', () => {
      const { getAllByLabelText, callbacks } = renderCard(true);
      fireEvent(getAllByLabelText('Collapse Bench Press')[0], 'longPress');
      expect(callbacks.onPressOverflow).toHaveBeenCalledWith(
        'ex-uuid-1',
        expect.objectContaining({ x: expect.any(Number) }),
      );
    });

    it('does not wire long-press in edit mode (screen-scoped to live)', () => {
      const { getByLabelText } = renderCard(false, { mode: 'edit' });
      expect(getByLabelText('Expand Bench Press').props.onLongPress).toBeUndefined();
    });
  });

  describe('view mode', () => {
    it('hides the overflow trigger and the Add set button', () => {
      const { queryByLabelText } = renderCard(true, { mode: 'view' });
      expect(queryByLabelText('More options for Bench Press')).toBeNull();
      expect(queryByLabelText('Add set to Bench Press')).toBeNull();
    });

    it('keeps the metric header pressable and reports its anchor', () => {
      const { getByLabelText, callbacks } = renderCard(true, { mode: 'view' });

      fireEvent.press(getByLabelText('Change metric column'));

      expect(callbacks.onPressMetricHeader).toHaveBeenCalledWith(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      );
    });

    it('renders the rest chip read-only so it cannot open the rest sheet', () => {
      const { getByText, callbacks } = renderCard(true, { mode: 'view' });
      fireEvent.press(getByText('Rest · 1:30'));
      expect(callbacks.onPressRestChip).not.toHaveBeenCalled();
    });

    it('hides the rest chip entirely with showRestChip={false}', () => {
      const { queryByText } = renderCard(true, { mode: 'view', showRestChip: false });
      expect(queryByText('Rest · 1:30')).toBeNull();
    });

    it('skips the exercise stats fetch', () => {
      renderCard(true, { mode: 'view' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith(null, undefined);
    });

    it('never labels a collapsed exercise as planned', () => {
      const { getByText, queryByText } = renderCard(false, {
        mode: 'view',
        completedSetIds: {},
      });
      expect(queryByText('1 sets planned')).toBeNull();
      expect(getByText('1 sets · 600 kg')).toBeTruthy();
    });

    it('drives done/upcoming row states from completedSetIds and marks rows read-only', () => {
      const exercise = makeExercise({
        sets: [
          ...makeExercise().sets,
          {
            id: 102,
            set_number: 2,
            set_type: 'normal',
            reps: 8,
            weight: 60,
            duration: null,
            rest_time: 90,
            notes: null,
            rpe: null,
            completed_at: '2026-07-06T10:00:00.000Z',
          },
        ],
      });
      const { getByTestId } = renderCard(true, {
        mode: 'view',
        exercise,
        activeSetId: null,
        completedSetIds: { '102': Date.parse('2026-07-06T10:00:00.000Z') },
      });

      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe(
        'row 101 upcoming read-only',
      );
      expect(getByTestId('set-row-102').props.accessibilityLabel).toBe(
        'row 102 done read-only',
      );
    });
  });

  describe('edit mode', () => {
    it('derives the current row from activeSetId', () => {
      const { getByTestId } = renderCard(true, { mode: 'edit', activeSetId: '101' });
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe('row 101 current');
    });

    it('never marks rows done — completed sets stay editable with a badge', () => {
      const { getByTestId } = renderCard(true, {
        mode: 'edit',
        activeSetId: null,
        completedSetIds: { '101': Date.parse('2026-07-06T10:00:00.000Z') },
      });
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe(
        'row 101 upcoming badged',
      );
    });

    it('threads nextSetId and entryId to the rows', () => {
      const exercise = makeExercise({
        sets: [
          ...makeExercise().sets,
          { ...makeExercise().sets[0], id: 102, set_number: 2 },
        ],
      });
      const { getByTestId } = renderCard(true, { mode: 'edit', exercise });
      expect(getByTestId('set-row-101').props.accessibilityHint).toBe(
        'next:102 entry:ex-uuid-1',
      );
      expect(getByTestId('set-row-102').props.accessibilityHint).toBe(
        'next:none entry:ex-uuid-1',
      );
    });

    it('keeps the overflow menu and Add set visible', () => {
      const { getByLabelText, callbacks } = renderCard(true, { mode: 'edit' });
      expect(getByLabelText('More options for Bench Press')).toBeTruthy();
      fireEvent.press(getByLabelText('Add set to Bench Press'));
      expect(callbacks.onAddSet).toHaveBeenCalledWith('ex-uuid-1');
    });

    it('fetches exercise stats so "Last time" works for drafts', () => {
      renderCard(true, { mode: 'edit' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', undefined);
    });

    it('never labels a collapsed draft as planned', () => {
      const { getByText, queryByText } = renderCard(false, { mode: 'edit' });
      expect(queryByText('1 sets planned')).toBeNull();
      expect(getByText('1 sets · 600 kg')).toBeTruthy();
    });

    describe('prefill', () => {
      const lastSet = { entryDate: '2026-07-01', weight: 90, reps: 5, setNumber: 1 };
      const emptyFirstSet = () =>
        makeExercise({
          sets: [{ ...makeExercise().sets[0], weight: null, reps: null }],
        });

      beforeEach(() => {
        mockUseExerciseStats.mockReturnValue({ data: { lastSet, bestSet: null } });
      });

      afterEach(() => {
        mockUseExerciseStats.mockReturnValue({ data: null });
      });

      it('commits last-time values once for an empty first set', () => {
        const { callbacks, rerender } = renderCard(true, {
          mode: 'edit',
          exercise: emptyFirstSet(),
          eligibleForPrefill: true,
        });
        expect(callbacks.onCommitField).toHaveBeenCalledTimes(1);
        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', {
          weight: 90,
          reps: 5,
        });

        rerender(
          <ActiveWorkoutExerciseCard
            exercise={emptyFirstSet()}
            expanded
            completedSetIds={{}}
            activeSetId={null}
            metricColumn="rpe"
            weightUnit="kg"
            getImageSource={() => null}
            mode="edit"
            eligibleForPrefill
            onToggleExpanded={callbacks.onToggleExpanded}
            onPressMetricHeader={callbacks.onPressMetricHeader}
            onCommitField={callbacks.onCommitField}
          />,
        );
        expect(callbacks.onCommitField).toHaveBeenCalledTimes(1);
      });

      it('fills weight and reps independently — typed fields are not clobbered', () => {
        const exercise = makeExercise({
          sets: [{ ...makeExercise().sets[0], weight: 80, reps: null }],
        });
        const { callbacks } = renderCard(true, {
          mode: 'edit',
          exercise,
          eligibleForPrefill: true,
        });
        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 5 });
      });

      it('a null last-time weight fills nothing for that field', () => {
        mockUseExerciseStats.mockReturnValue({
          data: { lastSet: { ...lastSet, weight: null }, bestSet: null },
        });
        const { callbacks } = renderCard(true, {
          mode: 'edit',
          exercise: emptyFirstSet(),
          eligibleForPrefill: true,
        });
        expect(callbacks.onCommitField).toHaveBeenCalledWith('101', { reps: 5 });
      });

      it('does not prefill without eligibility or outside edit mode', () => {
        const ineligible = renderCard(true, {
          mode: 'edit',
          exercise: emptyFirstSet(),
          eligibleForPrefill: false,
        });
        expect(ineligible.callbacks.onCommitField).not.toHaveBeenCalled();

        const live = renderCard(true, {
          exercise: emptyFirstSet(),
          eligibleForPrefill: true,
        });
        expect(live.callbacks.onCommitField).not.toHaveBeenCalled();
      });
    });
  });

  describe('PR surfaces (live mode)', () => {
    /** Bench Press with a single heavier working set (105kg × 5). */
    function heavierExercise() {
      return makeExercise({
        sets: [{ ...makeExercise().sets[0], id: 101, weight: 105, reps: 5 }],
      });
    }

    it('passes the session id as excludePresetEntryId to the stats query', () => {
      renderCard(true, { mode: 'live', excludePresetEntryId: 'session-1' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1');
    });

    it('marks the tap-focused row from focusedSetId (distinct from the cursor)', () => {
      const { getByTestId } = renderCard(true, { mode: 'live', focusedSetId: '101' });
      // Cursor (activeSetId) still drives 'current'; focus is an added flag.
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe(
        'row 101 current focused',
      );
    });

    it('marks no row focused when focusedSetId is null', () => {
      const { getByTestId } = renderCard(true, { mode: 'live', focusedSetId: null });
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe('row 101 current');
    });

    it('captures the PR baseline once from the resolved best set', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_BEST);
      renderCard(true, { mode: 'live' });
      expect(mockCapturePrBaseline).toHaveBeenCalledTimes(1);
      expect(mockCapturePrBaseline).toHaveBeenCalledWith('ex-1', {
        weight: 100,
        reps: 5,
      });
    });

    it('captures a null baseline when the exercise has no history', () => {
      mockUseExerciseStats.mockReturnValue({ data: { bestSet: null, lastSet: null } });
      renderCard(true, { mode: 'live' });
      expect(mockCapturePrBaseline).toHaveBeenCalledWith('ex-1', null);
    });

    it('renders the Best line from the historical best', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_BEST);
      const { getByText } = renderCard(true, { mode: 'live' });
      expect(getByText('Best')).toBeTruthy();
      expect(getByText('100 × 5')).toBeTruthy();
    });

    it('surfaces the stamped session record when a set earned a PR', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_BEST);
      const { getByText, queryByText } = renderCard(true, {
        mode: 'live',
        exercise: heavierExercise(),
        prSetIds: { '101': true },
      });
      // The new record (105 × 5) replaces the historical best (100 × 5).
      expect(getByText('105 × 5')).toBeTruthy();
      expect(queryByText('100 × 5')).toBeNull();
    });

    it('does not fetch stats or render the Best line in view mode', () => {
      // View mode passes a null id, so the hook is disabled → no baseline line.
      const { queryByText } = renderCard(true, { mode: 'view' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith(null, undefined);
      expect(mockCapturePrBaseline).not.toHaveBeenCalled();
      expect(queryByText('Best')).toBeNull();
    });
  });
});
