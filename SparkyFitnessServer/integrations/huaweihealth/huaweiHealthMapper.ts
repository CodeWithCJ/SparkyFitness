import { instantToDayWithOffset } from '@workspace/shared';
import type {
  HuaweiActivitiesResponse,
  HuaweiDailySummaryResponse,
  HuaweiSleepRecordsResponse,
  HuaweiValue,
} from './huaweiHealthApiSchemas.js';

const SOURCE = 'HUAWEI Health';

export interface HuaweiNormalizedHealthEntry {
  type: string;
  source: typeof SOURCE;
  date?: string;
  timestamp?: string;
  value?: number;
  unit?: string;
  source_id?: string;
  record_utc_offset_minutes?: number;
  [key: string]: unknown;
}

interface HuaweiDailyBase {
  source: typeof SOURCE;
  date: string;
  timestamp: string;
  record_utc_offset_minutes: number;
}

function numericValue(value: HuaweiValue | undefined): number | null {
  if (!value) return null;
  const candidate =
    value.integerValue ??
    value.floatValue ??
    value.longValue ??
    value.doubleValue;
  if (candidate === undefined) return null;
  const numeric = Number(candidate);
  return Number.isFinite(numeric) ? numeric : null;
}

function fields(values: HuaweiValue[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const value of values) {
    const numeric = numericValue(value);
    if (numeric !== null) result.set(value.fieldName, numeric);
  }
  return result;
}

function asMilliseconds(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function baseDailyEntry(
  startTime: number | string,
  utcOffsetMinutes: number
): HuaweiDailyBase | null {
  const startMs = asMilliseconds(startTime);
  if (startMs === null) return null;
  const timestamp = new Date(startMs);
  if (Number.isNaN(timestamp.getTime())) return null;
  return {
    source: SOURCE,
    date: instantToDayWithOffset(timestamp, utcOffsetMinutes),
    timestamp: timestamp.toISOString(),
    record_utc_offset_minutes: utcOffsetMinutes,
  };
}

function scalarEntry(
  base: HuaweiDailyBase,
  type: string,
  value: number | undefined,
  unit: string
): HuaweiNormalizedHealthEntry | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return { ...base, type, value, unit };
}

export function mapHuaweiDailySummary(
  response: HuaweiDailySummaryResponse,
  utcOffsetMinutes: number
): HuaweiNormalizedHealthEntry[] {
  const entries: HuaweiNormalizedHealthEntry[] = [];
  for (const group of response.group) {
    const base = baseDailyEntry(group.startTime, utcOffsetMinutes);
    if (!base) continue;

    for (const samplePoint of group.sampleSet.flatMap(
      (sampleSet) => sampleSet.samplePoints
    )) {
      const pointFields = fields(samplePoint.value);
      const candidates: Array<HuaweiNormalizedHealthEntry | null> = [];
      switch (samplePoint.dataTypeName) {
        case 'com.huawei.continuous.steps.total':
          candidates.push(
            scalarEntry(base, 'steps', pointFields.get('steps'), 'steps')
          );
          break;
        case 'com.huawei.continuous.calories.burnt.total':
          candidates.push(
            scalarEntry(
              base,
              'ActiveCaloriesBurned',
              pointFields.get('calories_total'),
              'kcal'
            )
          );
          break;
        case 'com.huawei.continuous.distance.total':
          candidates.push(
            scalarEntry(base, 'Distance', pointFields.get('distance'), 'm')
          );
          break;
        case 'com.huawei.continuous.heart_rate.statistics':
          candidates.push(
            scalarEntry(base, 'heart_rate_avg', pointFields.get('avg'), 'bpm'),
            scalarEntry(base, 'heart_rate_min', pointFields.get('min'), 'bpm'),
            scalarEntry(base, 'heart_rate_max', pointFields.get('max'), 'bpm')
          );
          break;
        case 'com.huawei.continuous.resting_heart_rate.statistics':
          candidates.push(
            scalarEntry(
              base,
              'RestingHeartRate',
              pointFields.get('last') ?? pointFields.get('avg'),
              'bpm'
            )
          );
          break;
        case 'com.huawei.continuous.spo2.statistics':
          candidates.push(
            scalarEntry(
              base,
              'OxygenSaturation',
              pointFields.get('saturation_last') ??
                pointFields.get('saturation_avg'),
              '%'
            )
          );
          break;
        case 'com.huawei.continuous.body_weight.statistics':
          candidates.push(
            scalarEntry(
              base,
              'weight',
              pointFields.get('last') ?? pointFields.get('avg'),
              'kg'
            )
          );
          break;
      }
      entries.push(
        ...candidates.filter(
          (entry): entry is HuaweiNormalizedHealthEntry => entry !== null
        )
      );
    }
  }
  return entries;
}

