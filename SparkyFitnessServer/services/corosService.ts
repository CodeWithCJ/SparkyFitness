import { todayInZone, addDays } from '@workspace/shared';
import type { CorosSyncResult } from '@workspace/shared';
import { log } from '../config/logging.js';
import { getSystemClient } from '../db/poolManager.js';
import {
  setMockDataContext,
  isMockCaptureEnabled,
} from '../utils/mockDataContext.js';
import { loadRawBundle } from '../utils/diagnosticLogger.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import corosIntegrationService, {
  CorosReauthRequiredError,
} from '../integrations/coros/corosService.js';
import {
  importCorosActivityFromFit,
  importCorosActivitySummary,
} from '../integrations/coros/corosDataProcessor.js';
import {
  COROS_PROVIDER_TYPE,
  COROS_ENTRY_SOURCE,
  COROS_FIT_BUDGET_PER_DAY,
  COROS_SPORT_RECORDS_PAGE_LIMIT,
  COROS_SPORT_RECORDS_WINDOW_DAYS,
  COROS_ALL_SPORTS,
} from '../integrations/coros/corosConstants.js';
import {
  extractTextPayloads,
  extractFitResources,
  detectCorosToolError,
  parseSportRecords,
  type CorosSportRecord,
  type CorosToolCallResult,
} from '../integrations/coros/corosMcpText.js';
import { getExistingSourceIds } from '../models/exerciseEntry.js';
import {
  reserveFitDownload,
  releaseFitDownload,
} from '../models/corosFitBudgetRepository.js';

