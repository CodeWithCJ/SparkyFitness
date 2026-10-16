import { tool } from 'ai';
import {
  adjustRunning,
  findProgram,
  firstIndexOfWeek,
  moveTo,
  planMinutes,
  ProgramAdjustError,
  repeatWeek,
  suggestFromEffort,
  type RunProgramResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
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
- action: 'start_run_program' (fields: program_id? default beginner5k, confirmed) — starts a program from workout 1, or switches it on keeping the user's place if they already have that same program (to go back to the beginning use move_run_program with week 1). Programs: walkFit (8 weeks, three brisk walks a week building to 30 minutes, no running; for someone who does not want to run or is just starting to move), beginner5k (9 weeks, run/walk to 30 min), fiveToTenK (8 weeks, for people who can run 30 min), faster5k (6 weeks of speed work), halfMarathon (12 weeks), marathon (16 weeks, for people who already run regularly). Also: walk10k (10 weeks of brisk walking to a 10K walk, no running), returnToRunning (4 weeks to ease back in after a break; if the user is coming back from an injury, tell them to check with a physio or doctor first), gentle5k (12 weeks, a slower start than beginner5k), beginner10k (12 weeks from walking to a 10K), faster10k (8 weeks of speed work for people who run 10K), tenKToHalf (10 weeks from 10K to a half marathon), fasterHalf (10 weeks of speed work for a faster half marathon), beginnerMarathon (18 weeks, three runs a week, for people who can run 10K), advancedMarathon (16 weeks, five runs a week, for experienced runners). tenKToHalf, halfMarathon, fasterHalf and beginnerMarathon have three runs a week; add a 4 to the id (tenKToHalf4, halfMarathon4, fasterHalf4, beginnerMarathon4) for the version with a fourth run, which makes the long run a smaller share of the week. Offer it if the user can run four days a week. Starting a different program than the current one replaces it and drops their adjusted workouts, so say so before asking to confirm. Pick by what the user says they can do now; if unsure, ask.
- action: 'set_run_program_enabled' (fields: enabled, confirmed) — switches the program on or off, keeping their place
- action: 'repeat_run_program_week' (fields: week (1-based), confirmed) — goes back to the start of a week to do it again
- action: 'move_run_program' (fields: week (1-based), run? (1-based, default 1), confirmed) — jumps to a workout
- action: 'set_run_program_schedule' (fields: run_days? weekdays like ["mon","wed","sat"] (empty = every day), start_date? YYYY-MM-DD (null = from today), end_date? goal day YYYY-MM-DD such as a race (null = none), confirmed) — changes when workouts show in the user's Diary. Only the fields given change. Workouts are laid out one per chosen weekday in order, a missed run moves the rest along, and nothing is scheduled after the goal day. It does not change which workout is next.
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
            return program ? summarise(program) : NO_PROGRAM;
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
                findProgram(state.programId)?.workouts
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
