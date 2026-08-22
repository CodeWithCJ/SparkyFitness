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
// derived for each row. accessibilityValue carries the PREVIOUS-column prop:
// 'hidden' = column omitted (undefined), 'dash' = no previous (null).
jest.mock('../../src/components/ActiveWorkoutSetRow', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      set,
      state,
      mode,
      completedBadge,
      isFocused,
      nextSetId,
      entryId,
      previousSet,
      assumed,
      displayNumber,
      distanceUnit,
    }: any) => (
      <View
        testID={`set-row-${set.id}`}
        displayNumber={displayNumber}
        distanceUnit={distanceUnit}
        assumed={assumed == null ? 'none' : `${assumed.weight}x${assumed.reps}`}
        accessibilityLabel={`row ${set.id} ${state}${mode === 'view' ? ' read-only' : ''}${completedBadge ? ' badged' : ''}${isFocused ? ' focused' : ''}`}
        accessibilityHint={`next:${nextSetId ?? 'none'} entry:${entryId ?? 'none'}`}
        accessibilityValue={{
          text: `prev:${
            previousSet === undefined
              ? 'hidden'
              : previousSet === null
                ? 'dash'
                : `${previousSet.weight}x${previousSet.reps}`
          }`,
        }}
      />
    ),
  };
});

// Surface which set the note expand rendered for.
jest.mock('../../src/components/ActiveWorkoutSetDetail', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ set }: any) => <View testID={`set-detail-${set.id}`} />,
  };
});

jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(() => ({ data: null })),
}));

