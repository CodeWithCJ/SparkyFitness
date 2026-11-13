import { describe, expect, it } from 'vitest';
import {
  bodyWeightOnDay,
  deriveExerciseModality,
  effectiveLoadKg,
  effortAdjustedOneRepMaxKg,
  epleyOneRepMaxKg,
  isExerciseModality,
  isWeightDistanceModality,
  isWeightDurationModality,
  modalityRecordsReps,
  resolveExerciseModality,
  setVolumeKg,
} from '@workspace/shared';

describe('effectiveLoadKg', () => {
  it('is the set weight for an ordinary exercise', () => {
    expect(effectiveLoadKg(60, 'weight_reps', 80)).toBe(60);
    expect(effectiveLoadKg(null, 'weight_reps', 80)).toBe(0);
  });

  it('adds body weight for a bodyweight exercise, assisted or weighted', () => {
    expect(effectiveLoadKg(20, 'bodyweight_reps', 80)).toBe(100);
    expect(effectiveLoadKg(-30, 'bodyweight_reps', 80)).toBe(50);
    expect(effectiveLoadKg(null, 'bodyweight_reps', 80)).toBe(80);
  });

  it('never goes below zero, and counts only the added weight with no body weight', () => {
    expect(effectiveLoadKg(-100, 'bodyweight_reps', 80)).toBe(0);
    expect(effectiveLoadKg(20, 'bodyweight_reps', null)).toBe(20);
    expect(effectiveLoadKg(-20, 'bodyweight_reps', null)).toBe(0);
  });

  it('feeds volume and the Epley estimate', () => {
    expect(setVolumeKg({ weight: 10, reps: 5 }, 'bodyweight_reps', 70)).toBe(
      400
    );
    expect(epleyOneRepMaxKg(100, 30)).toBe(200);
    expect(epleyOneRepMaxKg(0, 5)).toBe(0);
    expect(epleyOneRepMaxKg(100, 0)).toBe(0);
  });
});

describe('effortAdjustedOneRepMaxKg', () => {
  it('counts the reps left in the tank', () => {
    // RPE 8 is two reps left: 5 reps is judged as 7.
    expect(effortAdjustedOneRepMaxKg(100, 5, 8)).toBeCloseTo(
      epleyOneRepMaxKg(100, 7)
    );
    // RPE 10 is a true max set: nothing is added.
    expect(effortAdjustedOneRepMaxKg(100, 5, 10)).toBe(
      epleyOneRepMaxKg(100, 5)
    );
    expect(effortAdjustedOneRepMaxKg(100, 5, 6)).toBeCloseTo(
      epleyOneRepMaxKg(100, 9)
    );
  });

  it('is plain Epley with no usable RPE', () => {
    const plain = epleyOneRepMaxKg(100, 5);
    expect(effortAdjustedOneRepMaxKg(100, 5, null)).toBe(plain);
    expect(effortAdjustedOneRepMaxKg(100, 5, undefined)).toBe(plain);
    // More than four reps left is too loose a guess to count.
    expect(effortAdjustedOneRepMaxKg(100, 5, 4)).toBe(plain);
    expect(effortAdjustedOneRepMaxKg(100, 5, 11)).toBe(plain);
  });

  it('is 0 without a load or reps', () => {
    expect(effortAdjustedOneRepMaxKg(0, 5, 8)).toBe(0);
    expect(effortAdjustedOneRepMaxKg(100, 0, 8)).toBe(0);
  });
});

describe('bodyWeightOnDay', () => {
  const readings = [
    { date: '2026-09-10', weightKg: 81 },
    { date: '2026-09-01', weightKg: 80 },
    { date: '2026-09-20', weightKg: 0 },
  ];

  it('takes the latest reading on or before the day', () => {
    expect(bodyWeightOnDay(readings, '2026-09-10')).toBe(81);
    expect(bodyWeightOnDay(readings, '2026-09-15')).toBe(81);
    expect(bodyWeightOnDay(readings, '2026-09-05')).toBe(80);
  });

  it('falls back to the earliest later reading, ignoring empty ones', () => {
    expect(bodyWeightOnDay(readings, '2026-08-01')).toBe(80);
    expect(bodyWeightOnDay([], '2026-09-01')).toBeNull();
  });
});

describe('bodyweight modality derivation', () => {
  it('derives bodyweight from equipment that is bodyweight only', () => {
    expect(deriveExerciseModality('strength', ['body only'])).toBe(
      'bodyweight_reps'
    );
    expect(deriveExerciseModality('strength', ['Pull-up bar'])).toBe(
      'bodyweight_reps'
    );
    expect(deriveExerciseModality('strength', 'dip station')).toBe(
      'bodyweight_reps'
    );
  });

  it('leaves blank or loaded equipment, cardio and holds alone', () => {
    expect(deriveExerciseModality('strength', [])).toBe('weight_reps');
    expect(deriveExerciseModality('strength', null)).toBe('weight_reps');
    expect(deriveExerciseModality('strength', ['body only', 'barbell'])).toBe(
      'weight_reps'
    );
    expect(
      deriveExerciseModality('strength', [
        'body only',
        'custom weighted attachment',
      ])
    ).toBe('weight_reps');
    expect(deriveExerciseModality('strength', ['body only', 'bench'])).toBe(
      'bodyweight_reps'
    );
    expect(
      deriveExerciseModality('strength', ['Pull-up bar', 'incline bench'])
    ).toBe('bodyweight_reps');
    expect(deriveExerciseModality('cardio', ['body only'])).toBe(
      'duration_distance'
    );
    expect(deriveExerciseModality('isometric', ['body only'])).toBe('duration');
    // Callers that pass no equipment keep the category-only rule.
    expect(deriveExerciseModality('strength')).toBe('weight_reps');
  });

  it('keeps an explicit modality over the derived one', () => {
    expect(
      resolveExerciseModality('weight_reps', 'strength', ['body only'])
    ).toBe('weight_reps');
    expect(resolveExerciseModality('bodyweight_reps', 'strength')).toBe(
      'bodyweight_reps'
    );
  });
});

describe('weight_distance and weight_duration modalities', () => {
  it('are valid modalities and are told apart from each other', () => {
    expect(isExerciseModality('weight_distance')).toBe(true);
    expect(isExerciseModality('weight_duration')).toBe(true);
    expect(isWeightDistanceModality('weight_distance')).toBe(true);
    expect(isWeightDistanceModality('weight_duration')).toBe(false);
    expect(isWeightDurationModality('weight_duration')).toBe(true);
    expect(isWeightDurationModality('duration')).toBe(false);
  });

  it('do not record reps, while the rep-based modalities do', () => {
    expect(modalityRecordsReps('weight_distance')).toBe(false);
    expect(modalityRecordsReps('weight_duration')).toBe(false);
    expect(modalityRecordsReps('duration')).toBe(false);
    expect(modalityRecordsReps('weight_reps')).toBe(true);
    expect(modalityRecordsReps('reps_only')).toBe(true);
    expect(modalityRecordsReps('bodyweight_reps')).toBe(true);
  });

  it('keep an explicit choice over anything derived', () => {
    expect(resolveExerciseModality('weight_distance', 'strongman')).toBe(
      'weight_distance'
    );
    expect(
      resolveExerciseModality('weight_duration', 'strength', 'body only')
    ).toBe('weight_duration');
  });

  it('count no volume or estimated one-rep max, since no reps are logged', () => {
    expect(
      setVolumeKg({ weight: 100, reps: null }, 'weight_distance', 80)
    ).toBe(0);
  });
});
