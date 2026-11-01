import { tool } from 'ai';
import {
  kgInUnit,
  type RunReview,
  type TrainingLoad,
  type TrainingReview,
} from '@workspace/shared';
import type {
  ExerciseStatsSummaryResponse,
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  MatchedCoursesResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import exerciseStatsService from '../../services/exerciseStatsService.js';
import preferenceService from '../../services/preferenceService.js';
import runReviewService from '../../services/runReviewService.js';
import trainingReviewService from '../../services/trainingReviewService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatList } from './formatting.js';
import {
  EXERCISE_STATS_ACTIONS,
  exerciseStatsSchema,
  exerciseStatsInput,
  type ExerciseStatsInput,
} from './schemas/exerciseStats.js';
import { normalizeActionArgs } from './dates.js';

const VALID_ACTIONS = [...EXERCISE_STATS_ACTIONS];

function inferAction(args: Record<string, unknown>): string {
  if (args.search_keyword !== undefined || args.distance_standard !== undefined)
    return 'query_activities';
  return 'stats_summary';
}

function formatSummary(summary: ExerciseStatsSummaryResponse): string {
  const { totals, comparisonWithPreviousPeriod: cmp, unitSystem } = summary;
  const distUnit = unitSystem === 'imperial' ? 'mi' : 'km';
  const sign = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
  const lines = [
    `# Exercise Stats (bucketed by ${summary.interval}, ${summary.startDate} → ${summary.endDate})`,
    '',
    `- Workouts: ${totals.workoutCount} (${sign(cmp.workoutCountChangePercent)}% vs previous)`,
    `- Distance: ${totals.totalDistanceFormatted} ${distUnit} (${sign(cmp.distanceChangePercent)}%)`,
    `- Duration: ${Math.round(totals.totalDurationMinutes)} min (${sign(cmp.durationChangePercent)}%)`,
    `- Calories: ${totals.totalCaloriesBurned} (${sign(cmp.caloriesChangePercent)}%)`,
    `- Lifted volume: ${totals.totalLiftedVolumeKg} kg over ${totals.totalReps} reps`,
    `- Elevation gain: ${totals.totalElevationGainMeters} m`,
    `- Avg heart rate: ${totals.avgHeartRate ?? 'n/a'}`,
  ];
  return lines.join('\n');
}

function formatTrainingReview(
  review: TrainingReview,
  weightUnit: 'kg' | 'lbs'
): string {
  const { window, effort } = review;
  const weight = (kg: number): string =>
    `${kgInUnit(kg, weightUnit)} ${weightUnit}`;
  const lines = [
    `# Training Review (${window.from} → ${window.to}, ${window.days} days)`,
    '',
    `- Sessions: ${review.sessions} (${review.sessionsPerWeek} per week)`,
  ];
  if (!review.enoughData) {
    lines.push(
      '',
      'Not enough data for a trend: fewer than 3 sessions in the window. Do not recommend removing, swapping or adding exercises on this alone; say what to watch for instead.'
    );
  }
  lines.push('', '## Stalled lifts');
  if (review.stalls.length === 0) {
    lines.push(
      'None. Every lift with 3+ sessions is still improving or holding.'
    );
  } else {
    for (const stall of review.stalls) {
      lines.push(
        `- **${stall.exerciseName}**: ${stall.stalledSessions} sessions in a row without beating the best estimated 1RM (best ${weight(stall.bestEstimatedOneRepMaxKg)}, last ${weight(stall.lastEstimatedOneRepMaxKg)} on ${stall.lastDate}; ${stall.sessions} sessions)`
      );
    }
    lines.push(
      'A stall can also be a deliberate deload; ask before assuming the program is wrong.'
    );
  }
  lines.push('', '## Effort');
  if (effort.averageRpe === null && effort.averageRir === null) {
    lines.push('No RPE or RIR was logged, so effort cannot be read.');
  } else {
    if (effort.averageRpe !== null) {
      lines.push(`- Average RPE: ${effort.averageRpe}`);
    }
    if (effort.averageRir !== null) {
      lines.push(`- Average RIR: ${effort.averageRir}`);
    }
    lines.push(
      effort.nearFailure.length > 0
        ? `- Taken to or near failure: ${effort.nearFailure.join(', ')}`
        : '- No lift is consistently taken to failure.'
    );
  }
  lines.push('', '## Muscle coverage (working sets in the window)');
  const muscles = Object.entries(review.muscleSets).sort(
    ([, a], [, b]) => b - a
  );
  lines.push(
    muscles.length > 0
      ? muscles.map(([muscle, sets]) => `- ${muscle}: ${sets}`).join('\n')
      : 'No working sets with a known muscle.'
  );
  if (review.untrainedMuscles.length > 0) {
    lines.push(
      '',
      `Trained earlier but not in this window: ${review.untrainedMuscles.join(', ')}.`
    );
  }
  lines.push(
    '',
    'Body-weight and cardio exercises are not included in stall detection. Propose changes only with this evidence, and say plainly when nothing warrants one.'
  );
  return lines.join('\n');
}

const KM_PER_MILE = 1.609344;

function formatPace(secPerKm: number, unit: 'km' | 'miles'): string {
  const secs = Math.round(unit === 'miles' ? secPerKm * KM_PER_MILE : secPerKm);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')} /${unit === 'miles' ? 'mi' : 'km'}`;
}

function formatRunReview(
  review: RunReview,
  load: TrainingLoad,
  unit: 'km' | 'miles'
): string {
  const label = unit === 'miles' ? 'mi' : 'km';
  const dist = (km: number): string =>
    `${Math.round((unit === 'miles' ? km / KM_PER_MILE : km) * 10) / 10} ${label}`;
  const { window } = review;
  const lines = [
    `# Run Review (${window.from} → ${window.to}, ${window.days} days)`,
    '',
    `- Runs: ${review.runs} (${review.runsPerWeek} per week)`,
    `- Distance: ${dist(review.totalKm)} in all, longest run ${dist(review.longestRunKm)}`,
  ];
  if (!review.enoughData) {
    lines.push(
      '',
      'Not enough data for a trend: fewer than 3 runs in the window. Do not recommend changing the plan on this alone; say what to watch for instead.'
    );
  }
  lines.push('', '## Weekly distance (oldest first)');
  for (const week of review.weeks) {
    lines.push(`- week of ${week.start}: ${dist(week.km)} (${week.runs} runs)`);
  }
  if (review.jumps.length > 0) {
    for (const jump of review.jumps) {
      lines.push(
        `- Week of ${jump.weekStart} rose ${jump.increasePercent}% (${dist(jump.fromKm)} to ${dist(jump.toKm)}), more than the usual 10% a week.`
      );
    }
  }
  lines.push('', '## Pace');
  if (review.paceSecPerKm === null) {
    lines.push('No run of 1 km or more with a duration, so no pace.');
  } else {
    lines.push(`- Average pace: ${formatPace(review.paceSecPerKm, unit)}`);
    if (
      review.previousPaceSecPerKm !== null &&
      review.paceChangePercent !== null
    ) {
      const faster = review.paceChangePercent < 0;
      lines.push(
        `- Previous ${window.days} days: ${formatPace(review.previousPaceSecPerKm, unit)} (${Math.abs(review.paceChangePercent)}% ${faster ? 'faster' : 'slower'})`
      );
    } else {
      lines.push('- No earlier runs to compare with.');
    }
  }
  lines.push('', '## Training load (all workouts, last 4 weeks)');
  if (load.status === 'noData' || load.status === 'learning') {
    lines.push(
      'Not enough history yet to judge load (needs about three weeks of workouts).'
    );
  } else {
    lines.push(
      `- Status: ${load.status} (this week against the 4-week average: ${load.ratio ?? 'n/a'})`,
      `- Days since the last workout: ${load.restDays ?? 'n/a'}`,
      `- Recovery hint: ${load.recovery}`
    );
  }
  lines.push(
    '',
    'Treat a distance jump or a high load as a reason to ask how the legs feel, not as a diagnosis. Propose plan changes only with this evidence, change nothing without the user agreeing, and say plainly when nothing warrants one. For a run program, use sparky_manage_run_program.'
  );
  return lines.join('\n');
}

export function buildExerciseStatsTools(userId: string, tz: string) {
  return {
    sparky_get_exercise_stats: tool({
      description:
        'Read exercise analytics: aggregated stats over an interval (stats_summary), advanced activity search (query_activities), personal records / best efforts (personal_records), and matched course groupings (matched_courses), and a training review of recent strength work (training_review: sessions per week, stalled lifts, effort, muscle coverage; optional window_days 7-90, default 28), and a run review (run_review: runs per week, weekly distance and jumps, pace against the period before, training load and recovery; optional window_days 7-90, default 28). Read-only.',
      inputSchema: exerciseStatsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          inferAction
        );

        const parsed = exerciseStatsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ExerciseStatsInput = parsed.data;

        try {
          switch (args.action) {
            case 'stats_summary': {
              const summary =
                await exerciseStatsService.getExerciseStatsSummary(userId, {
                  interval: args.interval ?? 'month',
                  startDate: args.start_date,
                  endDate: args.end_date,
                  category: args.category,
                  unitSystem: args.unit_system ?? 'metric',
                });
              return formatSummary(summary);
            }
            case 'query_activities': {
              const result: ExerciseActivityQueryResponse =
                await exerciseStatsService.queryExerciseActivities(userId, {
                  category: args.category,
                  distanceStandard: args.distance_standard,
                  startDate: args.start_date,
                  endDate: args.end_date,
                  searchKeyword: args.search_keyword,
                  unitSystem: args.unit_system ?? 'metric',
                  sortBy: 'entry_date',
                  sortOrder: 'desc',
                  page: args.page ?? 1,
                  pageSize: args.page_size ?? 20,
                });
              const title = `Activities (page ${result.page}/${result.totalPages}, ${result.totalCount} total)`;
              return formatList(result.items, title, (item) => {
                const dist =
                  item.distanceFormatted !== null
                    ? ` — ${item.distanceFormatted} ${args.unit_system === 'imperial' ? 'mi' : 'km'}`
                    : '';
                const pace = item.formattedPace
                  ? ` @ ${item.formattedPace}`
                  : '';
                return `**${item.exerciseName}** (${item.entryDate})${dist}, ${item.durationMinutes} min${pace}\n  ID: ${item.id}`;
              });
            }
            case 'personal_records': {
              const matrix: ExercisePRMatrixResponse =
                await exerciseStatsService.getPersonalRecordMatrix(
                  userId,
                  args.unit_system ?? 'metric'
                );
              const cardio = formatList(
                matrix.cardioPRs,
                'Cardio Personal Records',
                (pr) =>
                  `**${pr.label}** — ${pr.formattedTime} (${pr.formattedPace}) on ${pr.achievedAt}\n  ${pr.activityName}`
              );
              const strength = formatList(
                matrix.strength1RMs,
                'Strength 1RM Estimates',
                (s) =>
                  `**${s.exerciseName}** — ${s.estimatedOneRMKg} kg (from ${s.weightKg} kg × ${s.reps}) on ${s.achievedAt}`
              );
              return `${cardio}\n\n${strength}`;
            }
            case 'training_review': {
              const [review, prefs] = await Promise.all([
                trainingReviewService.getTrainingReview(
                  userId,
                  args.window_days
                ),
                preferenceService.getUserPreferences(userId, userId),
              ]);
              return formatTrainingReview(
                review,
                prefs.default_weight_unit === 'lbs' ? 'lbs' : 'kg'
              );
            }
            case 'run_review': {
              const [{ review, load }, prefs] = await Promise.all([
                runReviewService.getRunReview(userId, args.window_days),
                preferenceService.getUserPreferences(userId, userId),
              ]);
              return formatRunReview(
                review,
                load,
                prefs.default_distance_unit === 'miles' ? 'miles' : 'km'
              );
            }
            case 'matched_courses': {
              const result: MatchedCoursesResponse =
                await exerciseStatsService.getMatchedCourses(
                  userId,
                  args.unit_system ?? 'metric'
                );
              return formatList(
                result.courses,
                'Matched Courses',
                (c) =>
                  `**${c.courseName}** (${c.activityCount} activities) — avg ${c.avgDistanceFormatted} ${args.unit_system === 'imperial' ? 'mi' : 'km'}, best pace ${c.bestPaceFormatted}\n  ID: ${c.courseId}`
              );
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as { action?: string }).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Exercise Stats Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
