import {
  addDays,
  dayRangeToUtcRange,
  dayToUtcRange,
  instantToDay,
  isDayString,
} from '@workspace/shared';
import measurementService from '../../services/measurementService.js';
import exerciseEntryRepository from '../../models/exerciseEntry.js';
import { loadUserTimezone } from '../../utils/timezoneLoader.js';
import huaweiHealthClient from './huaweiHealthClient.js';
import { HuaweiHealthError } from './huaweiHealthErrors.js';
import {
  mapHuaweiActivities,
  mapHuaweiDailySummary,
  mapHuaweiSleepRecords,
  type HuaweiNormalizedHealthEntry,
} from './huaweiHealthMapper.js';
import huaweiHealthOAuthService from './huaweiHealthOAuthService.js';
import { updateHuaweiLastSync } from './huaweiHealthSyncRepository.js';

const HUAWEI_DATA_SCOPES = [
  'https://www.huawei.com/healthkit/step.read',
  'https://www.huawei.com/healthkit/calories.read',
  'https://www.huawei.com/healthkit/distance.read',
  'https://www.huawei.com/healthkit/heartrate.read',
  'https://www.huawei.com/healthkit/oxygensaturation.read',
  'https://www.huawei.com/healthkit/heightweight.read',
  'https://www.huawei.com/healthkit/sleep.read',
  'https://www.huawei.com/healthkit/activityrecord.read',
] as const;

const dailyTypesByScope: Readonly<Record<string, readonly string[]>> = {
  'https://www.huawei.com/healthkit/step.read': [
    'com.huawei.continuous.steps.total',
  ],
  'https://www.huawei.com/healthkit/calories.read': [
    'com.huawei.continuous.calories.burnt.total',
  ],
  'https://www.huawei.com/healthkit/distance.read': [
    'com.huawei.continuous.distance.total',
  ],
  'https://www.huawei.com/healthkit/heartrate.read': [
    'com.huawei.continuous.heart_rate.statistics',
    'com.huawei.continuous.resting_heart_rate.statistics',
  ],
  'https://www.huawei.com/healthkit/oxygensaturation.read': [
    'com.huawei.continuous.spo2.statistics',
  ],
  'https://www.huawei.com/healthkit/heightweight.read': [
    'com.huawei.continuous.body_weight.statistics',
  ],
};

export interface HuaweiDayChunk {
  startDate: string;
  endDate: string;
}

export function splitHuaweiDayRange(
  startDate: string,
  endDate: string,
  timeZone?: string
): HuaweiDayChunk[] {
  if (!isDayString(startDate) || !isDayString(endDate) || startDate > endDate) {
    throw new HuaweiHealthError(
      'HUAWEI_API_REQUEST_FAILED',
      400,
      'The Huawei sync date range is invalid.'
    );
  }
  const chunks: HuaweiDayChunk[] = [];
  let current = startDate;
  while (current <= endDate) {
    const chunkOffset = timeZone
      ? formatHuaweiTimeZone(current, timeZone).offsetMinutes
      : null;
    let chunkEnd = current;
    // Keep elapsed intervals strictly below Huawei's 31-day ceiling, even
    // when a local range crosses a 25-hour DST day. Also start a fresh query
    // once the timezone's midnight offset changes so later days use the
    // correct fixed offset accepted by Huawei's API.
    for (let dayIndex = 1; dayIndex < 30; dayIndex += 1) {
      const nextDay = addDays(chunkEnd, 1);
      if (nextDay > endDate) break;
      if (
        timeZone &&
        formatHuaweiTimeZone(nextDay, timeZone).offsetMinutes !== chunkOffset
      ) {
        break;
      }
      chunkEnd = nextDay;
    }
    chunks.push({ startDate: current, endDate: chunkEnd });
    current = addDays(chunkEnd, 1);
  }
  return chunks;
}

function formatHuaweiDay(day: string): string {
  return day.replaceAll('-', '');
}

function formatHuaweiTimeZone(
  day: string,
  timeZone: string
): {
  formatted: string;
  offsetMinutes: number;
} {
  const [year, month, date] = day.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(year, month - 1, date);
  const { start } = dayToUtcRange(day, timeZone);
  const offsetMinutes = Math.round(
    (localMidnightAsUtc - start.getTime()) / 60_000
  );
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);
  return {
    formatted: `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(absolute % 60).padStart(2, '0')}`,
    offsetMinutes,
  };
}

interface HuaweiSyncStatus {
  available: boolean;
  connected: boolean;
  grantedScopes: string[];
}

interface HuaweiHealthSyncDependencies {
  oauthService: {
    getStatus(
      userId: string,
      authenticatedUserId: string
    ): Promise<HuaweiSyncStatus>;
    getValidAccessToken(
      userId: string,
      authenticatedUserId: string
    ): Promise<string>;
  };
  client: Pick<
    typeof huaweiHealthClient,
    | 'fetchGrantedScopes'
    | 'fetchDailySummary'
    | 'fetchSleepRecords'
    | 'fetchActivities'
  >;
  processHealthData(
    entries: HuaweiNormalizedHealthEntry[],
    userId: string,
    authenticatedUserId: string
  ): Promise<{
    processed: unknown[];
    errors: unknown[];
    skipped: unknown[];
  }>;
  loadUserTimezone(userId: string): Promise<string>;
  updateLastSync(
    userId: string,
    authenticatedUserId: string,
    lastSyncAt: Date
  ): Promise<void>;
  deleteWorkoutsByRange(
    userId: string,
    startDate: string,
    endDate: string,
    source: string
  ): Promise<unknown>;
  now(): Date;
}

