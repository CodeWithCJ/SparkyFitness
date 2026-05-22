import React from 'react';
import { render } from '@testing-library/react-native';
import EditableExerciseCard from '../../src/components/EditableExerciseCard';
import { useExerciseStats } from '../../src/hooks/useExerciseStats';
import type { WorkoutDraftExercise } from '../../src/types/drafts';

jest.mock('../../src/hooks/useExerciseStats', () => ({
  useExerciseStats: jest.fn(),
}));

jest.mock('../../src/components/EditableSetList', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'editable-set-list' }),
  };
});

jest.mock('../../src/components/SafeImage', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'safe-image' }),
  };
});

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) =>
      React.createElement(View, { testID: `icon-${name}` }),
  };
});

const mockUseExerciseStats = useExerciseStats as jest.MockedFunction<typeof useExerciseStats>;

function makeExercise(overrides: Partial<WorkoutDraftExercise> = {}): WorkoutDraftExercise {
  return {
    clientId: 'ex-1',
    exerciseId: 'srv-ex-1',
    exerciseName: 'Bench Press',
    exerciseCategory: 'strength',
    images: [],
    sets: [{ clientId: 'set-1', weight: '', reps: '', restTime: 90 }],
    ...overrides,
  };
}

function statsResult(data: any) {
  return {
    data,
    isLoading: false,
    isError: false,
  } as unknown as ReturnType<typeof useExerciseStats>;
}

function renderCard({
  exercise,
  eligibleForPrefill = true,
  onUpdateSetField = jest.fn(),
  weightUnit = 'kg',
}: {
  exercise: WorkoutDraftExercise;
  eligibleForPrefill?: boolean;
  onUpdateSetField?: jest.Mock;
  weightUnit?: 'kg' | 'lbs';
}) {
  return render(
    <EditableExerciseCard
      exercise={exercise}
      imagePath={null}
      getImageSource={() => null}
      activeSetKey={null}
      activeSetField="weight"
      weightUnit={weightUnit}
      eligibleForPrefill={eligibleForPrefill}
      onActivateSet={jest.fn()}
      onDeactivateSet={jest.fn()}
      onUpdateSetField={onUpdateSetField}
      onRemoveSet={jest.fn()}
      onAddSet={jest.fn()}
      onRemove={jest.fn()}
      onOpenRestSheet={jest.fn()}
    />,
  );
}

describe('EditableExerciseCard prefill', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefills weight + reps from lastSet when both fields are blank', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
        lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
      }),
    );

    const onUpdate = jest.fn();
    renderCard({ exercise: makeExercise(), onUpdateSetField: onUpdate });

    expect(onUpdate).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledWith('ex-1', 'set-1', 'weight', '95');
    expect(onUpdate).toHaveBeenCalledWith('ex-1', 'set-1', 'reps', '5');
  });

  it('only prefills the blank field when reps is already populated', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
        lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
      }),
    );

    const onUpdate = jest.fn();
    renderCard({
      exercise: makeExercise({
        sets: [{ clientId: 'set-1', weight: '', reps: '8', restTime: 90 }],
      }),
      onUpdateSetField: onUpdate,
    });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith('ex-1', 'set-1', 'weight', '95');
  });

  it('does not prefill when eligibleForPrefill is false', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
        lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
      }),
    );

    const onUpdate = jest.fn();
    renderCard({
      exercise: makeExercise(),
      eligibleForPrefill: false,
      onUpdateSetField: onUpdate,
    });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('does not prefill a second time on re-render', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
        lastSet: { entryDate: '2026-04-10', weight: 95, reps: 5, setNumber: 1 },
      }),
    );

    const onUpdate = jest.fn();
    const exercise = makeExercise();
    const { rerender } = renderCard({ exercise, onUpdateSetField: onUpdate });

    rerender(
      <EditableExerciseCard
        exercise={exercise}
        imagePath={null}
        getImageSource={() => null}
        activeSetKey={null}
        activeSetField="weight"
        weightUnit="kg"
        eligibleForPrefill={true}
        onActivateSet={jest.fn()}
        onDeactivateSet={jest.fn()}
        onUpdateSetField={onUpdate}
        onRemoveSet={jest.fn()}
        onAddSet={jest.fn()}
        onRemove={jest.fn()}
        onOpenRestSheet={jest.fn()}
      />,
    );

    expect(onUpdate).toHaveBeenCalledTimes(2); // weight + reps from first render only
  });

  it('does not prefill when stats lastSet is null', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: null,
        lastSet: null,
      }),
    );

    const onUpdate = jest.fn();
    renderCard({ exercise: makeExercise(), onUpdateSetField: onUpdate });

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('converts kg → lbs when weightUnit is lbs', () => {
    mockUseExerciseStats.mockReturnValue(
      statsResult({
        bestSet: { entryDate: '2026-04-01', weight: 100, reps: 5, setNumber: 1 },
        lastSet: { entryDate: '2026-04-10', weight: 100, reps: 5, setNumber: 1 },
      }),
    );

    const onUpdate = jest.fn();
    renderCard({
      exercise: makeExercise(),
      onUpdateSetField: onUpdate,
      weightUnit: 'lbs',
    });

    // 100kg ≈ 220.5 lbs — rounded to 1 decimal
    expect(onUpdate).toHaveBeenCalledWith('ex-1', 'set-1', 'weight', '220.5');
  });
});
