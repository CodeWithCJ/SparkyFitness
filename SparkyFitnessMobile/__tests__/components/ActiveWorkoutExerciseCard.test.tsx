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

jest.mock('../../src/components/SafeImage', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => <View testID="safe-image" />,
  };
});

jest.mock('../../src/components/ActiveWorkoutSetRow', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ set }: any) => <View testID={`set-row-${set.id}`} />,
  };
});

jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(() => ({ data: null })),
}));

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
      },
    ],
    ...overrides,
  };
}

function renderCard(expanded: boolean) {
  const callbacks = {
    onToggleExpanded: jest.fn(),
    onPressRestChip: jest.fn(),
    onPressMetricHeader: jest.fn(),
    onPressOverflow: jest.fn(),
    onCompleteActive: jest.fn(),
    onUncomplete: jest.fn(),
    onRecomplete: jest.fn(),
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
    />,
  );
  return { ...utils, callbacks };
}

describe('ActiveWorkoutExerciseCard', () => {
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
});
