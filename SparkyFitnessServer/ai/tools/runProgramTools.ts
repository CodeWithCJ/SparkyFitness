import { tool } from 'ai';
import {
  adjustRunning,
  applyRealign,
  builtInBaseline,
  firstIndexOfWeek,
  instantToDay,
  moveTo,
  planMinutes,
  ProgramAdjustError,
  realignInputFromProgram,
  realignProgram,
  repeatWeek,
  retestStatus,
  suggestFromEffort,
  todayInZone,
  type FitnessTestResponse,
  type RaceDistance,
  type RunProgramRealignPreview,
  type RunProgramResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import { listFitnessTests } from '../../models/fitnessTestRepository.js';
import {
  adjustRunProgram,
  getRunProgram,
  InvalidRunProgramScheduleError,
  upsertRunProgram,
} from '../../models/runProgramRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatConfirmation } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  manageRunProgramSchema,
  manageRunProgramInput,
  RUN_PROGRAM_ACTIONS,
  type ManageRunProgramInput,
} from './schemas/runProgram.js';

const VALID_ACTIONS = [...RUN_PROGRAM_ACTIONS];

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const NO_PROGRAM =
  'The user is not following a run program. Offer to start one (action start_run_program) if they want to; do not assume.';

const runSeconds = (workout: RunProgramResponse['workouts'][number]): number =>
  workout.plan.steps
    .filter((step) => step.kind === 'work')
    .reduce((sum, step) => sum + step.seconds, 0);

function describeWorkout(
  workout: RunProgramResponse['workouts'][number]
): string {
  return `week ${workout.week + 1}, run ${workout.day + 1}: ${planMinutes(workout.plan)} min in all, ${Math.round(runSeconds(workout) / 60)} min of running`;
}

function summarise(program: RunProgramResponse): string {
  const total = program.workouts.length;
  const done = Math.min(program.next_index, total);
  const lines = [
    `# Run program: ${program.program_id}`,
    `Switched on: ${program.enabled ? 'yes' : 'no'}`,
    `Progress: ${done} of ${total} workouts done${done >= total ? ' (finished)' : ''}`,
  ];
  const days = program.run_days.map((d) => WEEKDAY_NAMES[d]).join(', ');
  lines.push(
    `Diary days: ${days || 'every day'}`,
    `First day: ${program.start_date ?? 'from today'}`,
    `Goal day: ${program.end_date ?? 'none'}`
  );
  const upcoming = program.workouts.slice(done, done + 3);
  if (upcoming.length > 0) {
    lines.push('', 'Next workouts:');
    upcoming.forEach((workout, i) =>
      lines.push(`${i + 1}. ${describeWorkout(workout)}`)
    );
  }
  const efforts = program.effort_log.slice(-5);
  if (efforts.length > 0) {
    lines.push('', 'How recent workouts felt (1 easy to 10 all out):');
    for (const entry of efforts) {
      lines.push(
        `- workout ${entry.index + 1}: ${entry.rating}/10 (${entry.at.slice(0, 10)})`
      );
    }
    const suggestion = suggestFromEffort(
      program.effort_log,
      program.next_index
    );
    if (suggestion === 'ease') {
      lines.push(
        'The last two workouts felt hard. Consider suggesting an easier next workout or repeating one, and ask before changing anything.'
      );
    } else if (suggestion === 'advance') {
      lines.push(
        'The last two workouts felt easy. The person may be ready to move on; suggest it only if they want more, and ask before changing anything.'
      );
    }
  }
  const recent = program.adjustment_log.slice(-5);
  if (recent.length > 0) {
    lines.push('', 'Recent changes:');
    for (const entry of recent) {
      lines.push(
        `- ${entry.at.slice(0, 10)} (${entry.source}): ${entry.summary}`
      );
    }
  }
  return lines.join('\n');
}

const FITNESS_TEST_NAMES: Record<FitnessTestResponse['test_type'], string> = {
  '5k': '5K time trial',
  '30min': '30-minute all-out run',
  cooper: '12-minute Cooper test',
};

