import {
  startableWorkoutsForWatch,
  suggestedExercisesForWatch,
  watchDistanceUnit,
} from '../../src/hooks/useWatchCheckInBridge';

const exercise = {
  id: 1,
  exercise_id: 'exercise-1',
  image_url: null,
  exercise_name: 'Exercise',
  category: null,
  superset_group: null,
  sets: [],
};

describe('startableWorkoutsForWatch', () => {
  it('sends named presets that have exercises, in name order', () => {
    expect(
      startableWorkoutsForWatch([
        { id: 2, name: 'Pull', exercises: [exercise] },
        { id: 1, name: '  ', exercises: [exercise] },
        { id: 3, name: 'Legs', exercises: [] },
        { id: 4, name: 'Push', exercises: [exercise] },
      ])
    ).toEqual([
      { presetId: '2', name: 'Pull' },
      { presetId: '4', name: 'Push' },
    ]);
  });
});

describe('watchDistanceUnit', () => {
  it('sends miles only when the phone is set to miles', () => {
    expect(watchDistanceUnit('miles')).toBe('miles');
    expect(watchDistanceUnit('km')).toBe('km');
    expect(watchDistanceUnit(undefined)).toBe('km');
    expect(watchDistanceUnit(null)).toBe('km');
  });
});

describe('suggestedExercisesForWatch', () => {
  it('lists recent exercises first, then top ones, each once', () => {
    expect(
      suggestedExercisesForWatch(
        [
          { id: 'a', name: 'Bench Press' },
          { id: 'b', name: 'Squat' },
        ],
        [
          { id: 'b', name: 'Squat' },
          { id: 'c', name: 'Deadlift' },
        ]
      )
    ).toEqual([
      { exerciseId: 'a', name: 'Bench Press' },
      { exerciseId: 'b', name: 'Squat' },
      { exerciseId: 'c', name: 'Deadlift' },
    ]);
  });

  it('skips blank names and stops at 20', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      id: `e${i}`,
      name: `Exercise ${i}`,
    }));
    const result = suggestedExercisesForWatch(
      [{ id: 'x', name: '  ' }, ...many],
      []
    );
    expect(result).toHaveLength(20);
    expect(result[0]).toEqual({ exerciseId: 'e0', name: 'Exercise 0' });
  });
});
