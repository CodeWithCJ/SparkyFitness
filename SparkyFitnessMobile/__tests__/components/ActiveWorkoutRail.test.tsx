import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import type { ExerciseEntryResponse } from '@workspace/shared';
import ActiveWorkoutRail, { type SupersetBorder } from '../../src/components/ActiveWorkoutRail';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/SafeImage', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="safe-image" />,
  };
});

function makeExercise(id: string, name: string): ExerciseEntryResponse {
  return {
    id,
    exercise_id: `def-${id}`,
    duration_minutes: 20,
    calories_burned: 150,
    entry_date: '2026-03-20',
    notes: null,
    distance: null,
    avg_heart_rate: null,
    source: null,
    superset_group: null,
    exercise_snapshot: {
      id: `def-${id}`,
      name,
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
        id: 1,
        set_number: 1,
        set_type: 'normal',
        reps: 10,
        weight: 60,
        duration: null,
        rest_time: 90,
        notes: null,
        rpe: null,
      },
    ],
  };
}

describe('ActiveWorkoutRail superset borders', () => {
  const exercises = [
    makeExercise('ex-a', 'Bench Press'),
    makeExercise('ex-b', 'Squat'),
    makeExercise('ex-c', 'Row'),
  ];
  const supersetBorders = new Map<string, SupersetBorder>([
    ['ex-a', { color: '#3366ff', isLast: false }],
    ['ex-b', { color: '#3366ff', isLast: true }],
  ]);

  function renderRail() {
    return render(
      <ActiveWorkoutRail
        exercises={exercises}
        completedSetIds={{}}
        focusedEntryId={null}
        supersetBorders={supersetBorders}
        getImageSource={() => null}
        onPressExercise={jest.fn()}
        onPressAdd={jest.fn()}
      />,
    );
  }

  it('draws a bottom bar in the group color under each grouped thumb', () => {
    const { getByTestId } = renderRail();
    for (const entryId of ['ex-a', 'ex-b']) {
      const bar = StyleSheet.flatten(getByTestId(`superset-bar-${entryId}`).props.style);
      expect(bar.backgroundColor).toBe('#3366ff');
      expect(bar.height).toBe(3);
    }
  });

  it('extends non-last bars across the item gap so the group reads as one line', () => {
    const { getByTestId } = renderRail();
    const interior = StyleSheet.flatten(getByTestId('superset-bar-ex-a').props.style);
    const last = StyleSheet.flatten(getByTestId('superset-bar-ex-b').props.style);
    expect(interior.right).toBeLessThan(0); // bridges into the gap
    expect(last.right).toBeGreaterThan(0); // stops inside its own thumb
  });

  it('draws no bar for ungrouped exercises', () => {
    const { queryByTestId } = renderRail();
    expect(queryByTestId('superset-bar-ex-c')).toBeNull();
  });
});