const clock = (totalSeconds: number): string => {
  const whole = Math.round(totalSeconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

// result_value is calculated after any incline adjustment, so the measured
// numbers come from duration_seconds and distance_meters and the adjusted
// equivalent is labelled as such.
function describeTestResult(test: FitnessTestResponse): string {
  const adjusted = test.incline_percent !== null && test.incline_adjusted;
  if (test.test_type === '5k') {
    const measured = `5K in ${clock(test.duration_seconds)}`;
    return adjusted
      ? `${measured} (incline-adjusted equivalent ${clock(test.result_value)})`
      : measured;
  }
  if (test.test_type === 'cooper') {
    const measured = `${Math.round(test.distance_meters)} m in 12 minutes`;
    return adjusted
      ? `${measured} (incline-adjusted equivalent ${Math.round(test.result_value)} m)`
      : measured;
  }
  const split = test.split_distance_meters;
  const lastTwenty = `${clock(test.result_value)}/km over the last 20 minutes`;
  if (!adjusted || split === null) return lastTwenty;
  const measuredPace = (20 * 60) / ((test.distance_meters - split) / 1000);
  return `${clock(measuredPace)}/km over the last 20 minutes (incline-adjusted equivalent ${clock(test.result_value)}/km)`;
}

function describeSurface(test: FitnessTestResponse): string {
  if (test.surface === 'outdoor') return 'outdoors';
  if (test.incline_percent === null) return 'on a treadmill';
  return `on a treadmill at ${test.incline_percent}% incline${test.incline_adjusted ? ', adjusted for incline' : ', not adjusted'}`;
}

function summariseFitnessTests(
  tests: FitnessTestResponse[],
  today: string
): string {
  const [latest] = tests;
  if (!latest) {
    return 'The user has not run a fitness test. They can run a 5K time trial, a 30-minute all-out run or a 12-minute Cooper test from the Record screen in the mobile app; the result sets their training paces.';
  }
  const status = retestStatus(latest.test_date, today);
  const lines = [
    '# Fitness tests (newest first)',
    ...tests
      .slice(0, 5)
      .map(
        (test) =>
          `- ${test.test_date}: ${FITNESS_TEST_NAMES[test.test_type]} (${describeSurface(test)}), ${describeTestResult(test)}, threshold pace ${clock(test.paces.thresholdSecondsPerKm)}/km`
      ),
    '',
    `Latest test training paces (per km), from ${latest.test_date}:`,
    `Equivalent 5K time: ${clock(latest.paces.equivalent5kSeconds)}`,
    ...[...latest.paces.zones]
      .reverse()
      .map(
        (zone) =>
          `- ${zone.id}: ${clock(zone.minSecondsPerKm)} to ${clock(zone.maxSecondsPerKm)}`
      ),
  ];
  if (status !== 'recent') {
    lines.push(
      '',
      status === 'due'
        ? 'The latest test is six to eight weeks old: a retest is due.'
        : 'The latest test is more than eight weeks old: a retest is overdue.'
    );
  }
  return lines.join('\n');
}

function describeRealign(preview: RunProgramRealignPreview): string {
  const lines = [preview.summary];
  for (const change of preview.changes) {
    const what = change.title
      ? `"${change.title}"`
      : `week ${change.week}, run ${change.run}`;
    const verb =
      change.kind === 'dropped'
        ? 'drop'
        : change.kind === 'merged'
          ? 'fold away'
          : change.kind === 'added'
            ? 'add a repeat of'
            : 'repeat';
    lines.push(`- ${verb} ${what} (${change.minutes} min): ${change.reason}`);
  }
  lines.push(
    `${preview.before.workouts} workouts left become ${preview.after.workouts}; the last one falls on ${preview.after.finishDay ?? 'the goal day'}.`
  );
  return lines.join('\n');
}

function realignInputFor(
  program: RunProgramResponse,
  tz: string,
  options: { distance?: RaceDistance; force?: boolean } = {}
) {
  const lastAdjusted = program.adjustment_log.at(-1);
  return realignInputFromProgram(program, {
    today: todayInZone(tz),
    lastAdjustedDay: lastAdjusted ? instantToDay(lastAdjusted.at, tz) : null,
    distance: options.distance,
    force: options.force,
  });
}

/** A line telling the assistant the plan no longer fits the goal day, if so. */
function realignHint(program: RunProgramResponse, tz: string): string {
  const outcome = realignProgram(realignInputFor(program, tz));
  if (outcome.state === 'plan' || outcome.state === 'unrealistic') {
    return '\n\nThe plan no longer lines up with the goal day. Offer to realign it (action realign_run_program) and ask before changing anything.';
  }
  return '';
}

const confirmFirst = (what: string): string =>
  `${what} Confirm with the user first. If they agree, call this action again with the same fields and confirmed=true. Nothing was changed.`;

export function buildRunProgramTools(userId: string, tz: string) {
  return {
    sparky_manage_run_program: tool({
      description: `The user's run program (for example the nine-week Beginner 5K): see where they are, and adjust the upcoming workouts based on how their runs have gone.

This tool takes a FLAT object with an "action" field. Do NOT nest fields under the action name.

To judge progress, read the user's recent runs first (sparky_get_exercise_stats / sparky_get_exercise_diary) and listen to what they say (an injury, a missed week, a hard run). Prefer the smallest change that helps. Changes only ever touch workouts not yet done, and running time can be eased by up to 30% but raised by at most 10% at a time. Always say what you changed and why.

Actions:
- action: 'get_run_program' — progress, the next workouts and recent changes
- action: 'get_fitness_tests' — the user's running fitness tests (5K time trial, 30-minute all-out run, 12-minute Cooper test), the training paces the latest one gave and whether a retest is due. Use these paces rather than guessing when you talk about pace.
- action: 'start_run_program' (fields: program_id? default beginner5k, confirmed) — starts a program from workout 1, or switches it on keeping the user's place if they already have that same program (to go back to the beginning use move_run_program with week 1). Programs: walkFit (8 weeks, three brisk walks a week building to 30 minutes, no running; for someone who does not want to run or is just starting to move), beginner5k (9 weeks, run/walk to 30 min), fiveToTenK (8 weeks, for people who can run 30 min), zone2Base (10 weeks of base building: easy runs held to the user's heart rate Zone 2 range, or the talk test without a heart rate, three runs a week, a long run building to 70 minutes and a zone check in weeks 4, 8 and 10; for people who can run 30 minutes), faster5k (6 weeks of speed work), halfMarathon (12 weeks), marathon (16 weeks, for people who already run regularly). Also: walk10k (10 weeks of brisk walking to a 10K walk, no running), returnToRunning (4 weeks to ease back in after a break; if the user is coming back from an injury, tell them to check with a physio or doctor first), gentle5k (12 weeks, a slower start than beginner5k), beginner10k (12 weeks from walking to a 10K), faster10k (8 weeks of speed work for people who run 10K), tenKToHalf (10 weeks from 10K to a half marathon), fasterHalf (10 weeks of speed work for a faster half marathon), beginnerMarathon (18 weeks, three runs a week, for people who can run 10K), advancedMarathon (16 weeks, five runs a week, for experienced runners). zone2Base, tenKToHalf, halfMarathon, fasterHalf and beginnerMarathon have three runs a week; add a 4 to the id (zone2Base4, tenKToHalf4, halfMarathon4, fasterHalf4, beginnerMarathon4) for the version with a fourth run, which makes the long run a smaller share of the week. Offer it if the user can run four days a week. Starting a different program than the current one replaces it and drops their adjusted workouts, so say so before asking to confirm. Pick by what the user says they can do now; if unsure, ask.
- action: 'set_run_program_enabled' (fields: enabled, confirmed) — switches the program on or off, keeping their place
- action: 'repeat_run_program_week' (fields: week (1-based), confirmed) — goes back to the start of a week to do it again
- action: 'move_run_program' (fields: week (1-based), run? (1-based, default 1), confirmed) — jumps to a workout
- action: 'set_run_program_schedule' (fields: run_days? weekdays like ["mon","wed","sat"] (empty = every day), start_date? YYYY-MM-DD (null = from today), end_date? goal day YYYY-MM-DD such as a race (null = none), confirmed) — changes when workouts show in the user's Diary. Only the fields given change. Workouts are laid out one per chosen weekday in order, a missed run moves the rest along, and nothing is scheduled after the goal day. It does not change which workout is next.
- action: 'realign_run_program' (fields: force?, distance?, confirmed) — rebuilds the rest of the plan to finish on the goal day (a race) after missed weeks, or uses spare time by repeating base weeks. It drops repeats and the shortest easy runs first, folds a lighter week into the next, never touches the taper or the final workout, keeps at least two runs a week for someone running three or more days, and eases the running after a long gap. Without confirmed=true it only says what it would change. If the goal day is not realistic for the plan it changes nothing and says so: offer a later goal day (set_run_program_schedule), a shorter race (the app's Plan a race), or, only if the user insists, call again with force=true
- action: 'adjust_run_program_running' (fields: percent (-30 to +10), count? (1-9, default 1), confirmed) — makes the running in the next workouts shorter or a little longer, keeping walking, warm-up and cool-down

Every change needs confirmed=true after the user has agreed.`,
      inputSchema: manageRunProgramInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          () => 'get_run_program'
        );
        const parsed = manageRunProgramSchema.safeParse(normalized);
        if (!parsed.success) return formatZodError(parsed.error);
        const args: ManageRunProgramInput = parsed.data;
        try {
          if (args.action === 'get_run_program') {
            const program = await getRunProgram(userId, userId);
            return program
              ? `${summarise(program)}${realignHint(program, tz)}`
              : NO_PROGRAM;
          }

          if (args.action === 'get_fitness_tests') {
            const tests = await listFitnessTests(userId, userId, 5);
            return summariseFitnessTests(tests, todayInZone(tz));
          }

          if (args.action === 'start_run_program') {
            const programId = args.program_id ?? 'beginner5k';
            const held = await getRunProgram(userId, userId);
            if (args.confirmed !== true) {
              return confirmFirst(
                held && held.program_id !== programId
                  ? `This will replace the user's current program (${held.program_id}) with ${programId}, starting at workout 1 and dropping any adjustments made to the current one.`
                  : 'This will start the run program.'
              );
            }
            const program = await upsertRunProgram(
              userId,
              { program_id: programId, enabled: true },
              userId
            );
            // The same program keeps its place; only a different one restarts.
            const note =
              held?.program_id === programId
                ? 'The user was already on this program, so it was switched on and their place kept. To go back to the beginning, move to week 1.'
                : 'Run program started.';
            return `${formatConfirmation(note)}\n\n${summarise(program)}`;
          }

          const existing = await getRunProgram(userId, userId);
          if (!existing) return NO_PROGRAM;

          if (args.action === 'set_run_program_enabled') {
            if (args.confirmed !== true) {
              return confirmFirst(
                `This will switch the run program ${args.enabled ? 'on' : 'off'}.`
              );
            }
            const program = await upsertRunProgram(
              userId,
              { program_id: existing.program_id, enabled: args.enabled },
              userId
            );
            return `${formatConfirmation(`Run program switched ${args.enabled ? 'on' : 'off'}.`)}\n\n${summarise(program)}`;
          }

          if (args.action === 'set_run_program_schedule') {
            const parts: string[] = [];
            if (args.run_days !== undefined) {
              parts.push(
                `show the workouts on ${
                  args.run_days.length
                    ? [...new Set(args.run_days)]
                        .sort()
                        .map((d) => WEEKDAY_NAMES[d])
                        .join(', ')
                    : 'every day'
                }`
              );
            }
            if (args.start_date !== undefined) {
              parts.push(
                args.start_date ? `start on ${args.start_date}` : 'start today'
              );
            }
            if (args.end_date !== undefined) {
              parts.push(
                args.end_date
                  ? `set the goal day to ${args.end_date}`
                  : 'remove the goal day'
              );
            }
            if (args.confirmed !== true) {
              return confirmFirst(`This will ${parts.join(', ')}.`);
            }
            const program = await upsertRunProgram(
              userId,
              {
                program_id: existing.program_id,
                run_days: args.run_days,
                start_date: args.start_date,
                end_date: args.end_date,
              },
              userId
            );
            return `${formatConfirmation('Run program schedule updated.')}\n\n${summarise(program)}`;
          }

          if (args.action === 'realign_run_program') {
            const outcome = realignProgram(realignInputFor(existing, tz, args));
            if (outcome.state === 'unavailable') {
              return ERRORS.VALIDATION(
                outcome.reason === 'noGoalDay'
                  ? 'The user has no goal day. Set one first (set_run_program_schedule end_date).'
                  : outcome.reason === 'noRunDays'
                    ? 'The user has not chosen workout days. Set them first (set_run_program_schedule run_days).'
                    : 'The program is finished: nothing to realign.'
              );
            }
            if (outcome.state === 'fits') {
              return 'The plan already fits the goal day. Nothing to realign and nothing was changed.';
            }
            if (outcome.state === 'unrealistic') {
              const options = [
                outcome.options.includes('later')
                  ? `a later goal day (the whole plan would end ${outcome.laterDay}; set_run_program_schedule end_date)`
                  : null,
                outcome.lowerDistance
                  ? `a shorter race (${outcome.lowerDistance}; the user plans it in the app's Plan a race)`
                  : null,
                outcome.options.includes('continue')
                  ? 'continuing anyway (call realign_run_program again with force=true, only if the user insists)'
                  : null,
              ].filter((option): option is string => option !== null);
              return `The goal day is not realistic for this plan: ${outcome.workoutsLeft} workouts are left and only ${outcome.slots} workout days (${outcome.weeksLeft} weeks) remain. Nothing was changed. Tell the user plainly and offer: ${options.join('; ')}.`;
            }
            if (args.confirmed !== true) {
              return confirmFirst(
                `This will realign the rest of the plan to finish on the goal day.\n${describeRealign(outcome.preview)}`
              );
            }
            const program = await adjustRunProgram(
              userId,
              'assistant',
              (state) => applyRealign(realignInputFor(state.program, tz, args)),
              userId
            );
            if (!program) return NO_PROGRAM;
            const last =
              program.adjustment_log[program.adjustment_log.length - 1];
            return `${formatConfirmation(last?.summary ?? 'Run program realigned.')}\n\n${summarise(program)}`;
          }

          let change;
          let describe: string;
          if (args.action === 'repeat_run_program_week') {
            if (firstIndexOfWeek(existing.workouts, args.week - 1) < 0) {
              return ERRORS.VALIDATION(`There is no week ${args.week}.`);
            }
            describe = `This will take the user back to the start of week ${args.week}.`;
            change = (state: Parameters<typeof repeatWeek>[0]) =>
              repeatWeek(state, args.week - 1);
          } else if (args.action === 'move_run_program') {
            const first = firstIndexOfWeek(existing.workouts, args.week - 1);
            if (first < 0) {
              return ERRORS.VALIDATION(`There is no week ${args.week}.`);
            }
            const inWeek = existing.workouts.filter(
              (w) => w.week === args.week - 1
            ).length;
            if ((args.run ?? 1) > inWeek) {
              return ERRORS.VALIDATION(
                `Week ${args.week} has ${inWeek} run${inWeek === 1 ? '' : 's'}, so there is no run ${args.run}.`
              );
            }
            const target = first + (args.run ?? 1) - 1;
            describe = `This will move the user to week ${args.week}, run ${args.run ?? 1}.`;
            change = (state: Parameters<typeof moveTo>[0]) =>
              moveTo(state, target);
          } else {
            const count = args.count ?? 1;
            describe = `This will change the running time in the next ${count} workout${count === 1 ? '' : 's'} by ${args.percent}%.`;
            // The baseline comes from the program under the lock, not the one
            // read above, in case it was switched in between.
            change = (
              state: Parameters<typeof adjustRunning>[0] & {
                programId: string;
              }
            ) =>
              adjustRunning(
                state,
                args.percent,
                count,
                builtInBaseline(state.programId, state.workouts)
              );
          }
          if (args.confirmed !== true) return confirmFirst(describe);

          const program = await adjustRunProgram(
            userId,
            'assistant',
            change,
            userId
          );
          if (!program) return NO_PROGRAM;
          const last =
            program.adjustment_log[program.adjustment_log.length - 1];
          return `${formatConfirmation(last?.summary ?? 'Run program updated.')}\n\n${summarise(program)}`;
        } catch (error) {
          if (
            error instanceof ProgramAdjustError ||
            error instanceof InvalidRunProgramScheduleError
          ) {
            return ERRORS.VALIDATION(error.message);
          }
          log('error', '[Run Program Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