export function parseHuaweiUtcOffset(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/^([+-])(\d{2})(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 14 || minutes > 59) return null;
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

export function mapHuaweiSleepRecords(
  response: HuaweiSleepRecordsResponse
): HuaweiNormalizedHealthEntry[] {
  const entries: HuaweiNormalizedHealthEntry[] = [];
  for (const record of response.healthRecords) {
    if (record.dataTypeName !== 'com.huawei.health.record.sleep') continue;
    const recordFields = fields(record.value);
    const bedtimeMs = recordFields.get('fall_asleep_time');
    const wakeMs = recordFields.get('wakeup_time');
    const asleepMinutes = recordFields.get('all_sleep_time');
    if (
      bedtimeMs === undefined ||
      wakeMs === undefined ||
      asleepMinutes === undefined ||
      wakeMs <= bedtimeMs
    ) {
      continue;
    }
    const bedtime = new Date(bedtimeMs);
    const wakeTime = new Date(wakeMs);
    if (Number.isNaN(bedtime.getTime()) || Number.isNaN(wakeTime.getTime())) {
      continue;
    }
    const offset = parseHuaweiUtcOffset(record.timeZone);
    entries.push({
      type: 'SleepSession',
      source: SOURCE,
      source_id: record.id,
      date: wakeTime.toISOString(),
      timestamp: bedtime.toISOString(),
      bedtime: bedtime.toISOString(),
      wake_time: wakeTime.toISOString(),
      duration_in_seconds: Math.round((wakeMs - bedtimeMs) / 1000),
      time_asleep_in_seconds: Math.round(asleepMinutes * 60),
      light_sleep_seconds: Math.round(
        (recordFields.get('light_sleep_time') ?? 0) * 60
      ),
      deep_sleep_seconds: Math.round(
        (recordFields.get('deep_sleep_time') ?? 0) * 60
      ),
      rem_sleep_seconds: Math.round((recordFields.get('dream_time') ?? 0) * 60),
      awake_sleep_seconds: Math.round(
        (recordFields.get('awake_time') ?? 0) * 60
      ),
      sleep_score: recordFields.get('sleep_score') ?? 0,
      ...(offset === null ? {} : { record_utc_offset_minutes: offset }),
    });
  }
  return entries;
}

const activityNames: Readonly<Record<number, string>> = {
  1: 'Aerobics',
  3: 'Badminton',
  5: 'Basketball',
  7: 'Boxing',
  13: 'Cycling',
  17: 'Elliptical',
  29: 'HIIT',
  30: 'Hiking',
  37: 'Jump Rope',
  52: 'Rock Climbing',
  53: 'Rowing',
  54: 'Rowing Machine',
  56: 'Running',
  57: 'Treadmill Running',
  63: 'Skiing',
  75: 'Stair Climbing',
  76: 'Stair Climbing Machine',
  79: 'Strength Training',
  81: 'Swimming',
  82: 'Open Water Swimming',
  83: 'Pool Swimming',
  90: 'Walking',
  92: 'Weightlifting',
  95: 'Yoga',
  97: 'Indoor Cycling',
  127: 'Indoor Walking',
  128: 'Indoor Running',
  129: 'Mountain Climbing',
};

export function mapHuaweiActivities(
  response: HuaweiActivitiesResponse
): HuaweiNormalizedHealthEntry[] {
  const entries: HuaweiNormalizedHealthEntry[] = [];
  for (const activity of response.activityRecord) {
    const start = new Date(activity.startTime);
    if (Number.isNaN(start.getTime()) || activity.endTime <= activity.startTime)
      continue;
    const summaries = new Map<string, Map<string, number>>();
    for (const summary of activity.activitySummary?.dataSummary ?? []) {
      summaries.set(summary.dataTypeName, fields(summary.value));
    }
    const distance = summaries
      .get('com.huawei.continuous.distance.total')
      ?.get('distance');
    const calories = summaries
      .get('com.huawei.continuous.calories.burnt.total')
      ?.get('calories_total');
    const heartRate = summaries.get(
      'com.huawei.continuous.exercise_heart_rate.statistics'
    );
    const offset = parseHuaweiUtcOffset(activity.timeZone);
    const durationSeconds = Math.round(
      activity.activeTime && activity.activeTime > 0
        ? activity.activeTime / 1000
        : (activity.endTime - activity.startTime) / 1000
    );
    entries.push({
      type: 'Workout',
      source: SOURCE,
      source_id: activity.id,
      activityType:
        activityNames[activity.activityType] ??
        `HUAWEI Health Activity ${activity.activityType}`,
      timestamp: start.toISOString(),
      duration: durationSeconds,
      caloriesBurned: calories ?? 0,
      distance: distance ?? 0,
      ...(offset === null ? {} : { record_utc_offset_minutes: offset }),
      raw_data: {
        huaweiActivityType: activity.activityType,
        averageHeartRate: heartRate?.get('avg') ?? null,
        maximumHeartRate: heartRate?.get('max') ?? null,
      },
    });
  }
  return entries;
}
