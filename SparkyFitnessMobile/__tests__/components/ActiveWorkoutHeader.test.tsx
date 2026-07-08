import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { PresetSessionResponse } from '@workspace/shared';
import ActiveWorkoutHeader, {
  buildExerciseProgress,
  formatElapsed,
} from '../../src/components/ActiveWorkoutHeader';

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
  it('formats HH:MM:SS from startedAt', () => {
    const start = 1_700_000_000_000;
    expect(formatElapsed(start, start)).toBe('00:00:00');
    expect(formatElapsed(start, start + 59_000)).toBe('00:00:59');
    expect(formatElapsed(start, start + 61_000)).toBe('00:01:01');
    expect(formatElapsed(start, start + 3_600_000 + 125_000)).toBe('01:02:05');
  });

  it('shows zero when startedAt is null or in the future', () => {
    expect(formatElapsed(null, 123)).toBe('00:00:00');
    expect(formatElapsed(2_000, 1_000)).toBe('00:00:00');
  });
});

describe('buildExerciseProgress', () => {
  it('counts completed sets per exercise', () => {
    const progress = buildExerciseProgress(makeSession(), { '101': true, '301': true });
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

  function renderHeaderComponent(
    completedSetIds: Record<string, true>,
    overrides?: { onBack?: () => void; onDiscard?: () => void; onReorder?: () => void },
  ) {
    const progress = buildExerciseProgress(makeSession(), completedSetIds);
    return render(
      <ActiveWorkoutHeader
        name="Push Day"
        startedAt={start}
        now={start + 62_000}
        progress={progress}
        onBack={overrides?.onBack ?? jest.fn()}
        onDiscard={overrides?.onDiscard ?? jest.fn()}
        onReorder={overrides?.onReorder}
      />,
    );
  }

  it('renders the name and elapsed clock', () => {
    const { getByText } = renderHeaderComponent({});
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('00:01:02 elapsed')).toBeTruthy();
  });

  it('shows one segment per exercise and the done count', () => {
    // ex-1 fully done (2/2), ex-3 partial (1/2), ex-2 untouched.
    const { getByText, getAllByTestId, queryAllByTestId } = renderHeaderComponent({
      '101': true,
      '102': true,
      '301': true,
    });
    expect(getByText('1 / 3 exercises')).toBeTruthy();
    expect(getAllByTestId('header-segment-done')).toHaveLength(1);
    expect(queryAllByTestId('header-segment')).toHaveLength(2);
    // Only the partially-complete segment renders an accent fill.
    expect(getAllByTestId('header-segment-fill')).toHaveLength(1);
  });

  it('counts all exercises done', () => {
    const { getByText, getAllByTestId } = renderHeaderComponent({
      '101': true,
      '102': true,
      '201': true,
      '301': true,
      '302': true,
    });
    expect(getByText('3 / 3 exercises')).toBeTruthy();
    expect(getAllByTestId('header-segment-done')).toHaveLength(3);
  });

  it('fires onBack from the back button', () => {
    const onBack = jest.fn();
    const { getByLabelText } = renderHeaderComponent({}, { onBack });
    fireEvent.press(getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('opens the kebab menu and fires onDiscard from Discard workout', () => {
    const onDiscard = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent({}, { onDiscard });
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Discard workout'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('omits Reorder exercises when onReorder is not provided', () => {
    const { getByLabelText, queryByText } = renderHeaderComponent({});
    fireEvent.press(getByLabelText('Workout menu'));
    expect(queryByText('Reorder exercises')).toBeNull();
  });

  it('shows Reorder exercises and fires onReorder when provided', () => {
    const onReorder = jest.fn();
    const { getByLabelText, getByText } = renderHeaderComponent({}, { onReorder });
    fireEvent.press(getByLabelText('Workout menu'));
    fireEvent.press(getByText('Reorder exercises'));
    expect(onReorder).toHaveBeenCalledTimes(1);
  });
});
