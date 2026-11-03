import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import ActiveWorkoutFocusView from '../../src/components/ActiveWorkoutFocusView';
import { useExerciseStats } from '../../src/hooks/useExerciseStats';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import {
  FOCUS_FOLLOW_GRACE_MS,
  formatLastTimeSets,
  shouldFollowActive,
  summarizePlan,
  swipePageDelta,
} from '../../src/utils/focusView';

jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});
jest.mock('../../src/components/ActiveWorkoutFocusMedia', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({
      expanded,
      exerciseName,
      onToggleExpanded,
      onBackToCurrent,
      children,
    }: any) => (
      <View testID="focus-media">
        {onBackToCurrent && (
          <Pressable onPress={onBackToCurrent}>
            <Text>Back to current</Text>
          </Pressable>
        )}
        <Text testID="media-state">{expanded ? 'expanded' : 'minimized'}</Text>
        <Text testID="media-name">{exerciseName}</Text>
        <Pressable testID="media-toggle" onPress={onToggleExpanded} />
        {!expanded && children}
      </View>
    ),
  };
});
jest.mock('../../src/components/PlateBarGraphic', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ targetWeight }: any) => (
      <Text testID="plate-graphic">{`plates:${targetWeight}`}</Text>
    ),
  };
});
jest.mock('../../src/components/ActiveWorkoutFocusSets', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ exercise }: any) => (
      <Text testID="focus-sets">{`sets:${exercise.id}`}</Text>
    ),
  };
});

const mockUseExerciseStats = useExerciseStats as jest.Mock;

function makeExercise(id: string, name: string, extra: object = {}) {
  return {
    id,
    exercise_id: `x-${id}`,
    superset_group: null,
    exercise_snapshot: {
      name,
      images: [],
      primary_muscles: ['chest'],
      equipment: ['barbell'],
    },
    sets: [
      { id: Number(`${id.length}01`), set_number: 1, set_type: 'normal' },
      { id: Number(`${id.length}02`), set_number: 2, set_type: 'normal' },
    ].map((set, i) => ({ ...set, id: `${id}-${i}`, weight: null, reps: null })),
    ...extra,
  } as any;
}

const session = {
  exercises: [
    makeExercise('a', 'Bench Press'),
    makeExercise('b', 'Squat'),
    makeExercise('c', 'Deadlift'),
  ],
} as any;

const handlers = {
  onPressOverflow: jest.fn(),
  onSwap: jest.fn(),
  onCompleteSet: jest.fn(),
  onUncomplete: jest.fn(),
  onCommitField: jest.fn(),
  onAddSet: jest.fn(),
  onActivateRpe: jest.fn(),
  onDeleteSet: jest.fn(),
  onPressRestChip: jest.fn(),
  onPressMetricHeader: jest.fn(),
  onPressSetType: jest.fn(),
  onToggleSetDetail: jest.fn(),
  onCommitExerciseNote: jest.fn(),
};

function viewElement(
  activeExerciseId: string | null,
  extra: Record<string, unknown> = {},
  sessionOverride: unknown = session
) {
  return (
    <ActiveWorkoutFocusView
      session={sessionOverride as any}
      scrollRef={{ current: null }}
      expandedSetKey={null}
      noteEditorEntryId={null}
      prSetIds={{}}
      activeExerciseId={activeExerciseId}
      supersetBorders={new Map()}
      sessionId="session-1"
      verifiedSourcePresetId={undefined}
      historyScopeSettled
      completedSetIds={{}}
      activeSetId={null}
      setRenderKeys={{}}
      metricColumn="rpe"
      weightUnit="kg"
      distanceUnit="km"
      getImageSource={() => null}
      scrollContentStyle={undefined}
      keyboardBottomOffset={0}
      {...handlers}
      {...extra}
    />
  );
}

const shownName = () => screen.getByTestId('media-name').props.children;

