import { tool } from 'ai';
import type {
  ExerciseStatsSummaryResponse,
  ExerciseActivityQueryResponse,
  ExercisePRMatrixResponse,
  MatchedCoursesResponse,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import exerciseStatsService from '../../services/exerciseStatsService.js';
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
    `# Exercise Stats (${summary.interval}: ${summary.startDate} → ${summary.endDate})`,
    '',
    `- Workouts: ${totals.workoutCount} (${sign(cmp.workoutCountChangePercent)}% vs previous)`,
    `- Distance: ${totals.totalDistanceFormatted} ${distUnit} (${sign(cmp.distanceChangePercent)}%)`,
    `- Duration: ${totals.totalDurationMinutes} min (${sign(cmp.durationChangePercent)}%)`,
    `- Calories: ${totals.totalCaloriesBurned} (${sign(cmp.caloriesChangePercent)}%)`,
    `- Lifted volume: ${totals.totalLiftedVolumeKg} kg over ${totals.totalReps} reps`,
    `- Elevation gain: ${totals.totalElevationGainMeters} m`,
    `- Avg heart rate: ${totals.avgHeartRate ?? 'n/a'}`,
  ];
  return lines.join('\n');
}

export function buildExerciseStatsTools(userId: string, tz: string) {
  return {
    sparky_get_exercise_stats: tool({
      description:
        'Read exercise analytics: aggregated stats over an interval (stats_summary), advanced activity search (query_activities), personal records / best efforts (personal_records), and matched course groupings (matched_courses). Read-only.',
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
