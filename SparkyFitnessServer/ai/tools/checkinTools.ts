import { tool } from 'ai';
import {
  addDays,
  dayToUtcRange,
  instantForDay,
  todayInZone,
  utcOffsetMinutesFromIsoString,
  BUILT_IN_MOODS,
  chatScoreToMoodValue,
  moodValueToChatScore,
  instantHourMinute,
  instantHourMinuteInZone,
  instantToDay,
  instantToDayWithOffset,
  resolveRecordZone,
  type RecordZone,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import measurementService from '../../services/measurementService.js';
import { CustomCategoryExistsError } from '../../utils/errors.js';
import preferenceService from '../../services/preferenceService.js';
import moodRepository, {
  hasMoodContent,
  type MoodEntryRow,
} from '../../models/moodRepository.js';
import fastingRepository from '../../models/fastingRepository.js';
import fastingAutoCalculationService from '../../services/fastingAutoCalculationService.js';
import sleepRepository from '../../models/sleepRepository.js';
import * as oralCareService from '../../services/oralCareService.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeActionArgs } from './dates.js';
import {
  formatConfirmation,
  formatJsonResult,
  formatList,
  formatSuccess,
} from './formatting.js';
import { NOTE_PREVIEW_LIMIT, truncateIfNeeded } from './truncation.js';
import { convertWeight, convertMeasurement } from './unitConversion.js';
import {
  manageCheckinSchema,
  manageCheckinInput,
  type ManageCheckinInput,
} from './schemas/checkin.js';

interface BiometricsRow {
  entry_date: string;
  weight?: number | string | null;
  height?: number | string | null;
  neck?: number | string | null;
  waist?: number | string | null;
  hips?: number | string | null;
  steps?: number | null;
  body_fat_percentage?: number | string | null;
  [key: string]: unknown;
}

interface CustomCategoryRow {
  id: string;
  name: string;
  measurement_type: string;
  created_at?: string | Date;
}

interface SleepEntryRow {
  created_at: string | Date;
  duration_in_seconds?: number;
  bedtime?: string | null;
  wake_time?: string | null;
  source?: string;
  sleep_score?: number | null;
  record_timezone?: string | null;
  record_utc_offset_minutes?: number | null;
  [key: string]: unknown;
}

interface FastingLogRow {
  id: string;
  start_time?: string | null;
  end_time?: string | null;
  status?: string;
  fasting_type?: string | null;
  [key: string]: unknown;
}

interface CustomMeasurementEntryRow {
  id: string;
  custom_categories?: {
    name?: string;
    display_name?: string | null;
    measurement_type?: string;
  } | null;
  value?: string | number | null;
  notes?: string;
  entry_date?: string;
  created_at?: string | Date;
  [key: string]: unknown;
}

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
  'get_custom_metrics_history',
  'get_oral_care_summary',
];

// Optional inputs and nullable DB columns are treated alike: absent.
function isSet<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function formatMoodRatings(
  energy?: number | null,
  focus?: number | null
): string {
  let out = '';
  if (isSet(energy)) out += `, energy ${energy}/5`;
  if (isSet(focus)) out += `, focus ${focus}/5`;
  return out;
}

