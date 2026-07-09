import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
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
        activeEntryId={null}
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

describe('ActiveWorkoutRail focus ring vs current marker', () => {
  const exercises = [makeExercise('ex-a', 'Bench Press'), makeExercise('ex-b', 'Squat')];

  function renderRail(activeEntryId: string | null, focusedEntryId: string | null = null) {
    return render(
      <ActiveWorkoutRail
        exercises={exercises}
        completedSetIds={{}}
        focusedEntryId={focusedEntryId}
        activeEntryId={activeEntryId}
        supersetBorders={new Map()}
        getImageSource={() => null}
        onPressExercise={jest.fn()}
        onPressAdd={jest.fn()}
      />,
    );
  }

  it('rings the scroll-focused exercise, independent of the current one', () => {
    const { getByTestId } = renderRail('ex-b', 'ex-a');
    const focused = StyleSheet.flatten(getByTestId('rail-ring-ex-a').props.style);
    const other = StyleSheet.flatten(getByTestId('rail-ring-ex-b').props.style);
    expect(focused.borderColor).not.toBe('transparent');
    expect(other.borderColor).toBe('transparent');
  });

  it('marks the current (cursor) exercise with the play badge, not the focused one', () => {
    const { getByTestId, queryByTestId } = renderRail('ex-b', 'ex-a');
    expect(getByTestId('rail-current-ex-b')).toBeTruthy();
    expect(queryByTestId('rail-current-ex-a')).toBeNull();
  });

  it('shows no current marker when the workout is complete', () => {
    const { queryByTestId } = renderRail(null);
    expect(queryByTestId('rail-current-ex-a')).toBeNull();
    expect(queryByTestId('rail-current-ex-b')).toBeNull();
  });
});

describe('ActiveWorkoutRail initial focus scroll', () => {
  const exercises = [makeExercise('ex-a', 'Bench Press'), makeExercise('ex-b', 'Squat')];

  function renderRail(focusedEntryId: string | null) {
    return render(
      <ActiveWorkoutRail
        exercises={exercises}
        completedSetIds={{}}
        focusedEntryId={focusedEntryId}
        activeEntryId={null}
        supersetBorders={new Map()}
        getImageSource={() => null}
        onPressExercise={jest.fn()}
        onPressAdd={jest.fn()}
      />,
    );
  }

  it('scrolls to a chip focused from the first render once its layout lands', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    try {
      const { getByTestId } = renderRail('ex-b');
      // The focus effect ran before any onLayout — nothing to scroll to yet.
      expect(scrollTo).not.toHaveBeenCalled();

      fireEvent(getByTestId('rail-chip-ex-b'), 'layout', {
        nativeEvent: { layout: { x: 120, y: 0, width: 72, height: 72 } },
      });
      expect(scrollTo).toHaveBeenCalledWith({ x: 96, animated: true });
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('does not scroll when a non-focused chip lays out', () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {});
    try {
      const { getByTestId } = renderRail('ex-b');
      fireEvent(getByTestId('rail-chip-ex-a'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: 72, height: 72 } },
      });
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      scrollTo.mockRestore();
    }
  });
});