function formatDateYmd(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

function daysDifference(start: string, end: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.round(Math.abs(e - s) / msPerDay);
}

/**
 * Orchestrates COROS sync for a given user.
 */
export async function syncCorosData(
  userId: string,
  syncType: 'manual' | 'scheduled' = 'manual',
  providerId: string | null = null,
  customStartDate: string | null = null,
  customEndDate: string | null = null,
  dataSource: string | null = null,
  saveMockData = false
): Promise<CorosSyncResult> {
  const corosDataSource = dataSource || 'coros_mcp';
  setMockDataContext({ dataSource, saveMockData });

  log(
    'info',
    `[corosService] Starting COROS sync (${syncType}) for user ${userId}${providerId ? ` (Provider ID: ${providerId})` : ''}${customStartDate ? ` from ${customStartDate}` : ''}${customEndDate ? ` to ${customEndDate}` : ''}. Loading from: ${corosDataSource}`
  );

  const warnings: string[] = [];
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);

  let startDate: string;
  let endDate: string;

  if (customStartDate) {
    startDate = customStartDate;
    endDate = customEndDate || today;
  } else if (syncType === 'scheduled') {
    startDate = addDays(today, -1);
    endDate = today;
  } else {
    // Manual default: past 7 days
    startDate = addDays(today, -7);
    endDate = today;
  }

  if (startDate > endDate) {
    warnings.push(
      `Start date ${startDate} was after end date ${endDate}. Automatically swapped.`
    );
    const tmp = startDate;
    startDate = endDate;
    endDate = tmp;
  }

  const rangeSpanDays = daysDifference(startDate, endDate) + 1;
  if (rangeSpanDays > 366) {
    warnings.push(
      "Large range: this may take several syncs because of COROS's daily file limit."
    );
  }

  let imported = 0;
  let updated = 0;
  let skippedExisting = 0;
  let deferred = 0;
  let summaryOnly = 0;
  const recordsMap = new Map<string, CorosSportRecord>();

  // --- REPLAY BRANCH ---
  if (corosDataSource === 'local') {
    log(
      'info',
      `[corosService] Replaying COROS sync from raw diagnostic bundle for user ${userId}`
    );
    const bundle = loadRawBundle('coros_mcp');
    if (!bundle || !bundle.responses) {
      throw new Error(
        'Raw diagnostic bundle not found. Run a sync with "Sync and save this sync\'s raw responses" selected first to capture one.'
      );
    }
    const responses = bundle.responses;

    for (const key of Object.keys(responses)) {
      if (key.startsWith('raw_sport_records_')) {
        const payloadResult = responses[key].data as CorosToolCallResult;
        const textPayloads = extractTextPayloads(payloadResult);
        for (const payload of textPayloads) {
          if (payload.kind === 'report') {
            const { records } = parseSportRecords(payload.text);
            for (const rec of records) {
              recordsMap.set(rec.labelId, rec);
            }
          }
        }
      }
    }

    const records = Array.from(recordsMap.values());
    const existingIds = await getExistingSourceIds(
      userId,
      COROS_ENTRY_SOURCE,
      records.map((r) => r.labelId)
    );

    for (const record of records) {
      if (existingIds.has(record.labelId)) {
        skippedExisting++;
        continue;
      }
      const fitKey = `raw_fit_${record.labelId}`;
      const fitData = responses[fitKey]?.data as
        CorosToolCallResult | undefined;
      const fitResources = fitData ? extractFitResources(fitData) : [];

      if (fitResources.length > 0) {
        try {
          const res = await importCorosActivityFromFit(
            userId,
            record,
            fitResources[0]
          );
          if (res.status === 'created') imported++;
          else if (res.status === 'updated') updated++;
          else {
            await importCorosActivitySummary(userId, record);
            summaryOnly++;
          }
        } catch (err) {
          log(
            'warn',
            `Replay failed to import FIT for ${record.labelId}: ${err}`
          );
          await importCorosActivitySummary(userId, record);
          summaryOnly++;
        }
      } else {
        await importCorosActivitySummary(userId, record);
        summaryOnly++;
      }
    }

    return {
      success: true,
      source: 'local_raw_replay',
      range: { startDate, endDate },
      found: records.length,
      imported,
      updated,
      skippedExisting,
      deferred,
      summaryOnly,
      warnings,
    };
  }

  // --- LIVE API BRANCH ---
  const client = await getSystemClient();
  let finalProviderId: string;
  try {
    let q =
      'SELECT id, external_user_id, encrypted_access_token, encrypted_refresh_token, is_active FROM external_data_providers WHERE user_id = $1 AND provider_type = $2';
    const qParams: (string | null)[] = [userId, COROS_PROVIDER_TYPE];
    if (providerId) {
      q += ' AND id = $3';
      qParams.push(providerId);
    }
    q += ' ORDER BY created_at DESC LIMIT 1';
    const rowRes = await client.query(q, qParams);
    const row = rowRes.rows[0] as
      | {
          id: string;
          external_user_id?: string | null;
          encrypted_access_token?: string | null;
          encrypted_refresh_token?: string | null;
          is_active?: boolean;
        }
      | undefined;
    if (!row) {
      if (syncType === 'scheduled') {
        log(
          'info',
          `[corosService] Skipping scheduled sync for user ${userId}: no COROS provider registered`
        );
        return {
          success: true,
          source: 'live_api',
          range: { startDate, endDate },
          found: 0,
          imported: 0,
          updated: 0,
          skippedExisting: 0,
          deferred: 0,
          summaryOnly: 0,
          warnings: [],
        };
      }
      throw new Error(`No COROS provider found for user ${userId}`);
    }
    if (
      !row.is_active ||
      (!row.encrypted_access_token && !row.encrypted_refresh_token)
    ) {
      if (syncType === 'scheduled') {
        log(
          'info',
          `[corosService] Skipping scheduled sync for user ${userId}: provider is inactive or disconnected`
        );
        return {
          success: true,
          source: 'live_api',
          range: { startDate, endDate },
          found: 0,
          imported: 0,
          updated: 0,
          skippedExisting: 0,
          deferred: 0,
          summaryOnly: 0,
          warnings: [],
        };
      }
      throw new CorosReauthRequiredError(
        'COROS account is not connected. Click Connect to authorize.'
      );
    }
    finalProviderId = row.id;
  } finally {
    client.release();
  }

  await corosIntegrationService.withCorosMcp(
    userId,
    finalProviderId!,
    async (call) => {
      // Step 1: Chunk the requested date range into 90-day windows
      const fetchRecordsWindow = async (
        winStart: string,
        winEnd: string
      ): Promise<CorosSportRecord[]> => {
        const startYmd = formatDateYmd(winStart);
        const endYmd = formatDateYmd(winEnd);
        const captureKey = `raw_sport_records_${startYmd}_${endYmd}`;

        const result = await call(
          'querySportRecords',
          {
            startDate: startYmd,
            endDate: endYmd,
            sportTypeCodes: COROS_ALL_SPORTS,
            minDistanceKm: 0,
            maxDistanceKm: 10000,
            minDurationMinutes: 0,
            maxDurationMinutes: 100000,
            maxAveragePace: '',
            locationKeyword: '',
            limit: COROS_SPORT_RECORDS_PAGE_LIMIT,
          },
          captureKey
        );

        const payloads = extractTextPayloads(result);
        const windowRecords: CorosSportRecord[] = [];

        for (const payload of payloads) {
          if (payload.kind === 'report') {
            const err = detectCorosToolError(payload.text, result.isError);
            if (err) {
              warnings.push(
                `Warning from COROS query (${winStart} - ${winEnd}): ${err}`
              );
              continue;
            }
            const { records, returnedCount } = parseSportRecords(payload.text);
            for (const r of records) {
              windowRecords.push(r);
            }

            // Window split on pagination cap
            if (
              returnedCount !== null &&
              returnedCount >= COROS_SPORT_RECORDS_PAGE_LIMIT
            ) {
              const span = daysDifference(winStart, winEnd);
              if (span > 1) {
                const midDays = Math.floor(span / 2);
                const midDate1 = addDays(winStart, midDays);
                const midDate2 = addDays(midDate1, 1);
                log(
                  'info',
                  `COROS page limit hit for ${winStart}..${winEnd}. Splitting into ${winStart}..${midDate1} and ${midDate2}..${winEnd}`
                );
                const left = await fetchRecordsWindow(winStart, midDate1);
                const right = await fetchRecordsWindow(midDate2, winEnd);
                return [...left, ...right];
              } else {
                warnings.push(
                  `Activity count hit max limit (${COROS_SPORT_RECORDS_PAGE_LIMIT}) on ${winStart}. Some workouts may not be listed.`
                );
              }
            }
          }
        }
        return windowRecords;
      };

      // Split requested range into 90-day intervals
      let currStart = startDate;
      while (currStart <= endDate) {
        let currEnd = addDays(currStart, COROS_SPORT_RECORDS_WINDOW_DAYS - 1);
        if (currEnd > endDate) {
          currEnd = endDate;
        }
        const records = await fetchRecordsWindow(currStart, currEnd);
        for (const r of records) {
          recordsMap.set(r.labelId, r);
        }
        currStart = addDays(currEnd, 1);
      }

      const allRecords = Array.from(recordsMap.values());

      // Check existing source_ids to prevent burning FIT quota
      const existingIds = await getExistingSourceIds(
        userId,
        COROS_ENTRY_SOURCE,
        allRecords.map((r) => r.labelId)
      );

      // Warning if no records returned for old range
      if (allRecords.length === 0 && daysDifference(startDate, today) > 30) {
        const sysClient = await getSystemClient();
        try {
          const countRes = await sysClient.query(
            'SELECT COUNT(*) FROM exercise_entries WHERE user_id = $1 AND source = $2',
            [userId, COROS_ENTRY_SOURCE]
          );
          if (parseInt(countRes.rows[0]?.count || '0', 10) > 0) {
            warnings.push(
              'COROS returned no activities for this range. If you expected some, COROS may be limiting access to older workouts.'
            );
          }
        } finally {
          sysClient.release();
        }
      }

      let budgetSpent = false;
      let hitDailyLimit = false;

      // Sort records newest first
      allRecords.sort((a, b) => {
        const tsA =
          a.startTimestamp ?? (a.date ? new Date(a.date).getTime() / 1000 : 0);
        const tsB =
          b.startTimestamp ?? (b.date ? new Date(b.date).getTime() / 1000 : 0);
        return tsB - tsA;
      });

      for (const record of allRecords) {
        if (existingIds.has(record.labelId)) {
          skippedExisting++;
          continue;
        }

        if (hitDailyLimit || budgetSpent) {
          deferred++;
          continue;
        }

        const reserved = await reserveFitDownload(
          finalProviderId!,
          COROS_FIT_BUDGET_PER_DAY
        );
        if (!reserved) {
          budgetSpent = true;
          deferred++;
          continue;
        }

        let downloaded = false;
        try {
          const captureKey = `raw_fit_${record.labelId}`;
          const fitResult = await call(
            'downloadActivityFitFiles',
            {
              labelId: record.labelId,
              sportType: record.sportType,
            },
            captureKey
          );

          downloaded = true;
          if (reserved.used >= COROS_FIT_BUDGET_PER_DAY) {
            budgetSpent = true;
          }

          const fitResources = extractFitResources(fitResult);
          if (fitResources.length > 0) {
            const fit = fitResources[0];
            const importRes = await importCorosActivityFromFit(
              userId,
              record,
              fit
            );
            if (importRes.status === 'created') {
              imported++;
            } else if (importRes.status === 'updated') {
              updated++;
            } else {
              log(
                'warn',
                `FIT import failed for ${record.labelId}: ${importRes.reason}`
              );
              await importCorosActivitySummary(userId, record);
              summaryOnly++;
              warnings.push(
                `Failed to decode FIT for ${record.name} (${record.date}): ${importRes.reason || 'fallback to summary'}.`
              );
            }
          } else {
            // Check for limit-like error response
            const textPayloads = extractTextPayloads(fitResult);
            let isLimitError = false;
            let otherToolError: string | null = null;
            for (const tp of textPayloads) {
              if (tp.kind === 'report') {
                if (
                  /(?:download|daily|file|request)\s*(?:limit|quota)|rate\s*limit|too\s*many\s*requests|429/i.test(
                    tp.text
                  )
                ) {
                  isLimitError = true;
                  break;
                }
                const err = detectCorosToolError(tp.text, fitResult.isError);
                if (err) {
                  otherToolError = err;
                }
              }
            }

            if (isLimitError) {
              hitDailyLimit = true;
              deferred++;
              continue;
            }

            if (otherToolError || fitResult.isError) {
              log(
                'warn',
                `Tool error downloading FIT for ${record.labelId}: ${otherToolError || 'unknown error'}. Deferring.`
              );
              deferred++;
              warnings.push(
                `Failed to download FIT for ${record.name} (${record.date}): ${otherToolError || 'provider error'}; deferred to next sync.`
              );
              continue;
            }

            log(
              'warn',
              `No FIT resource returned for ${record.labelId}. Falling back to summary.`
            );
            await importCorosActivitySummary(userId, record);
            summaryOnly++;
            warnings.push(
              `No FIT resource returned for ${record.name} (${record.date}); imported summary only.`
            );
          }
        } catch (err) {
          if (!downloaded) {
            await releaseFitDownload(finalProviderId!, reserved.day).catch(
              (releaseErr) =>
                log(
                  'warn',
                  `Could not return COROS FIT download budget for ${record.labelId}: ${releaseErr}`
                )
            );
          }
          if (
            err instanceof CorosReauthRequiredError ||
            (err as { name?: string })?.name === 'CorosReauthRequiredError'
          ) {
            throw err;
          }
          log(
            'warn',
            `Transient error downloading FIT for ${record.labelId} (${record.name}): ${err}. Deferring to next sync.`
          );
          deferred++;
          warnings.push(
            `Network error downloading FIT for ${record.name} (${record.date}); deferred to next sync.`
          );
        }
      }

      if ((hitDailyLimit || budgetSpent) && deferred > 0) {
        warnings.push(
          'Daily COROS file download limit reached. Remaining activities will be imported after the limit resets (next UTC day).'
        );
      }

      // Step 3: Raw Health Capture (Phase 1 mock capture ONLY; does not write to DB)
      if (isMockCaptureEnabled()) {
        try {
          const days = Math.max(
            1,
            Math.min(365, daysDifference(today, startDate) + 1)
          );
          const startYmd = formatDateYmd(startDate);
          const endYmd = formatDateYmd(endDate);

          log(
            'info',
            `[corosService] Mock capture enabled: capturing raw health calls for ${days} days`
          );

          await call(
            'queryDailyHealthData',
            { days },
            `raw_health_queryDailyHealthData_${days}`
          ).catch((e) =>
            log('warn', `Raw capture queryDailyHealthData error: ${e}`)
          );
          await call(
            'queryRestingHeartRate',
            { days },
            `raw_health_queryRestingHeartRate_${days}`
          ).catch((e) =>
            log('warn', `Raw capture queryRestingHeartRate error: ${e}`)
          );
          await call(
            'querySleepOverview',
            { startDate: startYmd, endDate: endYmd, days },
            `raw_health_querySleepOverview_${startYmd}_${endYmd}`
          ).catch((e) =>
            log('warn', `Raw capture querySleepOverview error: ${e}`)
          );
          await call(
            'queryAvgHeartRate',
            { startDate: startYmd, endDate: endYmd, days },
            `raw_health_queryAvgHeartRate_${startYmd}_${endYmd}`
          ).catch((e) =>
            log('warn', `Raw capture queryAvgHeartRate error: ${e}`)
          );

          // querySleepHrv chunked into 7-day windows
          let hrvStart = startDate;
          while (hrvStart <= endDate) {
            let hrvEnd = addDays(hrvStart, 6);
            if (hrvEnd > endDate) hrvEnd = endDate;
            const hrvStartYmd = formatDateYmd(hrvStart);
            const hrvEndYmd = formatDateYmd(hrvEnd);
            const hrvDays = daysDifference(hrvStart, hrvEnd) + 1;
            await call(
              'querySleepHrv',
              { startDate: hrvStartYmd, endDate: hrvEndYmd, days: hrvDays },
              `raw_health_querySleepHrv_${hrvStartYmd}_${hrvEndYmd}`
            ).catch((e) =>
              log('warn', `Raw capture querySleepHrv error: ${e}`)
            );
            hrvStart = addDays(hrvEnd, 1);
          }

          await call(
            'queryFitnessAssessmentOverview',
            {},
            'raw_health_queryFitnessAssessmentOverview'
          ).catch((e) =>
            log(
              'warn',
              `Raw capture queryFitnessAssessmentOverview error: ${e}`
            )
          );
          await call('queryUserInfo', {}, 'raw_health_queryUserInfo').catch(
            (e) => log('warn', `Raw capture queryUserInfo error: ${e}`)
          );
        } catch (healthErr) {
          log('warn', `Raw health capture failed: ${healthErr}`);
        }
      }
    }
  );

  // Update last_sync_at timestamp
  const updateClient = await getSystemClient();
  try {
    await updateClient.query(
      `UPDATE external_data_providers
       SET last_sync_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [finalProviderId]
    );
  } finally {
    updateClient.release();
  }

  return {
    success: true,
    source: 'live_api',
    range: { startDate, endDate },
    found: recordsMap.size,
    imported,
    updated,
    skippedExisting,
    deferred,
    summaryOnly,
    warnings,
  };
}

export default {
  syncCorosData,
};