function formatClock(ts: Date | string, tz: string): string {
  const { hour, minute } = instantHourMinute(ts, tz);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// `YYYY-MM-DD HH:MM` in `zone`. Models read a bare UTC instant as local time,
// so times handed to them are converted first; the day is kept because a
// bedtime or a fast often starts the day before.
function formatLocalDateTime(ts: Date | string, zone: RecordZone): string {
  const day =
    zone.kind === 'tz'
      ? instantToDay(ts, zone.tz)
      : instantToDayWithOffset(ts, zone.minutes);
  const { hour, minute } = instantHourMinuteInZone(ts, zone);
  return `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Integrations store whole-day series as one text metric (Garmin's "Raw Stress
// Data" is ~20 KB a day, measurement type "JSON"). Only charts use them; in a
// tool result they crowd out everything else, so they are left out.
const RAW_SERIES_PLACEHOLDER = '(raw data series, not shown)';
const RAW_SERIES_MIN_LENGTH = 200;

function isRawSeries(value: unknown, measurementType?: string): boolean {
  if (measurementType?.toUpperCase() === 'JSON') return true;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text.length > RAW_SERIES_MIN_LENGTH && /^[[{]/.test(text);
}

// A custom metric value as the model should see it: raw series left out, long
// decimals rounded, long text cut short.
function formatCustomValue(value: unknown, measurementType?: string): string {
  if (!isSet(value)) return '';
  if (isRawSeries(value, measurementType)) return RAW_SERIES_PLACEHOLDER;
  const text = String(value).trim();
  if (/^-?\d+\.\d{3,}$/.test(text)) {
    const rounded = Math.round(Number(text) * 100) / 100;
    if (Number.isFinite(rounded)) return String(rounded);
  }
  if (text.length > NOTE_PREVIEW_LIMIT) {
    return `${text.slice(0, NOTE_PREVIEW_LIMIT)}… (truncated)`;
  }
  return text;
}

// The zone a time was shown in, for a line whose zone is not the profile's:
// the IANA name, else the fixed offset as UTC+HH:MM.
function zoneLabel(zone: RecordZone): string {
  if (zone.kind === 'tz') return zone.tz;
  const sign = zone.minutes < 0 ? '-' : '+';
  const abs = Math.abs(zone.minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Unit suffix for a custom metric; categories without a real unit store "N/A".
function customUnit(measurementType?: string): string {
  if (!measurementType) return '';
  const unit = measurementType.trim();
  if (!unit || unit.toUpperCase() === 'N/A' || unit.toUpperCase() === 'JSON')
    return '';
  return ` ${unit}`;
}

// `<score>/10<ratings><tags>` followed by ` — notes` when there are notes. The
// score is omitted for a check-in with no mood, so the ratings' leading ", " is
// dropped. Each part carries its own leading space, so any may be absent.
function formatCheckinDetail(row: MoodEntryRow): string {
  const score =
    row.mood_value === null ? '' : `${moodValueToChatScore(row.mood_value)}/10`;
  const body =
    `${score}${formatMoodRatings(row.energy_value, row.focus_value)}${formatMoodTags(row.mood_tags)}`
      .replace(/^, /, '')
      .trim();
  return `${body ? ' ' + body : ''}${row.notes ? ' — ' + row.notes : ''}`;
}

function formatMoodTags(tags?: string[] | null): string {
  if (!tags || !tags.length) return '';
  const formatted = tags.map((t) => {
    const matched = BUILT_IN_MOODS.find(
      (m) => m.name.toLowerCase() === t.toLowerCase()
    );
    if (matched) {
      return `${matched.emoji} ${matched.displayName}`;
    }
    return t; // fallback if it is a custom tag or not found
  });
  return ` [${formatted.join(', ')}]`;
}

// Biometrics rows converted into the user's preferred units, oldest-first —
// MCP's getBiometricsHistory row shape. Shared with the report tools.
export async function getBiometricsHistoryRows(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<BiometricsRow[]> {
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
  return [...rows].reverse().map((row: BiometricsRow) => ({
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
      description: `Health tracking: weight, steps, body measurements, mood (with optional energy and focus), sleep, fasting, custom metrics.

Actions:
- log_biometrics(entry_date, weight?, steps?, height?, neck?, waist?, hips?, body_fat?, muscle_mass?, bone_mass?, body_water?, bmr?, weight_unit?:"kg"|"lbs", height_unit?:"cm"|"in", measurements_unit?:"cm"|"in")
- log_mood(entry_date?, mood_value?:1-10, energy_value?:1-5, focus_value?:1-5, notes?, mood_tags?) -- each call logs a NEW check-in (several per day are fine); every field is optional but at least one is required
- log_sleep(entry_date, duration_seconds?, sleep_score?:0-100, bedtime?, wake_time?, source?)
- log_fasting(start_time:ISO8601, end_time?, fasting_status?:"ACTIVE"|"COMPLETED"|"CANCELLED", fasting_type?)
- log_custom_metric(entry_date, category_name, value:string|number, unit?, notes?)
- create_category(category_name, unit?)
- list_categories()
- list_checkin_diary(entry_date?)
- get_fasting_status() — returns the currently active fasting session if any
- get_biometrics_history(start_date?, end_date?) — returns standard measurement history
- get_custom_metrics_history(start_date?, end_date?, category_name?) — custom metric values by day, newest first; category_name keeps one metric (if several share that display name, the reply lists their stored names)
- get_oral_care_summary(start_date?, end_date?) — brushing per day against the daily goal, other oral care (flossing, mouthwash, ...) and the streak; defaults to the last 7 days. A brush logged in Sparky that a synced toothbrush also recorded counts once`,
      inputSchema: manageCheckinInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args) => {
            if (
              args.mood_value !== undefined ||
              args.energy_value !== undefined ||
              args.focus_value !== undefined ||
              (args.notes !== undefined && args.category_name === undefined)
            ) {
              return 'log_mood';
            }
            if (
              args.sleep_score !== undefined ||
              args.duration_seconds !== undefined ||
              args.bedtime !== undefined ||
              args.wake_time !== undefined
            ) {
              return 'log_sleep';
            }
            if (
              args.start_time !== undefined ||
              args.fasting_status !== undefined
            ) {
              return 'log_fasting';
            }
            if (args.category_name !== undefined && args.value !== undefined) {
              return 'log_custom_metric';
            }
            if (
              args.weight !== undefined ||
              args.steps !== undefined ||
              args.height !== undefined ||
              args.body_fat !== undefined ||
              args.neck !== undefined ||
              args.waist !== undefined ||
              args.hips !== undefined ||
              args.muscle_mass !== undefined ||
              args.bone_mass !== undefined ||
              args.body_water !== undefined ||
              args.bmr !== undefined
            ) {
              return 'log_biometrics';
            }
            if (args.category_name !== undefined) {
              return 'create_category';
            }
            if (args.start_date || args.end_date) {
              return 'get_biometrics_history';
            }
            if (args.entry_date) {
              return 'list_checkin_diary';
            }
            return 'list_checkin_diary'; // fallback
          }
        ) as Record<string, unknown>;

        // Default missing entry_date to today's date string for logging actions
        const loggingActions = [
          'log_biometrics',
          'log_mood',
          'log_sleep',
          'log_custom_metric',
        ];
        if (
          normalized.entry_date === undefined &&
          loggingActions.includes(normalized.action as string)
        ) {
          normalized.entry_date = todayInZone(tz);
        }

        const parsed = manageCheckinSchema.safeParse(normalized);
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

              // Convert to standard units (kg, cm) for storage. These resolved
              // units are also what the confirmation text reports: falling back
              // to a literal 'kg'/'cm' there would tell the user a different
              // unit than the one the value was actually interpreted as.
              const mUnit = args.measurements_unit || defaultMeasurementUnit;
              const wUnit = args.weight_unit || defaultWeightUnit;
              const hUnit = args.height_unit || defaultMeasurementUnit;
              const measurements: Record<string, number> = {};
              if (isSet(args.weight)) {
                measurements.weight = convertWeight(args.weight, wUnit, 'kg');
              }
              if (isSet(args.height)) {
                measurements.height = convertMeasurement(
                  args.height,
                  hUnit,
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
              // Smart-scale composition. Masses are stored in kg like weight;
              // body water is already a percentage and needs no conversion.
              if (isSet(args.muscle_mass)) {
                measurements.muscle_mass_kg = convertWeight(
                  args.muscle_mass,
                  wUnit,
                  'kg'
                );
              }
              if (isSet(args.bone_mass)) {
                measurements.bone_mass_kg = convertWeight(
                  args.bone_mass,
                  wUnit,
                  'kg'
                );
              }
              if (isSet(args.body_water)) {
                measurements.body_water_percentage = args.body_water;
              }
              if (isSet(args.bmr)) {
                measurements.bmr = args.bmr;
              }

              await measurementService.upsertCheckInMeasurements(
                userId,
                userId,
                args.entry_date,
                measurements
              );

              const parts: string[] = [];
              if (isSet(args.weight))
                parts.push(`weight: ${args.weight}${wUnit}`);
              if (isSet(args.steps)) parts.push(`steps: ${args.steps}`);
              if (isSet(args.height))
                parts.push(`height: ${args.height}${hUnit}`);
              if (isSet(args.body_fat))
                parts.push(`body fat: ${args.body_fat}%`);
              if (isSet(args.neck)) parts.push(`neck: ${args.neck}${mUnit}`);
              if (isSet(args.waist)) parts.push(`waist: ${args.waist}${mUnit}`);
              if (isSet(args.hips)) parts.push(`hips: ${args.hips}${mUnit}`);
              if (isSet(args.muscle_mass))
                parts.push(`muscle mass: ${args.muscle_mass}${wUnit}`);
              if (isSet(args.bone_mass))
                parts.push(`bone mass: ${args.bone_mass}${wUnit}`);
              if (isSet(args.body_water))
                parts.push(`body water: ${args.body_water}%`);
              if (isSet(args.bmr)) parts.push(`bmr: ${args.bmr}kcal`);
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
                (cat: CustomCategoryRow) =>
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
              interface MappedCategoryRow {
                id: string;
                category_name: string;
                measurement_type: string;
                created_at?: string | Date;
              }
              const categories = rows
                .map((row: CustomCategoryRow) => ({
                  id: row.id,
                  category_name: row.name,
                  measurement_type: row.measurement_type,
                  created_at: row.created_at,
                }))
                .sort((a: MappedCategoryRow, b: MappedCategoryRow) =>
                  String(a.category_name).localeCompare(String(b.category_name))
                );
              return formatList(
                categories,
                'Custom Measurement Categories',
                (c: MappedCategoryRow) =>
                  `**${c.category_name}**\n  ID: ${c.id}`
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
              const checkin = {
                // The tool speaks in 1-10; the column holds 10-100.
                moodValue:
                  args.mood_value === undefined
                    ? null
                    : chatScoreToMoodValue(args.mood_value),
                notes: args.notes?.trim() || null,
                moodTags: args.mood_tags || null,
                energyValue: args.energy_value,
                focusValue: args.focus_value,
              };
              if (!hasMoodContent(checkin)) {
                return ERRORS.VALIDATION(
                  'A check-in needs at least one of mood, energy, focus, notes or tags.'
                );
              }
              const row = await moodRepository.createCheckin(userId, {
                ...checkin,
                entryDate: args.entry_date,
                // Now for today; local noon for another day, so the time
                // stays on the day it was logged for.
                entryTimestamp: instantForDay(args.entry_date, tz),
              });
              return formatConfirmation(
                `Check-in logged for ${args.entry_date} at ${formatClock(row.entry_timestamp, tz)}:${formatCheckinDetail(row)}.`
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
              // An explicit ±HH:MM suffix on a caller-supplied timestamp is a
              // recording-zone claim worth stamping; generated defaults are
              // profile-tz wall clocks and stay unstamped (Z suffix → null).
              const recordUtcOffsetMinutes =
                utcOffsetMinutesFromIsoString(args.bedtime) ??
                utcOffsetMinutesFromIsoString(args.wake_time);

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

              if (!bedtime || !wakeTime) {
                throw new Error('Could not resolve bedtime and wake time.');
              }

              await measurementService.processSleepEntry(userId, userId, {
                entry_date: args.entry_date,
                bedtime,
                wake_time: wakeTime,
                duration_in_seconds: duration,
                source: args.source || 'manual',
                record_utc_offset_minutes: recordUtcOffsetMinutes ?? undefined,
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

              // A daily diary must show only values measured on that day.
              // getCheckInMeasurements carries older values forward for web/mobile
              // editors, which would otherwise mislabel their source date here.
              const exactBiometricRows =
                await measurementService.getCheckInMeasurementsByDateRange(
                  userId,
                  userId,
                  date,
                  date
                );
              const bioRow = exactBiometricRows[0] ?? null;
              const checkins = await moodRepository.getCheckinsForDate(
                userId,
                date
              );
              // A derived mood (Garmin, import) only stands in when no manual
              // check-in that day has a mood.
              const hasManualMood = checkins.some((c) => c.mood_value !== null);
              const legacyMood = hasManualMood
                ? undefined
                : await moodRepository.getLegacyMoodEntryForDate(userId, date);
              const derivedMood =
                legacyMood && legacyMood.source !== 'manual'
                  ? legacyMood
                  : undefined;
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

              let bio: BiometricsRow | null =
                bioRow && Object.keys(bioRow).length > 0
                  ? (bioRow as BiometricsRow)
                  : null;
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

              const sleeps = [...sleepRows]
                .sort(
                  (a: SleepEntryRow, b: SleepEntryRow) =>
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                )
                .map((row: SleepEntryRow) => {
                  // A night is shown in the zone it was recorded in, as the
                  // web sleep views do; else the profile zone.
                  const zone: RecordZone = resolveRecordZone(
                    row.record_timezone,
                    row.record_utc_offset_minutes
                  ) ?? { kind: 'tz', tz };
                  return {
                    ...row,
                    // Named only when it differs from the profile zone, so
                    // the usual line stays short.
                    zone_label:
                      zone.kind === 'tz' && zone.tz === tz
                        ? null
                        : zoneLabel(zone),
                    duration_seconds: row.duration_in_seconds,
                    bedtime: row.bedtime
                      ? formatLocalDateTime(row.bedtime, zone)
                      : null,
                    wake_time: row.wake_time
                      ? formatLocalDateTime(row.wake_time, zone)
                      : null,
                  };
                });
              const profileZone: RecordZone = { kind: 'tz', tz };
              const fasts = fastRows.map((row: FastingLogRow) => ({
                id: row.id,
                start_time: row.start_time
                  ? formatLocalDateTime(row.start_time, profileZone)
                  : null,
                end_time: row.end_time
                  ? formatLocalDateTime(row.end_time, profileZone)
                  : null,
                fasting_status: row.status,
                fasting_type: row.fasting_type,
              }));
              interface MappedCustomMetric {
                id: string;
                category_name?: string;
                value?: string | number | null;
                measurement_type?: string;
                notes?: string;
                entry_date?: string;
                created_at?: string | Date;
              }
              const customs = [...customRows]
                .map((row: CustomMeasurementEntryRow): MappedCustomMetric => ({
                  id: row.id,
                  category_name: row.custom_categories?.name,
                  value: row.value,
                  measurement_type: row.custom_categories?.measurement_type,
                  notes: row.notes,
                  entry_date: row.entry_date,
                  created_at: row.created_at,
                }))
                .sort(
                  (a: MappedCustomMetric, b: MappedCustomMetric) =>
                    String(a.category_name).localeCompare(
                      String(b.category_name)
                    ) ||
                    new Date(a.created_at || 0).getTime() -
                      new Date(b.created_at || 0).getTime()
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
              if (checkins.length > 0 || derivedMood) {
                text += '## Mood\n';
                for (const c of checkins) {
                  text += `- ${formatClock(c.entry_timestamp, tz)}${formatCheckinDetail(c)}\n`;
                }
                if (derivedMood) {
                  text += `- Derived mood (${derivedMood.source}): ${moodValueToChatScore(derivedMood.mood_value)}/10\n`;
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
                  if (s.zone_label && (s.bedtime || s.wake_time))
                    parts.push(`times in ${s.zone_label}`);
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
                  let line = `- **${c.category_name}**: ${formatCustomValue(c.value, c.measurement_type)}`;
                  if (c.notes) line += ` — ${c.notes}`;
                  text += line + '\n';
                }
                text += '\n';
              }

              // Check if empty
              if (
                !bio &&
                checkins.length === 0 &&
                !derivedMood &&
                sleeps.length === 0 &&
                fasts.length === 0 &&
                customs.length === 0
              ) {
                text += 'No check-in data found for this date.\n';
              }

              return text;
            }

            case 'get_fasting_status': {
              let fast = await fastingRepository.getCurrentFast(userId);
              let isAuto = false;
              let isEatingWindow = false;
              let eatingWindowRemainingMinutes: number | undefined;
              let startMealName: string | undefined;

              if (!fast) {
                try {
                  const autoFast =
                    await fastingAutoCalculationService.getCurrentAutoFast(
                      userId,
                      tz
                    );
                  if (autoFast) {
                    isAuto = true;
                    startMealName = autoFast.start_meal_name;
                    isEatingWindow = Boolean(autoFast.is_eating_window);
                    eatingWindowRemainingMinutes =
                      autoFast.eating_window_remaining_minutes;
                    fast = {
                      id: autoFast.id,
                      user_id: autoFast.user_id,
                      start_time: autoFast.start_time,
                      end_time: autoFast.end_time,
                      status: autoFast.status,
                      fasting_type: autoFast.fasting_type,
                      created_at: new Date(autoFast.start_time),
                    } as unknown as typeof fast;
                  }
                } catch {
                  // Fall back gracefully if auto-calculation cannot query
                }
              }

              if (!fast) {
                return 'No active fasting session.';
              }
              return formatSuccess(
                {
                  id: fast.id,
                  user_id: fast.user_id,
                  start_time: fast.start_time,
                  end_time: fast.end_time,
                  fasting_status: isEatingWindow
                    ? 'EATING_WINDOW'
                    : fast.status,
                  fasting_type: fast.fasting_type,
                  created_at: fast.created_at,
                  ...(isAuto ? { is_auto_calculated: true } : {}),
                  ...(startMealName ? { start_meal_name: startMealName } : {}),
                  ...(isEatingWindow
                    ? {
                        is_eating_window: true,
                        eating_window_remaining_minutes:
                          eatingWindowRemainingMinutes,
                      }
                    : {}),
                },
                'Fasting Status'
              );
            }

            case 'get_biometrics_history': {
              const startDate = args.start_date || '1970-01-01';
              const endDate = args.end_date || '9999-12-31';
              const [history, customMeasurements] = await Promise.all([
                getBiometricsHistoryRows(userId, startDate, endDate),
                measurementService.getCustomMeasurementEntriesByDateRange(
                  userId,
                  userId,
                  startDate,
                  endDate
                ),
              ]);
              return formatJsonResult({
                start_date: startDate,
                end_date: endDate,
                standard_measurements: history.map((measurement) => ({
                  ...measurement,
                  measurement_type: 'standard',
                  value_date: measurement.entry_date,
                })),
                custom_measurements: customMeasurements.map(
                  (measurement: CustomMeasurementEntryRow) => ({
                    ...measurement,
                    ...(isRawSeries(
                      measurement.value,
                      measurement.custom_categories?.measurement_type
                    )
                      ? { value: RAW_SERIES_PLACEHOLDER }
                      : {}),
                    value_date: measurement.entry_date,
                  })
                ),
              });
            }

            case 'get_oral_care_summary': {
              const endDate = args.end_date || todayInZone(tz);
              const startDate = args.start_date || addDays(endDate, -6);
              if (startDate > endDate) {
                return ERRORS.VALIDATION(
                  'start_date must not be after end_date.'
                );
              }
              const clampedStart =
                addDays(startDate, oralCareService.MAX_HISTORY_DAYS - 1) <
                endDate
                  ? addDays(endDate, -(oralCareService.MAX_HISTORY_DAYS - 1))
                  : startDate;
              const history = await oralCareService.getHistory(
                userId,
                userId,
                clampedStart,
                endDate
              );
              return formatJsonResult({
                start_date: clampedStart,
                end_date: endDate,
                daily_brushing_goal: history.settings.daily_target,
                target_seconds_per_brush: history.settings.target_seconds,
                current_streak_days: history.streak,
                best_streak_days: history.best_streak,
                days: history.days,
              });
            }

            case 'get_custom_metrics_history': {
              const history: CustomMeasurementEntryRow[] =
                await measurementService.getCustomMeasurementEntriesByDateRange(
                  userId,
                  userId,
                  args.start_date || '1970-01-01',
                  args.end_date || '9999-12-31'
                );
              const requested = args.category_name?.trim();
              const wanted = requested?.toLowerCase();
              // Narrowest match first: the exact stored name, then the stored
              // name in any case, then the display name (one category's
              // display name can equal another's stored name).
              const storedName = (row: CustomMeasurementEntryRow) =>
                row.custom_categories?.name?.trim() ?? '';
              const exact = history.filter(
                (row) => storedName(row) === requested
              );
              const anyCase = history.filter(
                (row) => storedName(row).toLowerCase() === wanted
              );
              const byDisplay = history.filter(
                (row) =>
                  row.custom_categories?.display_name?.trim().toLowerCase() ===
                  wanted
              );
              const rows = !wanted
                ? history
                : exact.length > 0
                  ? exact
                  : anyCase.length > 0
                    ? anyCase
                    : byDisplay;
              // Several categories still match (shared display name, or stored
              // names differing only in case): ask for one rather than mixing
              // their values under one label.
              const storedNames = [...new Set(rows.map(storedName))];
              if (wanted && storedNames.length > 1) {
                return truncateIfNeeded(
                  `# Custom Metrics History\n\nSeveral metrics match "${requested}": ${storedNames.join(', ')}. Ask again with one of these names as category_name.`,
                  'Ask again with the stored name of one metric as category_name.'
                );
              }
              if (rows.length === 0) {
                return `# Custom Metrics History\n\nNo custom metrics found${
                  args.category_name ? ` for "${args.category_name}"` : ''
                } in this range.`;
              }

              // One compact line per value, newest day first, so truncation
              // drops the oldest days rather than the ones being asked about.
              // The repository returns oldest first; keep each day's own order.
              const byDay = new Map<string, string[]>();
              for (const row of rows) {
                const day = String(row.entry_date);
                const category = row.custom_categories;
                const label =
                  category?.display_name?.trim() ||
                  category?.name?.trim() ||
                  'Unknown';
                const value = formatCustomValue(
                  row.value,
                  category?.measurement_type
                );
                const unit =
                  value === RAW_SERIES_PLACEHOLDER
                    ? ''
                    : customUnit(category?.measurement_type);
                const lines = byDay.get(day) ?? [];
                lines.push(`- ${label}: ${value}${unit}`);
                byDay.set(day, lines);
              }
              const body = [...byDay.entries()]
                .sort(([a], [b]) => b.localeCompare(a))
                .map(([day, lines]) => `## ${day}\n${lines.join('\n')}`)
                .join('\n\n');
              return truncateIfNeeded(
                `# Custom Metrics History\n\n${body}`,
                'Older days were left out. Pass start_date and end_date, or category_name, to narrow the history.',
                'full',
                true
              );
            }

            default: {
              const actionStr = String(
                (args as Record<string, unknown>).action || 'unknown'
              );
              return ERRORS.INVALID_ACTION(actionStr, VALID_ACTIONS);
            }
          }
        } catch (error) {
          log('error', '[Checkin Tool] Error:', error);
          if (
            error instanceof CustomCategoryExistsError ||
            (error instanceof Error && error.message.includes('not found'))
          ) {
            return ERRORS.VALIDATION(error.message);
          }
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
