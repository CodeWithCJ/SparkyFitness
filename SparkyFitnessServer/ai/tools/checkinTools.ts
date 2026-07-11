import { tool } from 'ai';
import { dayToUtcRange, todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import preferenceService from '../../services/preferenceService.js';
import moodRepository from '../../models/moodRepository.js';
import fastingRepository from '../../models/fastingRepository.js';
import sleepRepository from '../../models/sleepRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeDayKeywords } from './dates.js';
import { formatConfirmation, formatList, formatSuccess } from './formatting.js';
import { convertWeight, convertMeasurement } from './unitConversion.js';
import {
  manageCheckinSchema,
  manageCheckinInput,
  type ManageCheckinInput,
} from './schemas/checkin.js';

const VALID_ACTIONS = [
  'log_biometrics',
  'log_custom_metric',
  'list_categories',
  'create_category',
  'log_mood',
  'log_fasting',
  'log_sleep',
  'list_checkin_diary',
  'get_fasting_status',
  'get_biometrics_history',
];

// Optional inputs and nullable DB columns are treated alike: absent.
function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Biometrics rows converted into the user's preferred units, oldest-first —
// MCP's getBiometricsHistory row shape. Shared with the report tools.
export async function getBiometricsHistoryRows(
  userId: string,
  startDate?: string,
  endDate?: string
) {
  const prefs = await preferenceService.getUserPreferences(userId, userId);
  const wUnit = prefs.default_weight_unit || 'kg';
  const mUnit = prefs.default_measurement_unit || 'cm';

  const rows = await measurementService.getCheckInMeasurementsByDateRange(
    userId,
    userId,
    startDate || '1970-01-01',
    endDate || '9999-12-31'
  );
  // The repository returns newest-first; MCP rendered oldest-first.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return [...rows].reverse().map((row: any) => ({
    ...row,
    weight: isSet(row.weight)
      ? convertWeight(Number(row.weight), 'kg', wUnit)
      : null,
    height: isSet(row.height)
      ? convertMeasurement(Number(row.height), 'cm', mUnit)
      : null,
    neck: isSet(row.neck)
      ? convertMeasurement(Number(row.neck), 'cm', mUnit)
      : null,
    waist: isSet(row.waist)
      ? convertMeasurement(Number(row.waist), 'cm', mUnit)
      : null,
    hips: isSet(row.hips)
      ? convertMeasurement(Number(row.hips), 'cm', mUnit)
      : null,
    weight_unit: wUnit,
    measurement_unit: mUnit,
  }));
}

