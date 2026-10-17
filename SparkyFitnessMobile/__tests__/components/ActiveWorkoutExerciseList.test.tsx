import React from 'react';
import { render } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutExerciseList from '../../src/components/ActiveWorkoutExerciseList';
import type { SetInputField } from '../../src/components/SetRowChrome';

// Memoized like the real card. It counts its renders per exercise and puts
// the focus props it received on its view.
const mockCardRenders: Record<string, number> = {};

jest.mock('../../src/components/ActiveWorkoutExerciseCard', () => {
  const React = require('react');
  const { View } = require('react-native');
  function Card(props: {
    exercise: { id: string };
    focusedSetKey?: string | null;
    activeField?: string;
  }) {
    const id = props.exercise.id;
    React.useEffect(() => {
      mockCardRenders[id] = (mockCardRenders[id] ?? 0) + 1;
    });
    return (
      <View
        testID={`card-${id}`}
        focusedSetKey={props.focusedSetKey}
        activeField={props.activeField}
      />
    );
  }
  return { __esModule: true, default: React.memo(Card) };
});

type ListProps = React.ComponentProps<typeof ActiveWorkoutExerciseList>;
type SessionExercise = PresetSessionResponse['exercises'][number];

function makeExercise(id: string, setIds: number[]): SessionExercise {
  return {
    id,
    exercise_id: `x-${id}`,
    sets: setIds.map((setId, index) => ({
      id: setId,
      set_number: index + 1,
      set_type: 'normal',
      reps: 10,
      weight: 60,
    })),
  } as unknown as SessionExercise;
}

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    exercises: [
      makeExercise('ex-a', [101, 102]),
      makeExercise('ex-b', [201]),
      makeExercise('ex-c', [301]),
    ],
  } as unknown as PresetSessionResponse;
}

function baseProps(): ListProps {
  return {
    session: makeSession(),
    userExpandedIds: new Set<string>(),
    autoExpandedId: 'ex-a',
    supersetBorders: new Map(),
    completedSetIds: {},
    prSetIds: {},
    sessionId: 'session-1',
    verifiedSourcePresetId: undefined,
    historyScopeSettled: true,
    activeSetId: '101',
    focusedSetKey: null,
    setRenderKeys: {},
    focusedField: 'weight',
    metricColumn: 'rpe',
    weightUnit: 'kg',
    distanceUnit: 'km',
    expandedSetKey: null,
    noteEditorEntryId: null,
    cardOffsetsRef: { current: {} },
    getImageSource: jest.fn(() => null),
    onPressThumb: jest.fn(),
    onToggleExpanded: jest.fn(),
    onPressRestChip: jest.fn(),
    onPressMetricHeader: jest.fn(),
    onPressOverflow: jest.fn(),
    onCompleteSet: jest.fn(),
    onUncomplete: jest.fn(),
    onCommitField: jest.fn(),
    onDeleteSet: jest.fn(),
    onPressSetType: jest.fn(),
    onToggleSetDetail: jest.fn(),
    onAddSet: jest.fn(),
    onCommitExerciseNote: jest.fn(),
    onActivateSet: jest.fn(),
    onActivateRpe: jest.fn(),
    onRegisterAccessoryHandle: jest.fn(),
  };
}

function resetCounts() {
  for (const key of Object.keys(mockCardRenders)) delete mockCardRenders[key];
}

function focusProps(
  getByTestId: (id: string) => { props: Record<string, unknown> },
  entryId: string
) {
  const { focusedSetKey, activeField } = getByTestId(`card-${entryId}`).props;
  return { focusedSetKey, activeField };
}

describe('ActiveWorkoutExerciseList focus scoping', () => {
  beforeEach(() => {
    resetCounts();
  });

  it('hands the focus props only to the card holding the focused set', () => {
    const { getByTestId } = render(
      <ActiveWorkoutExerciseList
        {...baseProps()}
        focusedSetKey="201"
        focusedField="reps"
      />
    );

    expect(focusProps(getByTestId, 'ex-b')).toEqual({
      focusedSetKey: '201',
      activeField: 'reps',
    });
    expect(focusProps(getByTestId, 'ex-a')).toEqual({
      focusedSetKey: null,
      activeField: undefined,
    });
    expect(focusProps(getByTestId, 'ex-c')).toEqual({
      focusedSetKey: null,
      activeField: undefined,
    });
  });

  it("finds the focused card through a churned set's render key", () => {
    // Set 301 was born as -5 and kept that render key across the save.
    const { getByTestId } = render(
      <ActiveWorkoutExerciseList
        {...baseProps()}
        setRenderKeys={{ '301': '-5' }}
        focusedSetKey="-5"
        focusedField="weight"
      />
    );

    expect(focusProps(getByTestId, 'ex-c')).toEqual({
      focusedSetKey: '-5',
      activeField: 'weight',
    });
    expect(focusProps(getByTestId, 'ex-a').focusedSetKey).toBeNull();
    expect(focusProps(getByTestId, 'ex-b').focusedSetKey).toBeNull();
  });

  it('re-renders only the cards that held or took focus as it moves', () => {
    const props = baseProps();
    const { rerender } = render(
      <ActiveWorkoutExerciseList
        {...props}
        focusedSetKey="101"
        focusedField="weight"
      />
    );
    resetCounts();

    // Weight → reps inside Bench Press: only its card re-renders.
    const focus = (setKey: string | null, field: SetInputField) =>
      rerender(
        <ActiveWorkoutExerciseList
          {...props}
          focusedSetKey={setKey}
          focusedField={field}
        />
      );
    focus('101', 'reps');
    expect(mockCardRenders).toEqual({ 'ex-a': 1 });

    // Into Squat: the card losing focus and the card taking it, not Deadlift.
    resetCounts();
    focus('201', 'weight');
    expect(mockCardRenders).toEqual({ 'ex-a': 1, 'ex-b': 1 });

    // Keyboard dismissed: only the card that held focus lets go.
    resetCounts();
    focus(null, 'weight');
    expect(mockCardRenders).toEqual({ 'ex-b': 1 });
  });
});