describe('ActiveWorkoutFocusView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    __resetAppPreferencesStoreForTests();
    mockUseExerciseStats.mockReturnValue({ data: undefined });
  });

  it('opens on the active exercise', () => {
    render(viewElement('b'));
    expect(shownName()).toBe('Squat');
    expect(screen.getByTestId('focus-sets').props.children).toBe('sets:b');
  });

  it('opens on the first exercise when nothing is active', () => {
    render(viewElement(null));
    expect(shownName()).toBe('Bench Press');
  });

  it('jumps to an exercise from its chip and labels the chips for screen readers', () => {
    render(viewElement('a'));
    expect(
      screen.getByLabelText('Exercise 3 of 3, Deadlift, not started')
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId('focus-chip-c'));
    expect(shownName()).toBe('Deadlift');
  });

  it('steps with Previous and Next, disabled at the ends', () => {
    render(viewElement('a'));
    expect(
      screen.getByLabelText('Previous').props.accessibilityState.disabled
    ).toBe(true);
    fireEvent.press(screen.getByLabelText('Next exercise, Squat'));
    expect(shownName()).toBe('Squat');
    fireEvent.press(screen.getByLabelText('Next exercise, Deadlift'));
    expect(shownName()).toBe('Deadlift');
    expect(
      screen.getByLabelText('Next').props.accessibilityState.disabled
    ).toBe(true);
    fireEvent.press(screen.getByLabelText('Previous exercise, Squat'));
    expect(shownName()).toBe('Squat');
  });

  it('follows the active set to another exercise', () => {
    const { rerender } = render(viewElement('a'));
    rerender(viewElement('b'));
    expect(shownName()).toBe('Squat');
    expect(screen.queryByText('Back to current')).toBeNull();
  });

  describe('after a manual move', () => {
    let now = 1_000_000;
    beforeEach(() => {
      now = 1_000_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
    });
    afterEach(() => jest.restoreAllMocks());

    it('stays put within the grace period and offers a way back', () => {
      const { rerender } = render(viewElement('a'));
      fireEvent.press(screen.getByTestId('focus-chip-c'));
      expect(screen.getByText('Back to current')).toBeTruthy();

      now += FOCUS_FOLLOW_GRACE_MS - 1000;
      rerender(viewElement('b'));
      expect(shownName()).toBe('Deadlift');

      fireEvent.press(screen.getByText('Back to current'));
      expect(shownName()).toBe('Squat');
      expect(screen.queryByText('Back to current')).toBeNull();
    });

    it('follows again once the grace period has passed', () => {
      const { rerender } = render(viewElement('a'));
      fireEvent.press(screen.getByTestId('focus-chip-c'));

      now += FOCUS_FOLLOW_GRACE_MS + 1;
      rerender(viewElement('b'));
      expect(shownName()).toBe('Squat');
    });
  });

  it.each([
    ['expanded', 'expanded'],
    ['minimized', 'minimized'],
  ] as const)(
    'starts the media %s per the setting and toggles it for the session',
    (preference, shown) => {
      useAppPreferencesStore.getState().setFocusMediaDefault(preference);
      render(viewElement('a'));
      expect(screen.getByTestId('media-state').props.children).toBe(shown);

      fireEvent.press(screen.getByTestId('media-toggle'));
      const flipped = shown === 'expanded' ? 'minimized' : 'expanded';
      expect(screen.getByTestId('media-state').props.children).toBe(flipped);

      // The choice survives moving to another exercise.
      fireEvent.press(screen.getByLabelText('Next exercise, Squat'));
      expect(screen.getByTestId('media-state').props.children).toBe(flipped);
    }
  );

  it('opens the exercise menu from the overflow button', () => {
    render(viewElement('b'));
    fireEvent.press(screen.getByLabelText('More options for Squat'));
    expect(handlers.onPressOverflow).toHaveBeenCalledWith('b');
  });

  it('offers Swap for the shown exercise', () => {
    render(viewElement('b'));
    fireEvent.press(screen.getByLabelText('Swap Squat'));
    expect(handlers.onSwap).toHaveBeenCalledWith('b');
  });

  it('shows the muscle and equipment chips and the best set', () => {
    mockUseExerciseStats.mockReturnValue({
      data: { bestSet: { weight: 40, reps: 8 }, recentSessions: [] },
    });
    render(viewElement('a'));
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Barbell')).toBeTruthy();
    expect(screen.getByLabelText('Best 40 × 8')).toBeTruthy();
  });

  describe('restored list-view controls', () => {
    it('shows the exercise rest and opens the rest picker from it', () => {
      render(viewElement('b'));
      fireEvent.press(screen.getByLabelText(/^Rest /));
      expect(handlers.onPressRestChip).toHaveBeenCalledWith('b', null);
    });

    it('keeps the note editor closed until the menu opens it or a note exists', () => {
      const { rerender } = render(viewElement('a'));
      expect(screen.queryByLabelText('Notes for Bench Press')).toBeNull();

      rerender(viewElement('a', { noteEditorEntryId: 'a' }));
      expect(screen.getByLabelText('Notes for Bench Press')).toBeTruthy();

      rerender(viewElement('a', { noteEditorEntryId: 'b' }));
      expect(screen.queryByLabelText('Notes for Bench Press')).toBeNull();

      rerender(
        viewElement(
          'a',
          {},
          {
            exercises: [
              makeExercise('a', 'Bench Press', { notes: 'Pause reps' }),
            ],
          }
        )
      );
      expect(screen.getByLabelText('Notes for Bench Press').props.value).toBe(
        'Pause reps'
      );
    });

    it('commits a typed exercise note on blur', () => {
      render(viewElement('a', { noteEditorEntryId: 'a' }));
      const field = screen.getByLabelText('Notes for Bench Press');
      fireEvent.changeText(field, 'Slow eccentric');
      fireEvent(field, 'blur');
      expect(handlers.onCommitExerciseNote).toHaveBeenCalledWith(
        'a',
        'Slow eccentric'
      );
    });

    it('draws the plates for a barbell exercise once a weight is set', () => {
      const withWeight = makeExercise('a', 'Bench Press');
      withWeight.sets[0].weight = 100;
      const { rerender } = render(viewElement('a'));
      expect(screen.queryByTestId('plate-graphic')).toBeNull();

      rerender(viewElement('a', {}, { exercises: [withWeight] }));
      expect(screen.getByTestId('plate-graphic').props.children).toBe(
        'plates:100'
      );
    });

    it('draws no plates for a non-barbell exercise', () => {
      const dumbbell = makeExercise('a', 'Curl');
      dumbbell.exercise_snapshot.equipment = ['dumbbell'];
      dumbbell.sets[0].weight = 20;
      render(viewElement('a', {}, { exercises: [dumbbell] }));
      expect(screen.queryByTestId('plate-graphic')).toBeNull();
    });
  });

  it('shows the plan and last time lines', () => {
    useActiveWorkoutStore.setState({
      plannedSetValues: {
        'a-0': { weight: 40, reps: 12 },
        'a-1': { weight: 40, reps: 12 },
      },
    });
    mockUseExerciseStats.mockReturnValue({
      data: {
        bestSet: null,
        recentSessions: [
          {
            sets: [
              { setNumber: 1, setType: 'normal', weight: 40, reps: 7 },
              { setNumber: 2, setType: 'normal', weight: 35, reps: 9 },
            ],
          },
        ],
      },
    });
    render(viewElement('a'));
    expect(screen.getByText('Plan: 2 × 12')).toBeTruthy();
    expect(screen.getByText('Last time: 40×7, 35×9')).toBeTruthy();
  });

  it('reformats the last-time weights when the app language changes', async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    mockUseExerciseStats.mockReturnValue({
      data: {
        bestSet: null,
        recentSessions: [
          { sets: [{ weight: 42.5, reps: 5, setType: 'normal' }] },
        ],
      },
    });
    render(viewElement('a'));
    expect(screen.getByText('Last time: 42.5×5')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    expect(screen.getByText('Last time: 42,5×5')).toBeTruthy();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('omits the context lines without a plan or history', () => {
    render(viewElement('a'));
    expect(screen.queryByText(/^Plan:/)).toBeNull();
    expect(screen.queryByText(/^Last time:/)).toBeNull();
  });

  it('keeps every exercise history tracked, not just the shown one', () => {
    render(viewElement('a'));
    const ids = mockUseExerciseStats.mock.calls.map((call) => call[0]);
    expect(new Set(ids)).toEqual(new Set(['x-a', 'x-b', 'x-c']));
  });
});

