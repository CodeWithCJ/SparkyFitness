import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CSV_FORMAT,
  detectWorkoutAppCsv,
  parseCsv,
  workoutAppRowsToSessions,
} from '@workspace/shared';

const read = (
  text: string,
  options?: Parameters<typeof workoutAppRowsToSessions>[2]
) => {
  const parsed = parseCsv(text, DEFAULT_CSV_FORMAT);
  const source = detectWorkoutAppCsv(parsed.headers);
  if (!source) throw new Error('not detected');
  return workoutAppRowsToSessions(source, parsed.rows, options);
};

const FITNOTES = `Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time,Comment
2026-03-01,Flat Barbell Bench Press,Chest,135.0,10,,,,
2026-03-01,Flat Barbell Bench Press,Chest,185.0,5,,,,felt strong
2026-03-01,Running (Treadmill),Cardio,,,3200.0,m,0:16:00,
,Bad Row,Chest,1,1,,,,
`;

const STRONG = `Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE
2026-03-02 18:00:00;Leg Day;1h;Squat (Barbell);W;60;5;0;0;;Good session;
2026-03-02 18:00:00;Leg Day;1h;Squat (Barbell);1;100;5;0;0;;Good session;8
2026-03-02 18:00:00;Leg Day;1h;Squat (Barbell);Rest Timer;0;0;0;90;;Good session;
2026-03-02 18:00:00;Leg Day;1h;Squat (Barbell);D;80;8;0;0;last one;Good session;
`;

describe('workout app CSV import', () => {
  it('tells FitNotes, Strong and other files apart', () => {
    expect(
      detectWorkoutAppCsv(['Date', 'Exercise', 'Category', 'Weight (kgs)'])
    ).toBe('fitnotes');
    expect(detectWorkoutAppCsv(['Date', 'Exercise Name', 'Set Order'])).toBe(
      'strong'
    );
    expect(detectWorkoutAppCsv(['entry_date', 'exercise_name'])).toBeNull();
  });

  it('reads FitNotes sets into kilograms and kilometres', () => {
    const result = read(FITNOTES);
    expect(result.source).toBe('fitnotes');
    expect(result.skippedRows).toEqual([4]);
    expect(result.sessions).toHaveLength(2);
    const [bench, run] = result.sessions;
    expect(bench.date).toBe('2026-03-01');
    expect(bench.category).toBe('Chest');
    expect(bench.sets.map((set) => set.reps)).toEqual([10, 5]);
    expect(bench.sets[1].weightKg).toBeCloseTo(83.91, 2);
    expect(bench.sets[1].notes).toBe('felt strong');
    expect(run.sets[0].distanceKm).toBeCloseTo(3.2);
    expect(run.sets[0].durationSeconds).toBe(960);
  });

  it('reads Strong set types, skips rest timers and uses the fallback unit', () => {
    const result = read(STRONG, { fallbackWeightUnit: 'lbs' });
    expect(result.source).toBe('strong');
    expect(result.sessions).toHaveLength(1);
    const [squat] = result.sessions;
    expect(squat.date).toBe('2026-03-02');
    expect(squat.workoutName).toBe('Leg Day');
    expect(squat.notes).toBe('Good session');
    expect(squat.sets.map((set) => set.setType)).toEqual([
      'Warm-up',
      'Working Set',
      'Drop Set',
    ]);
    expect(squat.sets.map((set) => set.setNumber)).toEqual([1, 2, 3]);
    expect(squat.sets[1].weightKg).toBeCloseTo(45.36, 2);
    expect(squat.sets[2].notes).toBe('last one');
  });

  it('prefers the unit column of newer Strong exports', () => {
    const text = `Date,Workout Name,Exercise Name,Set Order,Weight,Weight Unit,Reps,Distance,Distance Unit,Seconds,Notes,Workout Notes
2026-03-03 07:00:00,Push,Bench Press (Barbell),1,100,kg,5,,,,,
`;
    const result = read(text, { fallbackWeightUnit: 'lbs' });
    expect(result.sessions[0].sets[0].weightKg).toBe(100);
  });
});
