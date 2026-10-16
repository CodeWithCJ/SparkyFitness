import type { ExerciseSessionResponse } from '@workspace/shared';
import { findLoggedRun } from '../../src/utils/loggedRun';

const session = (over: Record<string, unknown>) =>
  ({
    type: 'individual',
    name: 'Running',
    duration_minutes: 30,
    ...over,
  }) as unknown as ExerciseSessionResponse;

test('finds a run long enough to stand for the workout', () => {
  const run = session({});
  expect(findLoggedRun([session({ name: 'Bench press' }), run], 30)).toBe(run);
});

test('ignores short runs, other activities and preset workouts', () => {
  expect(findLoggedRun([session({ duration_minutes: 8 })], 20)).toBeNull();
  expect(findLoggedRun([session({ duration_minutes: 12 })], 40)).toBeNull();
  expect(findLoggedRun([session({ name: 'Cycling' })], 30)).toBeNull();
  expect(findLoggedRun([session({ type: 'preset' })], 30)).toBeNull();
});

test('reads the name from the exercise snapshot too', () => {
  const run = session({
    name: undefined,
    exercise_snapshot: { name: 'Treadmill run' },
  });
  expect(findLoggedRun([run], 30)).toBe(run);
});