describe('swipePageDelta', () => {
  it('turns the page on a long drag or a fast flick', () => {
    expect(swipePageDelta(-80, 0)).toBe(1);
    expect(swipePageDelta(80, 0)).toBe(-1);
    expect(swipePageDelta(-30, -900)).toBe(1);
    expect(swipePageDelta(30, 900)).toBe(-1);
  });

  it('ignores short or slow drags', () => {
    expect(swipePageDelta(-40, -200)).toBe(0);
    expect(swipePageDelta(10, 2000)).toBe(0);
    expect(swipePageDelta(0, 0)).toBe(0);
  });
});

describe('shouldFollowActive', () => {
  it('follows with no manual move, or after the grace period', () => {
    expect(shouldFollowActive(null, 5)).toBe(true);
    expect(shouldFollowActive(0, FOCUS_FOLLOW_GRACE_MS)).toBe(true);
    expect(shouldFollowActive(0, FOCUS_FOLLOW_GRACE_MS - 1)).toBe(false);
  });
});

describe('summarizePlan', () => {
  const sets = [
    { id: 1, set_type: 'warmup' },
    { id: 2, set_type: 'normal' },
    { id: 3, set_type: 'normal' },
  ];
  it('counts working sets when they plan the same reps', () => {
    expect(
      summarizePlan(sets, {
        '2': { weight: 1, reps: 10 },
        '3': { weight: 1, reps: 10 },
      })
    ).toEqual({ sets: 2, reps: 10 });
  });
  it('is null when reps differ or are unplanned', () => {
    expect(
      summarizePlan(sets, {
        '2': { weight: 1, reps: 10 },
        '3': { weight: 1, reps: 8 },
      })
    ).toBeNull();
    expect(summarizePlan(sets, {})).toBeNull();
  });
});

describe('formatLastTimeSets', () => {
  it('lists working sets in the display unit', () => {
    expect(
      formatLastTimeSets(
        [
          { setNumber: 1, setType: 'warmup', weight: 20, reps: 10 },
          { setNumber: 2, setType: 'normal', weight: 40, reps: 7 },
          { setNumber: 3, setType: 'normal', weight: null, reps: 12 },
        ],
        'kg'
      )
    ).toEqual(['40×7', '12']);
    expect(formatLastTimeSets(undefined, 'kg')).toEqual([]);
  });
});