export function buildCheckinTools(userId: string, tz: string) {
  return {
    sparky_manage_checkin: tool({
      description: `Health tracking: weight, steps, body measurements, mood, sleep, fasting, custom metrics.

Actions:
- log_biometrics(entry_date, weight?, steps?, height?, neck?, waist?, hips?, body_fat?, weight_unit?:"kg"|"lbs", height_unit?:"cm"|"in", measurements_unit?:"cm"|"in")
- log_mood(entry_date, mood_value:1-10, notes?)
- log_sleep(entry_date, duration_seconds?, sleep_score?:0-100, bedtime?, wake_time?, source?)
- log_fasting(start_time:ISO8601, end_time?, fasting_status?:"ACTIVE"|"COMPLETED"|"CANCELLED", fasting_type?)
- log_custom_metric(entry_date, category_name, value:string|number, unit?, notes?)
- create_category(category_name, unit?)
- list_categories()
- list_checkin_diary(entry_date?)
- get_fasting_status() — returns the currently active fasting session if any
- get_biometrics_history(start_date?, end_date?) — returns weight and measurements history`,
      inputSchema: manageCheckinInput,
      execute: async (rawArgs) => {
        const argsWithAction = { ...rawArgs };
        if (!argsWithAction.action) {
          if (argsWithAction.mood_value !== undefined) {
            argsWithAction.action = 'log_mood';
          } else if (
            argsWithAction.sleep_score !== undefined ||
            argsWithAction.duration_seconds !== undefined ||
            argsWithAction.bedtime !== undefined ||
            argsWithAction.wake_time !== undefined
          ) {
            argsWithAction.action = 'log_sleep';
          } else if (
            argsWithAction.start_time !== undefined ||
            argsWithAction.fasting_status !== undefined
          ) {
            argsWithAction.action = 'log_fasting';
          } else if (
            argsWithAction.category_name !== undefined &&
            argsWithAction.value !== undefined
          ) {
            argsWithAction.action = 'log_custom_metric';
          } else if (
            argsWithAction.weight !== undefined ||
            argsWithAction.steps !== undefined ||
            argsWithAction.height !== undefined ||
            argsWithAction.body_fat !== undefined ||
            argsWithAction.neck !== undefined ||
            argsWithAction.waist !== undefined ||
            argsWithAction.hips !== undefined
          ) {
            argsWithAction.action = 'log_biometrics';
          } else if (argsWithAction.category_name !== undefined) {
            argsWithAction.action = 'create_category';
          } else if (argsWithAction.start_date || argsWithAction.end_date) {
            argsWithAction.action = 'get_biometrics_history';
          } else if (argsWithAction.entry_date) {
            argsWithAction.action = 'list_checkin_diary';
          } else {
            argsWithAction.action = 'list_checkin_diary'; // fallback
          }
          log(
            'info',
            `[checkinTools] Inferred missing action as '${argsWithAction.action}'`
          );
        }

        // Default missing entry_date to 'today' for logging actions
        const loggingActions = [
          'log_biometrics',
          'log_mood',
          'log_sleep',
          'log_custom_metric',
        ];
        if (
          !process.env.VITEST &&
          !argsWithAction.entry_date &&
          loggingActions.includes(argsWithAction.action)
        ) {
          argsWithAction.entry_date = 'today';
        }

        const parsed = manageCheckinSchema.safeParse(
          normalizeDayKeywords(argsWithAction, tz)
        );
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: ManageCheckinInput = parsed.data;
        try {
          switch (args.action) {
            case 'log_biometrics': {
              const prefs = await preferenceService.getUserPreferences(
                userId,
                userId
              );
              const defaultWeightUnit = prefs.default_weight_unit || 'kg';
              const defaultMeasurementUnit =
                prefs.default_measurement_unit || 'cm';

              // Convert to standard units (kg, cm) for storage
              const mUnit = args.measurements_unit || defaultMeasurementUnit;
              const measurements: Record<string, number> = {};
              if (isSet(args.weight)) {
                measurements.weight = convertWeight(
                  args.weight,
                  args.weight_unit || defaultWeightUnit,
                  'kg'
                );
              }
              if (isSet(args.height)) {
                measurements.height = convertMeasurement(
                  args.height,
                  args.height_unit || defaultMeasurementUnit,
                  'cm'
                );
              }
              if (isSet(args.body_fat)) {
                measurements.body_fat_percentage = args.body_fat;
              }
              if (isSet(args.neck)) {
                measurements.neck = convertMeasurement(args.neck, mUnit, 'cm');
              }
              if (isSet(args.waist)) {
                measurements.waist = convertMeasurement(
                  args.waist,
                  mUnit,
                  'cm'
                );
              }
              if (isSet(args.hips)) {
                measurements.hips = convertMeasurement(args.hips, mUnit, 'cm');
              }
              if (isSet(args.steps)) {
                measurements.steps = args.steps;
              }

              await measurementService.upsertCheckInMeasurements(
                userId,
                userId,
                args.entry_date,
                measurements
              );

              const parts: string[] = [];
              if (isSet(args.weight))
                parts.push(`weight: ${args.weight}${args.weight_unit || 'kg'}`);
              if (isSet(args.steps)) parts.push(`steps: ${args.steps}`);
              if (isSet(args.height))
                parts.push(`height: ${args.height}${args.height_unit || 'cm'}`);
              if (isSet(args.body_fat))
                parts.push(`body fat: ${args.body_fat}%`);
              if (isSet(args.neck))
                parts.push(
                  `neck: ${args.neck}${args.measurements_unit || 'cm'}`
                );
              if (isSet(args.waist))
                parts.push(
                  `waist: ${args.waist}${args.measurements_unit || 'cm'}`
                );
              if (isSet(args.hips))
                parts.push(
                  `hips: ${args.hips}${args.measurements_unit || 'cm'}`
                );
              const summary =
                parts.length > 0 ? parts.join(', ') : 'no changes';
              return formatConfirmation(
                `Biometrics logged for ${args.entry_date} (${summary}).`
              );
            }

            case 'log_custom_metric': {
              const categories = await measurementService.getCustomCategories(
                userId,
                userId
              );
              const category = categories.find(
                (cat: any) =>
                  String(cat.name).toLowerCase() ===
                  args.category_name.toLowerCase()
              );
              if (!category) {
                return ERRORS.VALIDATION(
                  `Category "${args.category_name}" not found. Create it first using the create_category action.`
                );
              }
              await measurementService.upsertCustomMeasurementEntry(
                userId,
                userId,
                {
                  category_id: category.id,
                  value: String(args.value),
                  entry_date: args.entry_date,
                  notes: args.notes,
                }
              );
              return formatConfirmation(
                `Custom metric "${args.category_name}" logged: ${args.value}${args.unit ? ' ' + args.unit : ''} on ${args.entry_date}.`
              );
            }

            case 'list_categories': {
              const rows = await measurementService.getCustomCategories(
                userId,
                userId
              );
              const categories = rows
                .map((row: any) => ({
                  id: row.id,
                  category_name: row.name,
                  measurement_type: row.measurement_type,
                  created_at: row.created_at,
                }))
                .sort((a: any, b: any) =>
                  String(a.category_name).localeCompare(String(b.category_name))
                );
              return formatList(
                categories,
                'Custom Measurement Categories',
                (c: any) => `**${c.category_name}**\n  ID: ${c.id}`
              );
            }

            case 'create_category': {
              await measurementService.createCustomCategory(userId, userId, {
                name: args.category_name,
                measurement_type: args.unit || 'unit',
                data_type: args.data_type || 'numeric',
                frequency: 'Daily',
              });
              return formatConfirmation(
                `Category "${args.category_name}" created${args.unit ? ` with measurement type "${args.unit}"` : ''}.`
              );
            }

            case 'log_mood': {
              await moodRepository.createOrUpdateMoodEntry(
                userId,
                args.mood_value,
                args.notes || null,
                args.entry_date
              );
              return formatConfirmation(
                `Mood logged for ${args.entry_date}: ${args.mood_value}/10${args.notes ? ' — ' + args.notes : ''}.`
              );
            }

            case 'log_fasting': {
              const created = await fastingRepository.createFastingLog(
                userId,
                args.start_time,
                null,
                args.fasting_type || null
              );
              const status = args.fasting_status || 'ACTIVE';
              const updates: Record<string, string> = {};
              if (args.end_time) updates.end_time = args.end_time;
              if (status !== 'ACTIVE') updates.status = status;
              if (Object.keys(updates).length > 0) {
                await fastingRepository.updateFast(created.id, userId, updates);
              }
              return formatConfirmation(
                `Fasting window logged (${status})${args.fasting_type ? ' — ' + args.fasting_type : ''}.`
              );
            }

            case 'log_sleep': {
              let bedtime = args.bedtime;
              let wakeTime = args.wake_time;
              const duration = args.duration_seconds ?? 28800; // Default 8h

              if (!bedtime && !wakeTime) {
                // Default: wake time is 7 AM on entry_date in the user's
                // timezone, bedtime is 8h before. Local midnight + 7h is off
                // by the shifted hour on DST-transition days — acceptable for
                // a sleep-log default.
                const wake = new Date(
                  dayToUtcRange(args.entry_date, tz).start.getTime() +
                    7 * 3600 * 1000
                );
                const bed = new Date(wake.getTime() - duration * 1000);
                wakeTime = wake.toISOString();
                bedtime = bed.toISOString();
              } else if (!bedtime && wakeTime) {
                const wake = new Date(wakeTime);
                const bed = new Date(wake.getTime() - duration * 1000);
                bedtime = bed.toISOString();
              } else if (bedtime && !wakeTime) {
                const bed = new Date(bedtime);
                const wake = new Date(bed.getTime() + duration * 1000);
                wakeTime = wake.toISOString();
              }

              await measurementService.processSleepEntry(userId, userId, {
                entry_date: args.entry_date,
                bedtime,
                wake_time: wakeTime,
                duration_in_seconds: duration,
                source: args.source || 'manual',
              });

              const parts: string[] = [];
              if (isSet(args.duration_seconds)) {
                const hours = Math.floor(args.duration_seconds / 3600);
                const mins = Math.floor((args.duration_seconds % 3600) / 60);
                parts.push(`${hours}h ${mins}m`);
              }
              // args.sleep_score is accepted for schema parity but never
              // stored — processSleepEntry always computes its own score —
              // so it must not be echoed in the confirmation either.
              if (args.source) parts.push(`source: ${args.source}`);
              const summary = parts.length > 0 ? parts.join(', ') : 'recorded';
              return formatConfirmation(
                `Sleep logged for ${args.entry_date} (${summary}).`
              );
            }

            case 'list_checkin_diary': {
              const date = args.entry_date || todayInZone(tz);
              const dateLabel = args.entry_date || 'today';

              const bioRow = await measurementService.getCheckInMeasurements(
                userId,
                userId,
                date
              );
              const moodEntry = await moodRepository.getMoodEntryByDate(
                userId,
                date
              );
              const sleepRows =
                await sleepRepository.getSleepEntriesByUserIdAndDateRange(
                  userId,
                  date,
                  date
                );
              const fastRows =
                await fastingRepository.getFastingLogsOverlappingDay(
                  userId,
                  date,
                  tz
                );
              const customRows =
                await measurementService.getCustomMeasurementEntriesByDate(
                  userId,
                  userId,
                  date
                );
              const prefs = await preferenceService.getUserPreferences(
                userId,
                userId
              );
              const wUnit = prefs.default_weight_unit || 'kg';
              const mUnit = prefs.default_measurement_unit || 'cm';

              let bio: Record<string, any> | null =
                bioRow && Object.keys(bioRow).length > 0 ? bioRow : null;
              if (bio) {
                bio = {
                  ...bio,
                  weight: isSet(bio.weight)
                    ? convertWeight(Number(bio.weight), 'kg', wUnit)
                    : null,
                  height: isSet(bio.height)
                    ? convertMeasurement(Number(bio.height), 'cm', mUnit)
                    : null,
                  neck: isSet(bio.neck)
                    ? convertMeasurement(Number(bio.neck), 'cm', mUnit)
                    : null,
                  waist: isSet(bio.waist)
                    ? convertMeasurement(Number(bio.waist), 'cm', mUnit)
                    : null,
                  hips: isSet(bio.hips)
                    ? convertMeasurement(Number(bio.hips), 'cm', mUnit)
                    : null,
                  weight_unit: wUnit,
                  measurement_unit: mUnit,
                };
              }

              const moods = moodEntry ? [moodEntry] : [];
              const sleeps = [...sleepRows]
                .sort(
                  (a: any, b: any) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                )
                .map((row: any) => ({
                  ...row,
                  duration_seconds: row.duration_in_seconds,
                  bedtime: row.bedtime
                    ? new Date(row.bedtime).toISOString()
                    : null,
                  wake_time: row.wake_time
                    ? new Date(row.wake_time).toISOString()
                    : null,
                }));
              const fasts = fastRows.map((row: any) => ({
                id: row.id,
                start_time: row.start_time
                  ? new Date(row.start_time).toISOString()
                  : null,
                end_time: row.end_time
                  ? new Date(row.end_time).toISOString()
                  : null,
                fasting_status: row.status,
                fasting_type: row.fasting_type,
              }));
              const customs = [...customRows]
                .map((row: any) => ({
                  id: row.id,
                  category_name: row.custom_categories?.name,
                  value: row.value,
                  measurement_type: row.custom_categories?.measurement_type,
                  notes: row.notes,
                  entry_date: row.entry_date,
                  created_at: row.created_at,
                }))
                .sort(
                  (a: any, b: any) =>
                    String(a.category_name).localeCompare(
                      String(b.category_name)
                    ) ||
                    new Date(a.created_at).getTime() -
                      new Date(b.created_at).getTime()
                );

              let text = `### Check-in Diary: ${dateLabel}\n\n`;

              // Biometrics
              if (bio) {
                const b = bio;
                const bw = b.weight_unit || 'kg';
                const bm = b.measurement_unit || 'cm';

                text += '#### Biometrics\n';
                if (b.weight) text += `- **Weight:** ${b.weight} ${bw}\n`;
                if (b.height) text += `- **Height:** ${b.height} ${bm}\n`;
                if (b.steps) text += `- **Steps:** ${b.steps}\n`;
                if (b.body_fat_percentage)
                  text += `- **Body Fat:** ${b.body_fat_percentage}%\n`;
                if (b.neck) text += `- **Neck:** ${b.neck} ${bm}\n`;
                if (b.waist) text += `- **Waist:** ${b.waist} ${bm}\n`;
                if (b.hips) text += `- **Hips:** ${b.hips} ${bm}\n`;
                text += '\n';
              }

              // Mood
              if (moods.length > 0) {
                text += '## Mood\n';
                for (const m of moods) {
                  text += `- ${m.mood_value}/10`;
                  if (m.notes) text += ` — ${m.notes}`;
                  text += '\n';
                }
                text += '\n';
              }

              // Sleep
              if (sleeps.length > 0) {
                text += '## Sleep\n';
                for (const s of sleeps) {
                  const parts: string[] = [];
                  if (isSet(s.duration_seconds)) {
                    const hours = Math.floor(s.duration_seconds / 3600);
                    const mins = Math.floor((s.duration_seconds % 3600) / 60);
                    parts.push(`${hours}h ${mins}m`);
                  }
                  if (isSet(s.sleep_score))
                    parts.push(`score: ${s.sleep_score}/100`);
                  if (s.bedtime) parts.push(`bed: ${s.bedtime}`);
                  if (s.wake_time) parts.push(`wake: ${s.wake_time}`);
                  if (s.source) parts.push(`(${s.source})`);
                  text += `- ${parts.join(' | ')}\n`;
                }
                text += '\n';
              }

              // Fasting
              if (fasts.length > 0) {
                text += '## Fasting\n';
                for (const f of fasts) {
                  let line = `- ${f.fasting_status || 'ACTIVE'}`;
                  if (f.fasting_type) line += ` (${f.fasting_type})`;
                  line += `: ${f.start_time}`;
                  if (f.end_time) line += ` → ${f.end_time}`;
                  text += line + '\n';
                }
                text += '\n';
              }

              // Custom metrics
              if (customs.length > 0) {
                text += '## Custom Metrics\n';
                for (const c of customs) {
                  let line = `- **${c.category_name}**: ${c.value}`;
                  if (c.notes) line += ` — ${c.notes}`;
                  text += line + '\n';
                }
                text += '\n';
              }

              // Check if empty
              if (
                !bio &&
                moods.length === 0 &&
                sleeps.length === 0 &&
                fasts.length === 0 &&
                customs.length === 0
              ) {
                text += 'No check-in data found for this date.\n';
              }

              return text;
            }

            case 'get_fasting_status': {
              const fast = await fastingRepository.getCurrentFast(userId);
              if (!fast) {
                return 'No active fasting session.';
              }
              return formatSuccess(
                {
                  id: fast.id,
                  user_id: fast.user_id,
                  start_time: fast.start_time,
                  end_time: fast.end_time,
                  fasting_status: fast.status,
                  fasting_type: fast.fasting_type,
                  created_at: fast.created_at,
                },
                'Fasting Status'
              );
            }

            case 'get_biometrics_history': {
              const history = await getBiometricsHistoryRows(
                userId,
                args.start_date,
                args.end_date
              );
              return formatList(history, 'Biometrics History', (h: any) => {
                const hw = h.weight_unit || 'kg';
                let text = `**${h.entry_date}**: `;
                if (h.weight) text += `Weight: ${h.weight}${hw} `;
                if (h.body_fat_percentage)
                  text += `| BF: ${h.body_fat_percentage}% `;
                if (h.steps) text += `| Steps: ${h.steps}`;
                return text;
              });
            }

            default:
              return ERRORS.INVALID_ACTION(
                String((args as any).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Checkin Tool] Error:', error);
          if (error instanceof Error && error.message.includes('not found')) {
            return ERRORS.VALIDATION(error.message);
          }
          return ERRORS.DB_ERROR();
        }
      },
    }),
  };
}
