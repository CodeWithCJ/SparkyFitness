import React from 'react';

// The global gesture-handler mock swallows every handler it is given, so the
// pan's `onEnd` cannot be reached through it. Capture it: it decides when a
// swipe turns the page, which is logic rather than device behaviour.
const capturedPan: {
  onEnd?: (event: { translationX: number; velocityX: number }) => void;
} = {};
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const makePan = () => {
    const gesture = {
      activeOffsetX: () => gesture,
      failOffsetY: () => gesture,
      runOnJS: () => gesture,
      onEnd: (fn: (event: unknown) => void) => {
        capturedPan.onEnd = fn as typeof capturedPan.onEnd;
        return gesture;
      },
    };
    return gesture;
  };
  return {
    Gesture: { Pan: makePan },
    GestureDetector: ({ children }: { children: unknown }) => children,
    GestureHandlerRootView: View,
  };
});
import { ScrollView, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import type { FocusHold } from '../../src/hooks/useFocusHold';
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
const mockUseLiveHeartRate = jest.fn(
  (_entryId: string | null): number | null => null
);
jest.mock('../../src/stores/liveHeartRateStore', () => ({
  useLiveHeartRate: (entryId: string | null) => mockUseLiveHeartRate(entryId),
}));
const mockUseHeartRateZoneColor = jest.fn(
  (_bpm: number | null): string | null => null
);
jest.mock('../../src/hooks/useHeartRateZoneColor', () => ({
  useHeartRateZoneColor: (bpm: number | null) => mockUseHeartRateZoneColor(bpm),
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
jest.mock('../../src/components/FocusPlateStrip', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ targetWeight, onOpenCalculator }: any) => (
      <Text testID="plate-graphic" onPress={onOpenCalculator}>
        {`plates:${targetWeight}`}
      </Text>
    ),
  };
});
jest.mock('../../src/components/ActiveWorkoutFocusSets', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: function FocusSetsMock({ exercise, previousSets }: any) {
      // The real card / rest card attach this ref; fake a measured position.
      const { useContext } = require('react');
      const {
        FocusScrollTargetContext,
      } = require('../../src/components/focusScrollTarget');
      const targets = useContext(FocusScrollTargetContext);
      if (targets) {
        // Header at 250, the card at 300 and 200 tall.
        targets.card.current = {
          measureLayout: (
            _rel: unknown,
            ok: (x: number, y: number, w: number, h: number) => void
          ) => ok(0, 300, 390, 200),
        } as never;
        targets.header.current = {
          measureLayout: (_rel: unknown, ok: (x: number, y: number) => void) =>
            ok(0, 250),
        } as never;
      }
      return (
        <>
          <Text testID="focus-sets">{`sets:${exercise.id}`}</Text>
          <Text testID="focus-previous-sets">
            {JSON.stringify(previousSets?.map((p: any) => p?.weight ?? null))}
          </Text>
        </>
      );
    },
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
  onDismissKeyboard: jest.fn(),
  onPressMetricHeader: jest.fn(),
  onPressSetType: jest.fn(),
  onToggleSetDetail: jest.fn(),
  onCommitExerciseNote: jest.fn(),
  onOpenPlateCalculator: jest.fn(),
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
      hold={IDLE_HOLD}
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

const IDLE_HOLD: FocusHold = {
  phase: 'idle',
  setId: null,
  entryId: null,
  targetSec: null,
  getReadyEndsAt: null,
  startedAt: null,
  start: jest.fn(),
  tap: jest.fn(),
};

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

  it('names the planned hold length once in the hold page subtitle', () => {
    render(
      viewElement('a', {
        hold: {
          ...IDLE_HOLD,
          phase: 'running',
          entryId: 'a',
          setId: 'a-0',
          targetSec: 13,
          startedAt: Date.now(),
        },
      })
    );
    expect(screen.getByText(/Set 1\/2 · 13s$/)).toBeTruthy();
    expect(screen.queryByText(/13s · 13s/)).toBeNull();
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

  it('pages through the numbered chips', () => {
    render(viewElement('a'));
    expect(shownName()).toBe('Bench Press');
    fireEvent.press(screen.getByLabelText(/^Exercise 2 of 3/));
    expect(shownName()).toBe('Squat');
    fireEvent.press(screen.getByLabelText(/^Exercise 3 of 3/));
    expect(shownName()).toBe('Deadlift');
    fireEvent.press(screen.getByLabelText(/^Exercise 2 of 3/));
    expect(shownName()).toBe('Squat');
  });

  it('reports the exercise on show for the header pill', () => {
    const onSelectedIndexChange = jest.fn();
    render(viewElement('a', { onSelectedIndexChange }));
    expect(onSelectedIndexChange).toHaveBeenLastCalledWith(0);
    fireEvent.press(screen.getByLabelText(/^Exercise 3 of 3/));
    expect(onSelectedIndexChange).toHaveBeenLastCalledWith(2);
  });

  it('pages with the swipe gesture: left for next, right for previous, none for a short drag', () => {
    render(viewElement('b'));
    act(() => capturedPan.onEnd?.({ translationX: -120, velocityX: 0 }));
    expect(shownName()).toBe('Deadlift');
    act(() => capturedPan.onEnd?.({ translationX: 10, velocityX: 0 }));
    expect(shownName()).toBe('Deadlift');
    act(() => capturedPan.onEnd?.({ translationX: 120, velocityX: 0 }));
    expect(shownName()).toBe('Squat');
    act(() => capturedPan.onEnd?.({ translationX: 120, velocityX: 0 }));
    expect(shownName()).toBe('Bench Press');
    // Already first: another right swipe stays put.
    act(() => capturedPan.onEnd?.({ translationX: 120, velocityX: 0 }));
    expect(shownName()).toBe('Bench Press');
  });

  it('hides the keyboard and clears the focused set on every page change', () => {
    render(viewElement('a'));
    expect(handlers.onDismissKeyboard).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText(/^Exercise 2 of 3/));
    expect(handlers.onDismissKeyboard).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('focus-chip-c'));
    expect(handlers.onDismissKeyboard).toHaveBeenCalledTimes(2);
    act(() => capturedPan.onEnd?.({ translationX: 120, velocityX: 0 }));
    expect(handlers.onDismissKeyboard).toHaveBeenCalledTimes(3);
  });

  it('shows a requested exercise at once, even within the manual-move grace', () => {
    const { rerender } = render(viewElement('a'));
    fireEvent.press(screen.getByTestId('focus-chip-c'));
    expect(shownName()).toBe('Deadlift');

    rerender(viewElement('a', { showRequest: { id: 'b', seq: 1 } }));
    expect(shownName()).toBe('Squat');

    // The same request again (same seq) does not pull the lifter back.
    fireEvent.press(screen.getByTestId('focus-chip-c'));
    rerender(viewElement('a', { showRequest: { id: 'b', seq: 1 } }));
    expect(shownName()).toBe('Deadlift');

    // A new request does, and it ends the grace so following works again.
    rerender(viewElement('a', { showRequest: { id: 'b', seq: 2 } }));
    expect(shownName()).toBe('Squat');
    rerender(viewElement('c', { showRequest: { id: 'b', seq: 2 } }));
    expect(shownName()).toBe('Deadlift');
  });

  it('ignores a request for an exercise that is gone', () => {
    const { rerender } = render(viewElement('b'));
    rerender(viewElement('b', { showRequest: { id: 'zzz', seq: 1 } }));
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
      fireEvent.press(screen.getByLabelText(/^Exercise 2 of 3/));
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

    describe('live heart rate', () => {
      afterEach(() => {
        mockUseLiveHeartRate.mockReset().mockReturnValue(null);
        mockUseHeartRateZoneColor.mockReset().mockReturnValue(null);
      });

      it('shows no chip without a live reading', () => {
        render(viewElement('a'));
        expect(screen.queryByTestId('exercise-heart-rate')).toBeNull();
      });

      it("shows the watch's live reading for the exercise being viewed", () => {
        mockUseLiveHeartRate.mockImplementation((id) =>
          id === 'b' ? 141 : null
        );
        const { rerender } = render(viewElement('a'));
        expect(screen.queryByText('141 bpm')).toBeNull();

        rerender(viewElement('b'));
        expect(screen.getByText('141 bpm')).toBeTruthy();
        expect(
          screen.getByLabelText('Current heart rate for Squat')
        ).toBeTruthy();
      });

      it('colors the number by the heart rate zone', () => {
        mockUseLiveHeartRate.mockReturnValue(160);
        mockUseHeartRateZoneColor.mockImplementation((bpm) =>
          bpm === 160 ? '#f59e0b' : null
        );
        render(viewElement('a'));
        expect(
          StyleSheet.flatten(screen.getByText('160').props.style).color
        ).toBe('#f59e0b');
      });

      it('keeps the default heart-rate color until zones are known', () => {
        mockUseLiveHeartRate.mockReturnValue(160);
        render(viewElement('a'));
        expect(
          StyleSheet.flatten(screen.getByText('160').props.style)?.color
        ).toBeUndefined();
      });

      it('shows the chip on a one-set cardio exercise, which has no rest chip', () => {
        mockUseLiveHeartRate.mockReturnValue(130);
        const cardio = makeExercise('d', 'Running', {
          exercise_snapshot: {
            name: 'Running',
            modality: 'duration_distance',
            images: [],
          },
          sets: [
            {
              id: 'd-0',
              set_number: 1,
              set_type: 'normal',
              weight: null,
              reps: null,
            },
          ],
        });
        render(viewElement('d', {}, { exercises: [cardio] }));
        expect(screen.getByText('130 bpm')).toBeTruthy();
        expect(screen.queryByLabelText(/^Rest /)).toBeNull();
      });
    });

    it('hides the rest chip for a one-set cardio exercise, which logs in a form', () => {
      const cardio = makeExercise('d', 'Running', {
        exercise_snapshot: {
          name: 'Running',
          modality: 'duration_distance',
          images: [],
        },
        sets: [
          {
            id: 'd-0',
            set_number: 1,
            set_type: 'normal',
            weight: null,
            reps: null,
          },
        ],
      });
      render(viewElement('d', {}, { exercises: [cardio] }));
      expect(screen.queryByLabelText(/^Rest /)).toBeNull();
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

    it('opens the plate calculator for the active set from the plate strip', () => {
      const onOpenPlateCalculator = jest.fn();
      const withWeight = makeExercise('a', 'Bench Press');
      withWeight.sets[0].weight = 100;
      render(
        viewElement(
          'a',
          { onOpenPlateCalculator, activeSetId: 'a-1' },
          { exercises: [withWeight] }
        )
      );
      fireEvent.press(screen.getByTestId('plate-graphic'));
      expect(onOpenPlateCalculator).toHaveBeenCalledWith('a-1');
    });

    it('draws no plates for a non-barbell exercise', () => {
      const dumbbell = makeExercise('a', 'Curl');
      dumbbell.exercise_snapshot.equipment = ['dumbbell'];
      dumbbell.sets[0].weight = 20;
      render(viewElement('a', {}, { exercises: [dumbbell] }));
      expect(screen.queryByTestId('plate-graphic')).toBeNull();
    });
  });

  it('puts the plan under the name when there are no pictures, and Swap and the menu beside the name when there are', () => {
    const { rerender } = render(viewElement('a'));
    // No pictures: the preview stays collapsed and the title block stands alone.
    expect(screen.getAllByLabelText('Swap Bench Press').length).toBeGreaterThan(
      0
    );
    const withPicture = makeExercise('a', 'Bench Press');
    withPicture.exercise_snapshot.images = ['a.jpg'];
    rerender(
      viewElement(
        'a',
        { getImageSource: () => ({ uri: 'https://img/a.jpg' }) },
        { exercises: [withPicture] }
      )
    );
    expect(screen.getAllByLabelText('Swap Bench Press').length).toBeGreaterThan(
      0
    );
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
    expect(screen.getByText('Plan 2 × 12')).toBeTruthy();
    expect(screen.getByText('Last time 40×7, 35×9')).toBeTruthy();
  });

  it("passes last session's sets to the set editor, warm-ups paired with warm-ups", () => {
    mockUseExerciseStats.mockReturnValue({
      data: {
        bestSet: null,
        recentSessions: [
          {
            sets: [
              { setNumber: 1, setType: 'warmup', weight: 20, reps: 10 },
              { setNumber: 2, setType: 'normal', weight: 40, reps: 7 },
            ],
          },
        ],
      },
    });
    render(viewElement('a'));
    // Two working sets today, one working set last time.
    expect(screen.getByTestId('focus-previous-sets').props.children).toBe(
      '[40,null]'
    );
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
    expect(screen.getByText('Last time 42.5×5')).toBeTruthy();

    try {
      await act(async () => {
        await i18n.changeLanguage('pl');
      });
      expect(screen.getByText(/42,5×5/)).toBeTruthy();
    } finally {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    }
  });

  it('omits the context lines without a plan or history', () => {
    render(viewElement('a'));
    expect(screen.queryByText(/^Plan /)).toBeNull();
    expect(screen.queryByText(/^Last time /)).toBeNull();
  });

  it('keeps every exercise history tracked, not just the shown one', () => {
    render(viewElement('a'));
    const ids = mockUseExerciseStats.mock.calls.map((call) => call[0]);
    expect(new Set(ids)).toEqual(new Set(['x-a', 'x-b', 'x-c']));
  });
  describe('focusing the current set once an exercise has started', () => {
    // Pictures so the demo is a real choice; makeExercise has none.
    const withPictures = (id: string, name: string) =>
      makeExercise(id, name, {
        exercise_snapshot: {
          name,
          images: ['p.jpg'],
          primary_muscles: [],
          equipment: [],
        },
      });
    const picSession = {
      exercises: [withPictures('a', 'Bench Press'), withPictures('b', 'Squat')],
    } as any;
    // The scroll view mock fills this ref on mount with its own instance.
    const scrollRef: { current: any } = { current: null };
    const scrollTo = () => scrollRef.current.scrollTo as jest.Mock;
    const startedProps = {
      completedSetIds: { 'a-0': 1 },
      activeSetId: 'a-1',
      scrollRef,
      // The footer covers the bottom 100 pt of the scroll view.
      scrollContentStyle: { paddingBottom: 100 },
    };
    const layoutScrollView = (height: number) =>
      fireEvent(
        screen
          .UNSAFE_getAllByType(ScrollView)
          .find((node) => !node.props.horizontal)!,
        'layout',
        {
          nativeEvent: { layout: { x: 0, y: 0, width: 390, height } },
        }
      );
    let rafSpy: jest.SpyInstance;
    const mediaState = () => screen.getByTestId('media-state').props.children;

    beforeEach(() => {
      rafSpy = jest
        .spyOn(global, 'requestAnimationFrame')
        .mockImplementation((cb) => {
          cb(0);
          return 0;
        });
      useAppPreferencesStore.getState().setFocusMediaDefault('expanded');
    });
    afterEach(() => rafSpy.mockRestore());

    it('keeps the demo per the preference before any set is logged', () => {
      render(viewElement('a', { activeSetId: 'a-0', scrollRef }, picSession));
      expect(mediaState()).toBe('expanded');
      // No vertical scroll (the chip strip may centre itself horizontally).
      expect(
        scrollTo().mock.calls.filter(([arg]) => arg.y !== undefined)
      ).toEqual([]);
    });

    it('minimizes the demo and scrolls to the current set once the first set is logged', () => {
      const { rerender } = render(
        viewElement('a', { activeSetId: 'a-0', scrollRef }, picSession)
      );
      layoutScrollView(700);
      rerender(viewElement('a', startedProps, picSession));
      expect(mediaState()).toBe('minimized');
      // The whole card fits above the footer: the header stays where it is.
      expect(scrollTo()).toHaveBeenLastCalledWith({ y: 0, animated: true });
      // The stored preference is untouched.
      expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
        'expanded'
      );
    });

    it.each([
      // Scrolls just enough for the card to clear the footer, header in view.
      [400, 208],
      // The header would be lost: scroll to the card top instead.
      [300, 292],
    ])(
      'scrolls only as far as the card needs (viewport %d)',
      (height, expected) => {
        const { rerender } = render(
          viewElement('a', { activeSetId: 'a-0', scrollRef }, picSession)
        );
        layoutScrollView(height);
        rerender(viewElement('a', startedProps, picSession));
        expect(scrollTo()).toHaveBeenLastCalledWith({
          y: expected,
          animated: true,
        });
      }
    );

    it('scrolls past the title block rather than stopping part-way down it', () => {
      const { rerender } = render(
        viewElement('a', { activeSetId: 'a-0', scrollRef }, picSession)
      );
      layoutScrollView(400);
      fireEvent(screen.getByTestId('focus-title-block'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 220 } },
      });
      rerender(viewElement('a', startedProps, picSession));
      // 208 would cut the title; on to the table header at 250 - 8.
      expect(scrollTo()).toHaveBeenLastCalledWith({ y: 242, animated: true });
    });

    it('lets a hand enlarge stand on a started exercise until it is left, without saving it', () => {
      render(viewElement('a', startedProps, picSession));
      layoutScrollView(700);
      expect(mediaState()).toBe('minimized');
      fireEvent.press(screen.getByTestId('media-toggle'));
      expect(mediaState()).toBe('expanded');
      expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
        'expanded'
      );
      fireEvent.press(screen.getByTestId('media-toggle'));
      expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
        'expanded'
      );
      fireEvent.press(screen.getByTestId('media-toggle'));
      expect(mediaState()).toBe('expanded');

      // Away to a not-started exercise: the preference applies again.
      fireEvent.press(screen.getByLabelText(/^Exercise 2 of 2/));
      expect(mediaState()).toBe('expanded');
      // Back on the started one: minimized again, scrolled to the set.
      scrollTo().mockClear();
      fireEvent.press(screen.getByLabelText(/^Exercise 1 of 2/));
      expect(mediaState()).toBe('minimized');
      expect(scrollTo()).toHaveBeenCalledWith({ y: 0, animated: true });
    });

    it('still toggles the demo by hand before the exercise has started', () => {
      render(viewElement('a', { activeSetId: 'a-0', scrollRef }, picSession));
      fireEvent.press(screen.getByTestId('media-toggle'));
      expect(mediaState()).toBe('minimized');
      fireEvent.press(screen.getByTestId('media-toggle'));
      expect(mediaState()).toBe('expanded');
    });

    it('leaves an exercise without pictures alone', () => {
      // No pictures: nothing to minimize, and the stored preference is kept.
      render(viewElement('a', { ...startedProps }));
      expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
        'expanded'
      );
    });
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
  const set = (over: Record<string, unknown>) =>
    ({ setNumber: 1, setType: 'normal', ...over }) as never;

  it('keeps 1.25 kg plate steps exact and lb values free of noise', () => {
    const sets = [set({ weight: 61.25, reps: 5 })];
    expect(formatLastTimeSets(sets, 'kg', 'weight_reps')).toEqual(['61.25×5']);
    // 46.49 kg is 102.5 lb once restored to the stored precision.
    expect(
      formatLastTimeSets(
        [set({ weight: 46.49, reps: 5 })],
        'lbs',
        'weight_reps'
      )
    ).toEqual(['102.5×5']);
  });

  it('lists working sets in the display unit', () => {
    expect(
      formatLastTimeSets(
        [
          set({ setType: 'warmup', weight: 20, reps: 10 }),
          set({ weight: 40, reps: 7 }),
          set({ weight: null, reps: 12 }),
        ],
        'kg',
        'weight_reps'
      )
    ).toEqual(['40×7', '12']);
    expect(formatLastTimeSets(undefined, 'kg', 'weight_reps')).toEqual([]);
  });

  it('shows a plain hold as its duration', () => {
    expect(
      formatLastTimeSets(
        [set({ duration: 45 }), set({ duration: 90 })],
        'kg',
        'duration'
      )
    ).toEqual(['45s', '1:30']);
  });

  it('shows a weighted hold as load and duration', () => {
    expect(
      formatLastTimeSets(
        [set({ weight: 20, duration: 45 }), set({ weight: 20 })],
        'kg',
        'weight_duration'
      )
    ).toEqual(['20×45s', '20']);
    expect(
      formatLastTimeSets(
        [set({ weight: 20, duration: 45 })],
        'lbs',
        'weight_duration'
      )
    ).toEqual(['44.1×45s']);
  });

  it('shows cardio as duration and distance in the distance unit', () => {
    const sets = [set({ duration: 1800, distance: 5 })];
    expect(formatLastTimeSets(sets, 'kg', 'duration_distance', 'km')).toEqual([
      '30:00 · 5 km',
    ]);
    expect(
      formatLastTimeSets(sets, 'kg', 'duration_distance', 'miles')
    ).toEqual(['30:00 · 3.11 mi']);
    expect(
      formatLastTimeSets([set({ distance: 5 })], 'kg', 'duration_distance')
    ).toEqual(['5 km']);
  });

  it('shows a carry as load and distance in metres or yards', () => {
    const sets = [set({ weight: 40, distance: 0.05 })];
    expect(formatLastTimeSets(sets, 'kg', 'weight_distance', 'km')).toEqual([
      '40×50 m',
    ]);
    expect(formatLastTimeSets(sets, 'kg', 'weight_distance', 'miles')).toEqual([
      '40×54.7 yd',
    ]);
    expect(
      formatLastTimeSets([set({ distance: 0.05 })], 'kg', 'weight_distance')
    ).toEqual(['50 m']);
  });

  it('drops sets with nothing to show and caps the list at five', () => {
    expect(
      formatLastTimeSets(
        [set({}), set({ weight: null, reps: null })],
        'kg',
        'duration'
      )
    ).toEqual([]);
    expect(
      formatLastTimeSets(
        Array.from({ length: 7 }, (_, i) => set({ reps: i + 1 })),
        'kg',
        'weight_reps'
      )
    ).toEqual(['1', '2', '3', '4', '5']);
  });
});