// The card only touches the store to capture the PR baseline; a selector-based
// stub exposes a stable spy for that action.
jest.mock('../../src/stores/activeWorkoutStore', () => {
  const capturePrBaseline = jest.fn();
  const capturePreviousSessionSets = jest.fn();
  const storeState = {
    capturePrBaseline,
    capturePreviousSessionSets,
    plannedSetValues: {},
  };
  return {
    __esModule: true,
    useActiveWorkoutStore: (selector: (s: typeof storeState) => unknown) =>
      selector(storeState),
    __capturePrBaseline: capturePrBaseline,
    __capturePreviousSessionSets: capturePreviousSessionSets,
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
const mockCapturePreviousSessionSets = jest.requireMock(
  '../../src/stores/activeWorkoutStore',
).__capturePreviousSessionSets as jest.Mock;

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
    onCommitExerciseNote: jest.fn(),
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

  describe('column header per modality', () => {
    const withModality = (modality: string | null, category: string | null = 'Strength') =>
      makeExercise({
        exercise_snapshot: {
          ...makeExercise().exercise_snapshot!,
          category,
          modality,
        } as never,
      });

    it('shows kg and Reps for weight_reps', () => {
      const utils = renderCard(true, { exercise: withModality('weight_reps') });
      expect(utils.getByText('kg')).toBeTruthy();
      expect(utils.getByText('Reps')).toBeTruthy();
      expect(utils.queryByText('Sec')).toBeNull();
    });

    it('drops the kg column for reps_only', () => {
      const utils = renderCard(true, { exercise: withModality('reps_only') });
      expect(utils.queryByText('kg')).toBeNull();
      expect(utils.getByText('Reps')).toBeTruthy();
    });

    it('shows a single Sec column for duration', () => {
      const utils = renderCard(true, { exercise: withModality('duration') });
      expect(utils.getByText('Sec')).toBeTruthy();
      expect(utils.queryByText('kg')).toBeNull();
      expect(utils.queryByText('Reps')).toBeNull();
    });

    it('renders the Duration+Distance form for a ≤1-set cardio exercise', () => {
      const utils = renderCard(true, { exercise: withModality('duration_distance') });
      expect(utils.queryByText('Sec')).toBeNull();
      expect(utils.getByText('Duration (min)')).toBeTruthy();
      expect(utils.getByText('Distance (km)')).toBeTruthy();
      expect(utils.queryByLabelText('Add set to Bench Press')).toBeNull();
    });

    it('labels the distance input in miles when that is the display unit', () => {
      const utils = renderCard(true, {
        exercise: withModality('duration_distance'),
        distanceUnit: 'miles',
      });
      expect(utils.getByText('Distance (mi)')).toBeTruthy();
    });

    it('falls back to the Sec table for multi-set cardio (no rows hidden)', () => {
      const base = withModality('duration_distance');
      const utils = renderCard(true, {
        exercise: {
          ...base,
          sets: [base.sets[0], { ...base.sets[0], id: 102, set_number: 2 }],
        },
      });
      expect(utils.getByText('Sec')).toBeTruthy();
      expect(utils.queryByText('Duration (min)')).toBeNull();
      expect(utils.queryByText('Km')).toBeNull();
    });

    it('adds a distance column to the view-mode cardio table', () => {
      const base = withModality('duration_distance');
      const utils = renderCard(true, {
        mode: 'view',
        exercise: {
          ...base,
          sets: [base.sets[0], { ...base.sets[0], id: 102, set_number: 2 }],
        },
      });
      expect(utils.getByText('km')).toBeTruthy();
    });

    it('labels the view-mode distance column Mi and forwards the unit to rows', () => {
      const base = withModality('duration_distance');
      const utils = renderCard(true, {
        mode: 'view',
        distanceUnit: 'miles',
        exercise: {
          ...base,
          sets: [base.sets[0], { ...base.sets[0], id: 102, set_number: 2 }],
        },
      });
      expect(utils.getByText('mi')).toBeTruthy();
      expect(utils.getByTestId('set-row-101').props.distanceUnit).toBe('miles');
    });

    it('omits the distance column on plain duration view tables', () => {
      const utils = renderCard(true, {
        mode: 'view',
        exercise: withModality('duration'),
      });
      expect(utils.getByText('Sec')).toBeTruthy();
      expect(utils.queryByText('Km')).toBeNull();
    });

    it('keeps the Sec table for cardio when the form is disabled (preset surfaces)', () => {
      const utils = renderCard(true, {
        exercise: withModality('duration_distance'),
        cardioFormEnabled: false,
      });
      expect(utils.getByText('Sec')).toBeTruthy();
      expect(utils.queryByText('Duration (min)')).toBeNull();
    });

    it('derives from the snapshot category when modality is absent (old server)', () => {
      const utils = renderCard(true, { exercise: withModality(null, 'Cardio') });
      expect(utils.getByText('Duration (min)')).toBeTruthy();
    });

    it('reports cardio form focus through onActivateSet with translated keys', () => {
      const onActivateSet = jest.fn();
      const utils = renderCard(true, {
        exercise: withModality('duration_distance'),
        onActivateSet,
        setRenderKeys: { '101': 'rk-101' },
      });
      fireEvent(utils.getByLabelText('Duration in minutes for Bench Press'), 'focus');
      expect(onActivateSet).toHaveBeenCalledWith('rk-101', 'duration');
      fireEvent(utils.getByLabelText('Distance in km for Bench Press'), 'focus');
      expect(onActivateSet).toHaveBeenCalledWith('rk-101', 'distance');
    });

    it('shows the summed duration on a collapsed duration exercise', () => {
      const base = withModality('duration');
      const holdSet = base.sets[0];
      const utils = renderCard(false, {
        mode: 'view',
        exercise: {
          ...base,
          sets: [
            { ...holdSet, weight: null, reps: null, duration: 45 },
            // Legacy isometric row: seconds live in reps (pre-duration data).
            { ...holdSet, id: 102, set_number: 2, weight: null, reps: 30, duration: null },
          ],
        },
      });
      expect(utils.getByText('2 sets · 1:15')).toBeTruthy();
    });

    it('clamps the metric column to RPE on duration-like tables and reports it', () => {
      const utils = renderCard(true, {
        exercise: withModality('duration'),
        metricColumn: 'volume',
      });
      expect(utils.getByText('RPE')).toBeTruthy();
      expect(utils.queryByText('Vol')).toBeNull();

      fireEvent.press(utils.getByLabelText('Change metric column'));
      expect(utils.callbacks.onPressMetricHeader).toHaveBeenCalledWith(
        expect.anything(),
        true,
      );
    });

    it('clamps the metric column to RPE on reps_only tables and reports it', () => {
      const utils = renderCard(true, {
        exercise: withModality('reps_only'),
        metricColumn: 'volume',
      });
      expect(utils.getByText('RPE')).toBeTruthy();
      expect(utils.queryByText('Vol')).toBeNull();

      fireEvent.press(utils.getByLabelText('Change metric column'));
      expect(utils.callbacks.onPressMetricHeader).toHaveBeenCalledWith(
        expect.anything(),
        true,
      );
    });

    it('leaves the metric column alone on weight tables', () => {
      const utils = renderCard(true, {
        exercise: withModality('weight_reps'),
        metricColumn: 'volume',
      });
      expect(utils.getByText('Vol')).toBeTruthy();

      fireEvent.press(utils.getByLabelText('Change metric column'));
      expect(utils.callbacks.onPressMetricHeader).toHaveBeenCalledWith(
        expect.anything(),
        false,
      );
    });
  });

  it('renders the overflow trigger when expanded and fires onPressOverflow', () => {
    const { getByLabelText, callbacks } = renderCard(true);

    fireEvent.press(getByLabelText('More options for Bench Press'));

    expect(callbacks.onPressOverflow).toHaveBeenCalledTimes(1);
    expect(callbacks.onPressOverflow).toHaveBeenCalledWith('ex-uuid-1');
  });

  it('offers no overflow trigger while collapsed (expand first)', () => {
    const { queryByLabelText } = renderCard(false);
    expect(queryByLabelText('More options for Bench Press')).toBeNull();
  });

  it('extends the collapsed expand target through the row padding on both sides', () => {
    // The 16px chevron sits flush against the row's px-2 (8px) right padding;
    // without right slop, taps aimed at the icon land in dead margin and the
    // row never expands. Left slop covers the gap-3 strip next to the thumb.
    const { getByLabelText } = renderCard(false);
    const { hitSlop } = getByLabelText('Expand Bench Press').props;
    expect(hitSlop.right).toBeGreaterThanOrEqual(8);
    expect(hitSlop.left).toBeGreaterThanOrEqual(12);
  });

  it('numbers only working sets; warmup/drop/failure rows repeat the previous number (they render letters)', () => {
    const base = makeExercise().sets[0];
    const utils = renderCard(true, {
      exercise: makeExercise({
        sets: [
          { ...base, id: 101, set_number: 1, set_type: 'warmup' },
          { ...base, id: 102, set_number: 2, set_type: 'normal' },
          { ...base, id: 103, set_number: 3, set_type: 'drop' },
          { ...base, id: 104, set_number: 4, set_type: 'failure' },
          { ...base, id: 105, set_number: 5, set_type: 'normal' },
        ],
      }),
    });
    const numberOf = (id: number) => utils.getByTestId(`set-row-${id}`).props.displayNumber;
    expect(numberOf(102)).toBe(1);
    expect(numberOf(103)).toBe(1);
    expect(numberOf(104)).toBe(1);
    expect(numberOf(105)).toBe(2);
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
      expect(callbacks.onPressOverflow).toHaveBeenCalledWith('ex-uuid-1');
    });

    it('opens the overflow menu from an expanded name long-press', () => {
      const { getAllByLabelText, callbacks } = renderCard(true);
      fireEvent(getAllByLabelText('Collapse Bench Press')[0], 'longPress');
      expect(callbacks.onPressOverflow).toHaveBeenCalledWith('ex-uuid-1');
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
        false,
      );
    });

    it('renders the rest chip read-only so it cannot open the rest sheet', () => {
      const { getByLabelText, callbacks } = renderCard(true, { mode: 'view' });
      // The read-only chip shows just the duration; "Rest" lives in the
      // accessible name.
      fireEvent.press(getByLabelText('Rest 1:30'));
      expect(callbacks.onPressRestChip).not.toHaveBeenCalled();
    });

    it('hides the rest chip entirely with showRestChip={false}', () => {
      const { queryByLabelText } = renderCard(true, { mode: 'view', showRestChip: false });
      expect(queryByLabelText('Rest 1:30')).toBeNull();
    });

    it('shows read-only calories, hidden in live mode', () => {
      const view = renderCard(true, { mode: 'view' });
      expect(view.getByText('150 kcal')).toBeTruthy();
      expect(view.queryByLabelText('Edit kcalories burned for Bench Press')).toBeNull();

      const live = renderCard(true, { mode: 'live' });
      expect(live.queryByText('150 kcal')).toBeNull();
    });

    it('skips the exercise stats fetch', () => {
      renderCard(true, { mode: 'view' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith(null, undefined, undefined);
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
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', undefined, undefined);
    });

    describe('calories chip', () => {
      it('renders a tappable chip that swaps to a focused input on press', () => {
        const onChangeCalories = jest.fn();
        const { getByText, getByLabelText, queryByLabelText } = renderCard(true, {
          mode: 'edit',
          onChangeCalories,
          exercise: { ...makeExercise(), editCaloriesText: '150' },
        });

        expect(getByText('150 kcal')).toBeTruthy();
        expect(queryByLabelText('Calories burned for Bench Press')).toBeNull();

        fireEvent.press(getByLabelText('Edit calories burned for Bench Press'));
        const input = getByLabelText('Calories burned for Bench Press');
        fireEvent.changeText(input, '200');
        expect(onChangeCalories).toHaveBeenCalledWith('ex-uuid-1', '200');
      });

      it('shows a dash placeholder chip when the draft has no calories', () => {
        const { getByText } = renderCard(true, {
          mode: 'edit',
          onChangeCalories: jest.fn(),
          exercise: { ...makeExercise(), editCaloriesText: '' },
        });
        expect(getByText('– kcal')).toBeTruthy();
      });

      it('is absent without an onChangeCalories handler', () => {
        const { queryByLabelText } = renderCard(true, { mode: 'edit' });
        expect(queryByLabelText('Edit kcalories burned for Bench Press')).toBeNull();
      });
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
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1', undefined);
    });

    it('passes sourcePresetId through to the stats query', () => {
      renderCard(true, { mode: 'live', sourcePresetId: 42 });
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', undefined, 42);
    });

    it('marks the tap-focused row from focusedSetKey (distinct from the cursor)', () => {
      const { getByTestId } = renderCard(true, { mode: 'live', focusedSetKey: '101' });
      // Cursor (activeSetId) still drives 'current'; focus is an added flag.
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe(
        'row 101 current focused',
      );
    });

    it('marks no row focused when focusedSetKey is null', () => {
      const { getByTestId } = renderCard(true, { mode: 'live', focusedSetKey: null });
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe('row 101 current');
    });

    it('translates the focus render key back to the churned server set id', () => {
      // A just-added set churned -1 → 101 on save; its birth key "-1" lives in
      // setRenderKeys and is what focus is keyed on. The row must still light up
      // even though its set id is now 101.
      const { getByTestId } = renderCard(true, {
        mode: 'live',
        focusedSetKey: '-1',
        setRenderKeys: { '101': '-1' },
      });
      expect(getByTestId('set-row-101').props.accessibilityLabel).toBe(
        'row 101 current focused',
      );
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
      const { getByLabelText, getByTestId, getByText } = renderCard(true, { mode: 'live' });
      expect(getByTestId('icon-trophy-outline')).toBeTruthy();
      expect(getByText('100 × 5')).toBeTruthy();
      // The trophy icon replaces the "Best" label visually; the accessible
      // name keeps the word.
      expect(getByLabelText('Best 100 × 5')).toBeTruthy();
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

    it('skips the stats fetch in view mode without an exclusion id', () => {
      // Without the viewed session's id to exclude, Best could show the very
      // workout being viewed — the hook stays disabled instead.
      const { queryByTestId } = renderCard(true, { mode: 'view' });
      expect(mockUseExerciseStats).toHaveBeenCalledWith(null, undefined, undefined);
      expect(mockCapturePrBaseline).not.toHaveBeenCalled();
      expect(queryByTestId('icon-trophy-outline')).toBeNull();
    });

    it('renders the Best line in view mode when the viewed session is excluded', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_BEST);
      const { getByTestId, getByText, queryByText } = renderCard(true, {
        mode: 'view',
        excludePresetEntryId: 'session-1',
      });
      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1', undefined);
      expect(mockCapturePrBaseline).not.toHaveBeenCalled();
      expect(getByTestId('icon-trophy-outline')).toBeTruthy();
      expect(getByText('100 × 5')).toBeTruthy();
      // The PREV column stays live/edit-only.
      expect(queryByText('Prev')).toBeNull();
    });
  });

  describe('previous column', () => {
    const STATS_WITH_HISTORY = {
      data: {
        bestSet: null,
        lastSet: { entryDate: '2026-01-05', weight: 100, reps: 5, setNumber: 2 },
        recentSessions: [
          {
            entryDate: '2026-01-05',
            sets: [
              { setNumber: 1, setType: 'warmup', weight: 60, reps: 8 },
              { setNumber: 2, setType: null, weight: 100, reps: 5 },
            ],
          },
          {
            entryDate: '2026-01-03',
            sets: [{ setNumber: 1, setType: null, weight: 90, reps: 5 }],
          },
        ],
      },
    };
    /** Bench Press with three sets (ids 101–103) to exercise positional matching. */
    const threeSets = () =>
      makeExercise({
        sets: [
          ...makeExercise().sets,
          { ...makeExercise().sets[0], id: 102, set_number: 2 },
          { ...makeExercise().sets[0], id: 103, set_number: 3 },
        ],
      });
    const prevOf = (utils: ReturnType<typeof renderCard>, id: number) =>
      utils.getByTestId(`set-row-${id}`).props.accessibilityValue.text;

    it('shows the PREV header in live and edit modes but not view', () => {
      const live = renderCard(true, { mode: 'live' });
      expect(live.getByText('Prev')).toBeTruthy();

      const edit = renderCard(true, { mode: 'edit' });
      expect(edit.getByText('Prev')).toBeTruthy();

      const view = renderCard(true, { mode: 'view' });
      expect(view.queryByText('Prev')).toBeNull();
    });

    it('matches the most recent session to rows by position, dashing the overflow', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const utils = renderCard(true, { mode: 'live', exercise: threeSets() });

      // recentSessions[0] has two sets; the third current row has no previous.
      expect(prevOf(utils, 101)).toBe('prev:60x8');
      expect(prevOf(utils, 102)).toBe('prev:100x5');
      expect(prevOf(utils, 103)).toBe('prev:dash');
    });

    it('dashes every row against an old server without recentSessions', () => {
      mockUseExerciseStats.mockReturnValue({
        data: {
          bestSet: null,
          lastSet: { entryDate: '2026-01-05', weight: 100, reps: 5, setNumber: 2 },
        },
      });
      const utils = renderCard(true, { mode: 'live' });
      expect(prevOf(utils, 101)).toBe('prev:dash');
    });

    it('omits the column entirely in view mode even with history fetched', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const utils = renderCard(true, { mode: 'view', excludePresetEntryId: 'session-1' });
      expect(prevOf(utils, 101)).toBe('prev:hidden');
    });

    it('renders no Last stat line (superseded by the column)', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const { queryByText } = renderCard(true, { mode: 'live' });
      expect(queryByText('Last')).toBeNull();
    });

    it('feeds the column in edit mode with the edited session excluded', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const utils = renderCard(true, {
        mode: 'edit',
        excludePresetEntryId: 'session-9',
      });

      expect(mockUseExerciseStats).toHaveBeenCalledWith('ex-1', 'session-9', undefined);
      expect(prevOf(utils, 101)).toBe('prev:60x8');
    });

    it('captures the previous-session sets for adoption alongside the baseline', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      renderCard(true, { mode: 'live' });
      expect(mockCapturePreviousSessionSets).toHaveBeenCalledWith(
        'ex-1',
        STATS_WITH_HISTORY.data.recentSessions[0].sets,
      );
    });

    it('captures an empty history so no-history exercises still mark captured', () => {
      mockUseExerciseStats.mockReturnValue({ data: { bestSet: null, lastSet: null } });
      renderCard(true, { mode: 'live' });
      expect(mockCapturePreviousSessionSets).toHaveBeenCalledWith('ex-1', []);
    });
  });

  describe('assumed placeholders', () => {
    const STATS_WITH_HISTORY = {
      data: {
        bestSet: null,
        lastSet: null,
        recentSessions: [
          {
            entryDate: '2026-01-05',
            sets: [
              { setNumber: 1, setType: null, weight: 100, reps: 8 },
              { setNumber: 2, setType: null, weight: 95, reps: 6 },
            ],
          },
        ],
      },
    };
    /** Bench Press with three EMPTY sets (ids 101–103), like a Hevy-style live start. */
    const emptySets = () => {
      const base = makeExercise();
      return makeExercise({
        sets: [
          { ...base.sets[0], weight: null, reps: null },
          { ...base.sets[0], id: 102, set_number: 2, weight: null, reps: null },
          { ...base.sets[0], id: 103, set_number: 3, weight: null, reps: null },
        ],
      });
    };
    const assumedOf = (utils: ReturnType<typeof renderCard>, id: number) =>
      utils.getByTestId(`set-row-${id}`).props.assumed;

    it('resolves each live row from history, cascading past its end', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const utils = renderCard(true, { mode: 'live', exercise: emptySets() });
      expect(assumedOf(utils, 101)).toBe('100x8');
      expect(assumedOf(utils, 102)).toBe('95x6');
      // Beyond history: the row above's resolved placeholder.
      expect(assumedOf(utils, 103)).toBe('95x6');
    });

    it('passes no assumed values outside live mode', () => {
      mockUseExerciseStats.mockReturnValue(STATS_WITH_HISTORY);
      const view = renderCard(true, { mode: 'view', exercise: emptySets() });
      expect(assumedOf(view, 101)).toBe('none');

      const edit = renderCard(true, { mode: 'edit', exercise: emptySets() });
      expect(assumedOf(edit, 101)).toBe('none');
    });
  });

  describe('per-set note expand (live/edit)', () => {
    it('renders the detail panel under the matching expandedSetKey', () => {
      const { getByTestId } = renderCard(true, { mode: 'live', expandedSetKey: '101' });
      expect(getByTestId('set-detail-101')).toBeTruthy();
    });

    it('renders the detail panel in edit mode', () => {
      const { getByTestId } = renderCard(true, { mode: 'edit', expandedSetKey: '101' });
      expect(getByTestId('set-detail-101')).toBeTruthy();
    });

    it('renders no detail panel when expandedSetKey matches no row', () => {
      const { queryByTestId } = renderCard(true, { mode: 'live', expandedSetKey: null });
      expect(queryByTestId('set-detail-101')).toBeNull();
    });

    it('keeps the note panel open under a churned set via its render key', () => {
      // expandedSetKey holds the birth key "-1"; after churn the set's id is 101
      // but its render key is still "-1", so the panel stays attached.
      const { getByTestId } = renderCard(true, {
        mode: 'live',
        expandedSetKey: '-1',
        setRenderKeys: { '101': '-1' },
      });
      expect(getByTestId('set-detail-101')).toBeTruthy();
    });

    it('does not render the expand in view mode', () => {
      const { queryByTestId } = renderCard(true, { mode: 'view', expandedSetKey: '101' });
      expect(queryByTestId('set-detail-101')).toBeNull();
    });
  });

  describe('per-exercise note (live/edit)', () => {
    it('shows the note field when the exercise already has a note', () => {
      const { getByLabelText } = renderCard(true, {
        mode: 'live',
        exercise: makeExercise({ notes: 'go slow' }),
      });
      expect(getByLabelText('Notes for Bench Press').props.value).toBe('go slow');
    });

    it('shows the note field when the editor is opened even with no note', () => {
      const { getByLabelText } = renderCard(true, { mode: 'live', noteEditorOpen: true });
      expect(getByLabelText('Notes for Bench Press')).toBeTruthy();
    });

    it('hides the note field when empty and the editor is closed', () => {
      const { queryByLabelText } = renderCard(true, { mode: 'live' });
      expect(queryByLabelText('Notes for Bench Press')).toBeNull();
    });

    it('shows the editable field for an edit draft with a note', () => {
      const { getByLabelText } = renderCard(true, {
        mode: 'edit',
        exercise: makeExercise({ notes: 'go slow' }),
      });
      expect(getByLabelText('Notes for Bench Press').props.value).toBe('go slow');
    });

    it('stays hidden without a commit handler (the preset form)', () => {
      const { queryByLabelText } = renderCard(true, {
        mode: 'edit',
        onCommitExerciseNote: undefined,
        exercise: makeExercise({ notes: 'go slow' }),
      });
      expect(queryByLabelText('Notes for Bench Press')).toBeNull();
    });
  });

  describe('notes in view mode', () => {
    it('renders a saved exercise note as plain text, not an input', () => {
      const { getByLabelText } = renderCard(true, {
        mode: 'view',
        exercise: makeExercise({ notes: 'go slow' }),
      });
      const note = getByLabelText('Notes for Bench Press');
      expect(note.props.children).toBe('go slow');
      expect(note.props.value).toBeUndefined();
    });

    it('renders a saved set note as plain text', () => {
      const base = makeExercise();
      const exercise = { ...base, sets: [{ ...base.sets[0], notes: 'slow tempo' }] };
      const { getByLabelText } = renderCard(true, { mode: 'view', exercise });
      expect(getByLabelText('Notes for set 1').props.children).toBe('slow tempo');
    });

    it('renders nothing when the notes are empty', () => {
      const { queryByLabelText } = renderCard(true, { mode: 'view' });
      expect(queryByLabelText('Notes for Bench Press')).toBeNull();
      expect(queryByLabelText('Notes for set 1')).toBeNull();
    });
  });
});
