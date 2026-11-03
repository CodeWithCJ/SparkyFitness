import type { ExerciseAlternative } from '@workspace/shared';
import {
  alternativeReasonLabel,
  buildExerciseReplaceContext,
  exerciseFromAlternative,
} from '@/utils/exerciseAlternatives';
import type { TFunction } from 'i18next';

describe('buildExerciseReplaceContext', () => {
  const entries = [
    { exerciseId: 'a', exerciseName: 'Bench' },
    { exerciseId: 'b', exerciseName: 'Row' },
    { exerciseId: 'b', exerciseName: 'Row' },
    { exerciseId: '', exerciseName: 'Unknown' },
  ];

  it('excludes the other exercises in the workout, once each', () => {
    expect(buildExerciseReplaceContext(entries[0], entries)).toEqual({
      exerciseId: 'a',
      exerciseName: 'Bench',
      excludeIds: ['b'],
    });
  });

  it('returns undefined when there is nothing to rank against', () => {
    expect(buildExerciseReplaceContext(entries[3], entries)).toBeUndefined();
    expect(buildExerciseReplaceContext(undefined, entries)).toBeUndefined();
  });
});

describe('exerciseFromAlternative', () => {
  it('carries what the add/replace handlers need', () => {
    const alternative: ExerciseAlternative = {
      origin: 'library',
      id: 'lib-1',
      name: 'Dumbbell Press',
      source: 'custom',
      category: 'strength',
      modality: 'weight_reps',
      level: null,
      mechanic: 'compound',
      force: 'push',
      equipment: ['dumbbell'],
      primary_muscles: ['chest'],
      secondary_muscles: [],
      images: ['a.png'],
      instructions: ['Press.'],
      description: null,
      calories_per_hour: 300,
      score: 70,
      reasons: ['same_primary_muscles'],
      last_performed_date: null,
    };
    expect(exerciseFromAlternative(alternative)).toMatchObject({
      id: 'lib-1',
      modality: 'weight_reps',
      images: ['a.png'],
      instructions: ['Press.'],
      calories_per_hour: 300,
    });
  });
});

describe('alternativeReasonLabel', () => {
  it('uses the English fallback for every reason', () => {
    const t = ((_key: string, fallback: string) => fallback) as TFunction;
    expect(alternativeReasonLabel(t, 'recently_performed')).toBe(
      'Done recently'
    );
    expect(alternativeReasonLabel(t, 'different_equipment')).toBe(
      'Different equipment'
    );
  });
});
