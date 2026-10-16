import { queryClient } from '../../src/hooks/queryClient';
import { runProgramQueryKey } from '../../src/hooks/queryKeys';
import { programSpokenCues } from '../../src/utils/programCues';
import { storedBeginnerProgram } from '../helpers/runProgramFixture';

const t = ((key: string, options?: Record<string, unknown>) =>
  String(options?.defaultValue ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name) =>
    String(options?.[name] ?? '')
  )) as never;

const plan = {
  style: 'runWalk' as const,
  steps: [{ kind: 'work' as const, seconds: 600 }],
};

afterEach(() => queryClient.clear());

describe('programSpokenCues for a custom plan', () => {
  it('names the workout and what comes next from the stored program', () => {
    const id = 'custom:0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';
    queryClient.setQueryData(
      runProgramQueryKey,
      storedBeginnerProgram({
        program_id: id,
        workouts: [1, 2, 3].map((n) => ({ week: 0, day: n, plan })),
      })
    );
    const cues = programSpokenCues(t, { id, index: 0 }, plan);
    expect(cues?.start).toContain('Workout 1');
    expect(cues?.done).toBe('Workout 1 of 3 done. Next up, workout 2.');
    expect(programSpokenCues(t, { id, index: 2 }, plan)?.done).toBe(
      'Program complete. Well done.'
    );
  });

  it('says nothing for a plan that is not the one stored', () => {
    queryClient.setQueryData(runProgramQueryKey, storedBeginnerProgram());
    expect(
      programSpokenCues(t, { id: 'custom:other', index: 0 }, plan)
    ).toBeNull();
  });
});
