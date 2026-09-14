import { describe, it, expect } from 'vitest';
import { parseLiftohistory } from '../integrations/liftosaur/liftohistoryParser.js';

// Golden samples mirrored from Liftosaur's own serializer output
// (liftosaur/src/liftohistory/liftohistorySerializer.ts) and the API docs
// (liftosaur/docs/content/api.md).

describe('parseLiftohistory', () => {
  it('parses a full program workout with warmups and targets', () => {
    const text = [
      '2026-03-01 10:00:00 +00:00 / program: "5/3/1" / dayName: "Squat Day" / week: 1 / dayInWeek: 1 / duration: 3600s / exercises: {',
      '  Squat, Barbell / 3x5 185lb / warmup: 1x5 95lb, 1x3 135lb / target: 3x5 185lb 120s',
      '  Leg Press / 3x10 200lb / target: 3x10 200lb 90s',
      '}',
    ].join('\n');

    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    expect(result.workouts).toHaveLength(1);

    const workout = result.workouts[0]!;
    expect(workout.id).toBe(new Date('2026-03-01T10:00:00Z').getTime());
    expect(workout.date).toBe('2026-03-01T10:00:00.000Z');
    expect(workout.programName).toBe('5/3/1');
    expect(workout.dayName).toBe('Squat Day');
    expect(workout.week).toBe(1);
    expect(workout.dayInWeek).toBe(1);
    expect(workout.durationSeconds).toBe(3600);
    expect(workout.exercises).toHaveLength(2);

    const squat = workout.exercises[0]!;
    expect(squat.name).toBe('Squat, Barbell');
    expect(squat.completedSets).toHaveLength(3);
    expect(squat.completedSets[0]).toMatchObject({
      count: 1,
      reps: 5,
      weightValue: 185,
      weightUnit: 'lb',
    });
    expect(squat.warmupSets).toHaveLength(2);
    expect(squat.warmupSets[0]).toMatchObject({ reps: 5, weightValue: 95 });
    expect(squat.warmupSets[1]).toMatchObject({ reps: 3, weightValue: 135 });
    expect(squat.targetSets).toHaveLength(3);
    expect(squat.targetSets[0]).toMatchObject({ reps: 5, timerSeconds: 120 });

    const legPress = workout.exercises[1]!;
    expect(legPress.name).toBe('Leg Press');
    expect(legPress.completedSets).toHaveLength(3);
    expect(legPress.targetSets[0]).toMatchObject({
      reps: 10,
      weightValue: 200,
      timerSeconds: 90,
    });
  });

  it('parses the T-separator date form from the API docs', () => {
    const text = '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 135lb\n}';
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    expect(result.workouts[0]!.date).toBe('2026-03-01T10:00:00.000Z');
    expect(result.workouts[0]!.programName).toBeUndefined();
  });

  it('parses a date with milliseconds and a numeric offset', () => {
    const text =
      '2026-07-13T05:52:14.123+05:30 / program: "PPL" / dayName: "Push" / exercises: {\n  Bench Press / 3x8 100kg\n}';
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    const workout = result.workouts[0]!;
    // 05:52:14+05:30 == 00:22:14Z
    expect(workout.date).toBe('2026-07-13T00:22:14.123Z');
  });

  it('parses unilateral sets, RPE and labels', () => {
    const text = [
      '2026-01-10 18:00:00 -05:00 / exercises: {',
      '  Dumbbell Row / 1x5|3 100kg @8.5 (Top set), 2x8 80kg @7',
      '}',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    const sets = result.workouts[0]!.exercises[0]!.completedSets;
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({
      reps: 5,
      repsLeft: 3,
      weightValue: 100,
      weightUnit: 'kg',
      rpe: 8.5,
      label: 'Top set',
    });
    expect(sets[1]).toMatchObject({ reps: 8, weightValue: 80, rpe: 7 });
    expect(sets[2]).toMatchObject({ reps: 8, weightValue: 80, rpe: 7 });
  });

  it('parses rep ranges, AMRAP markers and ask-weight', () => {
    const text = [
      '2026-02-01 09:00:00 +00:00 / program: "Hypertrophy" / exercises: {',
      '  Lat Pulldown / 3x8-12 140lb+ / target: 3x8-12 140lb+ 60s',
      '  Curl / 4x10+ 20kg',
      '}',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    const pulldown = result.workouts[0]!.exercises[0]!;
    expect(pulldown.completedSets[0]).toMatchObject({
      reps: 12,
      minReps: 8,
      weightValue: 140,
      weightUnit: 'lb',
      askWeight: true,
    });
    expect(pulldown.targetSets[0]).toMatchObject({
      reps: 12,
      minReps: 8,
      timerSeconds: 60,
    });
    const curl = result.workouts[0]!.exercises[1]!;
    expect(curl.completedSets).toHaveLength(4);
    expect(curl.completedSets[0]).toMatchObject({
      reps: 10,
      isAmrap: true,
      weightValue: 20,
      weightUnit: 'kg',
    });
  });

  it('captures workout and exercise notes', () => {
    const text = [
      '// Felt great today',
      '// Second note line',
      '2026-05-01 08:00:00 +02:00 / program: "PPL" / dayName: "Pull" / exercises: {',
      '  // grip was slipping',
      '  Deadlift / 1x5 200kg',
      '}',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    const workout = result.workouts[0]!;
    expect(workout.notes).toBe('Felt great today\nSecond note line');
    expect(workout.exercises[0]!.notes).toBe('grip was slipping');
  });

  it('parses multiple records in one document', () => {
    const text = [
      '2026-01-01 10:00:00 +00:00 / exercises: {',
      '  Squat / 3x5 100kg',
      '}',
      '2026-01-02 10:00:00 +00:00 / program: "PPL" / dayName: "Push" / exercises: {',
      '  Bench Press / 3x5 80kg',
      '}',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    expect(result.workouts).toHaveLength(2);
    expect(result.workouts[0]!.exercises[0]!.name).toBe('Squat');
    expect(result.workouts[1]!.programName).toBe('PPL');
  });

  it('ignores blank lines and handles weights without units in labels', () => {
    const text = [
      '2026-03-01 10:00:00 +00:00 / exercises: {',
      '',
      '  Row / 3x10 60kg (no straps)',
      '',
      '}',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors).toEqual([]);
    const sets = result.workouts[0]!.exercises[0]!.completedSets;
    expect(sets).toHaveLength(3);
    expect(sets[0]).toMatchObject({
      reps: 10,
      weightValue: 60,
      label: 'no straps',
    });
  });

  it('collects errors and still returns salvageable records', () => {
    const text = [
      'not a date line',
      '2026-03-01 10:00:00 +00:00 / exercises: {',
      '  Squat / 5x 100kg',
      '  Missing close',
    ].join('\n');
    const result = parseLiftohistory(text);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.workouts).toHaveLength(1);
    // The malformed set is reported but the rest of the record survives.
    expect(
      result.errors.some((e) => e.message.includes('Could not parse set'))
    ).toBe(true);
    expect(result.errors.some((e) => e.message.includes('closing "}"'))).toBe(
      true
    );
  });

  it('reports an invalid date', () => {
    const result = parseLiftohistory(
      '2026-99-99 10:00:00 +00:00 / exercises: {\n  Squat / 3x5 100kg\n}'
    );
    expect(result.workouts).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes('Invalid date'))).toBe(
      true
    );
  });

  it('handles empty documents', () => {
    const result = parseLiftohistory('');
    expect(result.workouts).toHaveLength(0);
    expect(result.errors).toEqual([]);
  });
});