interface HuaweiSyncOptions {
  startDate?: string;
  endDate?: string;
}

export function createHuaweiHealthSyncService(
  dependencies: HuaweiHealthSyncDependencies
) {
  const {
    oauthService,
    client,
    processHealthData,
    loadUserTimezone: loadTimezone,
    updateLastSync,
    deleteWorkoutsByRange,
    now,
  } = dependencies;

  return {
    async sync(
      userId: string,
      authenticatedUserId: string,
      options: HuaweiSyncOptions = {}
    ) {
      const status = await oauthService.getStatus(userId, authenticatedUserId);
      if (!status.available) {
        throw new HuaweiHealthError(
          'HUAWEI_NOT_CONFIGURED',
          503,
          'HUAWEI Health is not configured for this SparkyFitness instance.'
        );
      }
      if (!status.connected) {
        throw new HuaweiHealthError(
          'HUAWEI_NOT_CONNECTED',
          409,
          'HUAWEI Health is not connected.'
        );
      }

      const timeZone = await loadTimezone(userId);
      const today = instantToDay(now(), timeZone);
      const startDate = options.startDate ?? addDays(today, -6);
      const endDate = options.endDate ?? today;
      const chunks = splitHuaweiDayRange(startDate, endDate, timeZone);
      const accessToken = await oauthService.getValidAccessToken(
        userId,
        authenticatedUserId
      );
      // Query live consent on every sync so partial authorization and later
      // scope revocation are honored without relying on stale token metadata.
      const grantedScopes = new Set(
        await client.fetchGrantedScopes(accessToken)
      );
      const missingScopes = HUAWEI_DATA_SCOPES.filter(
        (scope) => !grantedScopes.has(scope)
      );
      const dailyTypes = Object.entries(dailyTypesByScope).flatMap(
        ([scope, dataTypes]) => (grantedScopes.has(scope) ? [...dataTypes] : [])
      );
      const includeSleep = grantedScopes.has(
        'https://www.huawei.com/healthkit/sleep.read'
      );
      const includeActivities = grantedScopes.has(
        'https://www.huawei.com/healthkit/activityrecord.read'
      );
      let processed = 0;
      let errors = 0;
      let skipped = 0;
      for (const chunk of chunks) {
        const { formatted, offsetMinutes } = formatHuaweiTimeZone(
          chunk.startDate,
          timeZone
        );
        const { start, end } = dayRangeToUtcRange(
          chunk.startDate,
          chunk.endDate,
          timeZone
        );
        const [dailyResponse, sleepResponse, activityResponse] =
          await Promise.all([
            dailyTypes.length > 0
              ? client.fetchDailySummary(accessToken, {
                  dataTypes: dailyTypes,
                  startDay: formatHuaweiDay(chunk.startDate),
                  endDay: formatHuaweiDay(chunk.endDate),
                  timeZone: formatted,
                })
              : null,
            includeSleep
              ? client.fetchSleepRecords(accessToken, start, end)
              : null,
            includeActivities
              ? client.fetchActivities(
                  accessToken,
                  start.getTime(),
                  end.getTime() - 1
                )
              : null,
          ]);

        const entries: HuaweiNormalizedHealthEntry[] = [
          ...(dailyResponse
            ? mapHuaweiDailySummary(dailyResponse, offsetMinutes)
            : []),
          ...(sleepResponse ? mapHuaweiSleepRecords(sleepResponse) : []),
          ...(activityResponse ? mapHuaweiActivities(activityResponse) : []),
        ];
        if (includeActivities) {
          // Huawei reports deleted activity IDs separately. Replacing this
          // provider's bounded range before ingest handles both deletions and
          // ordinary replay idempotency, including an empty activity page.
          await deleteWorkoutsByRange(
            userId,
            chunk.startDate,
            chunk.endDate,
            'HUAWEI Health'
          );
        }
        if (entries.length === 0) continue;

        const result = await processHealthData(
          entries,
          userId,
          authenticatedUserId
        );
        processed += result.processed.length;
        errors += result.errors.length;
        skipped += result.skipped.length;
      }

      const completedAt = now();
      await updateLastSync(userId, authenticatedUserId, completedAt);
      return {
        status: 'completed' as const,
        startDate,
        endDate,
        processed,
        errors,
        skipped,
        missingScopes,
        completedAt,
      };
    },
  };
}

const huaweiHealthSyncService = createHuaweiHealthSyncService({
  oauthService: huaweiHealthOAuthService,
  client: huaweiHealthClient,
  processHealthData: (entries, userId, authenticatedUserId) =>
    measurementService.processHealthData(entries, userId, authenticatedUserId),
  loadUserTimezone,
  updateLastSync: updateHuaweiLastSync,
  deleteWorkoutsByRange:
    exerciseEntryRepository.deleteExerciseEntriesByEntrySourceAndDate,
  now: () => new Date(),
});

export default huaweiHealthSyncService;
