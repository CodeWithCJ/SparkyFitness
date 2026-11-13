import type { TFunction } from 'i18next';
import { findProgram, storedProgramStatus } from '@workspace/shared';
import { translateForTest } from '@/tests/mocks/reactI18next';
import { makeRunProgram } from '@/tests/mocks/runProgramFixture';
import {
  formatDayLabel,
  programDescription,
  programName,
  programStructure,
  programTitle,
  programWorkoutLabel,
  weekdayLabel,
  workoutTitle,
} from '@/utils/runPrograms';
import { PROGRAM_COPY } from '@/constants/runProgramCopy';
import { RUN_PROGRAMS } from '@workspace/shared';

const t = translateForTest as unknown as TFunction;

describe('program copy', () => {
  it('has a name, description and structure for every built-in program', () => {
    for (const program of RUN_PROGRAMS) {
      const copy = PROGRAM_COPY[program.id];
      expect(copy?.name).toBeTruthy();
      expect(copy?.description).toBeTruthy();
      expect(copy?.structure).toBeTruthy();
    }
  });

  it('reads the English defaults', () => {
    expect(programName(t, 'beginner5k')).toBe('Beginner 5K');
    expect(programName(t, 'halfMarathon4')).toBe(
      'Half marathon (4 runs a week)'
    );
    expect(programDescription(t, 'walkFit')).toContain('Walk for fitness');
    expect(programStructure(t, 'beginner5k')).toContain('Weeks 1 to 4');
  });

  it('falls back to the id for a program that is gone', () => {
    expect(programName(t, 'retired')).toBe('retired');
    expect(programDescription(t, 'retired')).toBe('');
  });
});

describe('labels', () => {
  const run = storedProgramStatus(makeRunProgram());

  it('labels a run workout by week and run', () => {
    const workout = run.program.workouts[4]!;
    expect(workoutTitle(t, run.program, workout)).toBe(
      `Week ${workout.week + 1}, run ${workout.day + 1}`
    );
  });

  it('labels a walking program workout as a walk', () => {
    const walk = storedProgramStatus(
      makeRunProgram({
        program_id: 'walkFit',
        workouts: findProgram('walkFit')!.workouts,
      })
    );
    expect(workoutTitle(t, walk.program, walk.program.workouts[0]!)).toBe(
      'Week 1, walk 1'
    );
  });

  it("uses the person's own names for a custom program", () => {
    const custom = storedProgramStatus(
      makeRunProgram({
        program_id: 'custom:abc',
        name: 'Spring plan',
        workouts: [
          { ...findProgram('beginner5k')!.workouts[0]!, title: 'Long one' },
          findProgram('beginner5k')!.workouts[1]!,
        ],
      })
    );
    expect(programTitle(t, custom.program)).toBe('Spring plan');
    expect(workoutTitle(t, custom.program, custom.program.workouts[0]!)).toBe(
      'Long one'
    );
    expect(workoutTitle(t, custom.program, custom.program.workouts[1]!)).toBe(
      'Workout 2'
    );
    expect(programWorkoutLabel(t, custom)).toBe('Spring plan · Long one');
  });

  it('names the program alone once it is finished', () => {
    const done = storedProgramStatus(makeRunProgram({ next_index: 27 }));
    expect(done.finished).toBe(true);
    expect(programWorkoutLabel(t, done)).toBe('Beginner 5K');
  });

  it('names weekdays from Sunday', () => {
    expect(weekdayLabel(0, 'en-US')).toBe('Sun');
    expect(weekdayLabel(3, 'en-US', 'long')).toBe('Wednesday');
    expect(weekdayLabel(6, 'en-US')).toBe('Sat');
  });

  it('formats a calendar day without shifting it across a timezone', () => {
    expect(formatDayLabel('2026-10-19', 'en-US', 'long')).toBe(
      'Monday, October 19'
    );
    expect(formatDayLabel('2026-10-19', 'en-US')).toBe('Mon, Oct 19');
    expect(formatDayLabel('nope', 'en-US')).toBe('nope');
  });
});
