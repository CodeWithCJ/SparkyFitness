import type { ExerciseSessionResponse } from '@workspace/shared';

const RUN_NAME = /\b(run|running|jog|jogging|treadmill)\b/i;
const WALK_NAME = /\b(walk|walking|hike|hiking|treadmill)\b/i;

/**
 * A run (or walk, for a walking program) the person logged some other way today (the watch, an import, typed in)
 * that is long enough to stand for a program workout of `plannedMinutes`, or
 * null. Judged by the activity's name and length, so it is a suggestion the
 * person confirms, never counted automatically.
 */
export function findLoggedRun(
  sessions: readonly ExerciseSessionResponse[],
  plannedMinutes: number,
  activity: 'run' | 'walk' = 'run'
): ExerciseSessionResponse | null {
  const name_re = activity === 'walk' ? WALK_NAME : RUN_NAME;
  const needed = Math.max(10, plannedMinutes / 2);
  return (
    sessions.find((session) => {
      if (session.type === 'preset') return false;
      const name = session.name ?? session.exercise_snapshot?.name ?? '';
      return (
        name_re.test(name) && Number(session.duration_minutes ?? 0) >= needed
      );
    }) ?? null
  );
}
