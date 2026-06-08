import { vi, beforeEach, describe, it, expect } from 'vitest';

// Pure helpers are tested in googleHealthParsers.test.ts; use real implementations here
// so that sleep-anchoring and duration tests run against actual logic.
vi.mock('../integrations/googlehealth/googleHealthService.js', async () => {
  const real = await vi.importActual<
    typeof import('../integrations/googlehealth/googleHealthService.js')
  >('../integrations/googlehealth/googleHealthService.js');
  return { googleTimeToIso: real.googleTimeToIso, parseDurationToSeconds: real.parseDurationToSeconds };
});

vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCustomCategories: vi.fn().mockResolvedValue([]),
    createCustomCategory: vi.fn().mockResolvedValue({ id: 'cat-1' }),
    upsertCustomMeasurement: vi.fn().mockResolvedValue(undefined),
    upsertCheckInMeasurements: vi.fn().mockResolvedValue(undefined),
    upsertStepData: vi.fn().mockResolvedValue(undefined),
    upsertWaterData: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: { createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }) },
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn().mockResolvedValue(null),
    createExercise: vi.fn().mockResolvedValue({ id: 'exercise-1' }),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn().mockResolvedValue({ id: 'sleep-1' }),
    deleteSleepStageEventsByEntryId: vi.fn().mockResolvedValue(undefined),
    upsertSleepStageEvent: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import {
  processGoogleWeight,
  processGoogleSpO2,
  processGoogleHeartRate,
  processGoogleActiveZoneMinutes,
  processGoogleSleep,
  processGoogleActivities,
} from '../integrations/googlehealth/googleHealthDataProcessor.js';
import measurementRepository from '../models/measurementRepository.js';
import sleepRepository from '../models/sleepRepository.js';
import exerciseRepository from '../models/exercise.js';

const UID = 'user-1';
const CID = 'user-1';

// Helper: wrap a data point in the shape fetchDataPointsRange returns
function dataPoints(...points: object[]) {
  return { dataPoints: points };
}
function rollupPoints(...points: object[]) {
  return { rollupDataPoints: points };
}


beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Weight ──────────────────────────────────────────────────────────────────

describe('processGoogleWeight', () => {
  it('skips a point with missing weightGrams', async () => {
    const point = { weight: {} };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCheckInMeasurements).not.toHaveBeenCalled();
  });

  it('skips a point where weightGrams is not a number', async () => {
    const point = { weight: { date: { year: 2026, month: 5, day: 1 }, weightGrams: 'bad' } };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCheckInMeasurements).not.toHaveBeenCalled();
  });

  it('converts grams to kg and upserts', async () => {
    const point = { weight: { date: { year: 2026, month: 5, day: 1 }, weightGrams: '70000' } };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCheckInMeasurements).toHaveBeenCalledWith(
      UID, CID, '2026-05-01', { weight: 70 }
    );
  });
});

// ─── SpO2 ────────────────────────────────────────────────────────────────────

describe('processGoogleSpO2', () => {
  it('skips a point with missing percentage', async () => {
    const point = { oxygenSaturation: { date: { year: 2026, month: 5, day: 1 } } };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).not.toHaveBeenCalled();
  });

  it('skips a point where percentage is not a number', async () => {
    const point = { oxygenSaturation: { date: { year: 2026, month: 5, day: 1 }, percentage: 'nan' } };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).not.toHaveBeenCalled();
  });

  it('upserts a valid percentage', async () => {
    const point = { oxygenSaturation: { date: { year: 2026, month: 5, day: 1 }, percentage: '97.5' } };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID, CID, 'cat-1', 97.5, '2026-05-01', 0, expect.any(String), expect.any(String), 'Daily', 'Google Health'
    );
  });
});

// ─── Resting Heart Rate ───────────────────────────────────────────────────────

describe('processGoogleHeartRate', () => {
  it('skips a point with undefined beatsPerMinute', async () => {
    const point = { dailyRestingHeartRate: { date: { year: 2026, month: 5, day: 1 } } };
    await processGoogleHeartRate(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).not.toHaveBeenCalled();
  });

  it('upserts a valid bpm value', async () => {
    const point = { dailyRestingHeartRate: { date: { year: 2026, month: 5, day: 1 }, beatsPerMinute: 58 } };
    await processGoogleHeartRate(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID, CID, 'cat-1', 58, '2026-05-01', 0, expect.any(String), expect.any(String), 'Daily', 'Google Health'
    );
  });
});

// ─── Active Zone Minutes ──────────────────────────────────────────────────────

describe('processGoogleActiveZoneMinutes', () => {
  it('treats malformed zone values as 0 without crashing', async () => {
    const point = {
      civilStartTime: { date: { year: 2026, month: 5, day: 1 } },
      activeZoneMinutes: {
        sumInFatBurnHeartZone: 'bad',
        sumInCardioHeartZone: null,
        sumInPeakHeartZone: '10',
      },
    };
    // total = 0 + 0 + 10 = 10; should still upsert
    await processGoogleActiveZoneMinutes(UID, CID, rollupPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID, CID, 'cat-1', 10, '2026-05-01', 0, expect.any(String), expect.any(String), 'Daily', 'Google Health'
    );
  });

  it('skips a point where all zones sum to zero', async () => {
    const point = {
      civilStartTime: { date: { year: 2026, month: 5, day: 1 } },
      activeZoneMinutes: { sumInFatBurnHeartZone: '0', sumInCardioHeartZone: '0', sumInPeakHeartZone: '0' },
    };
    await processGoogleActiveZoneMinutes(UID, CID, rollupPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).not.toHaveBeenCalled();
  });
});

// ─── Sleep anchoring ─────────────────────────────────────────────────────────

// The API stores civilStartTime as local time treated as-if-UTC, so
// getUTCHours() of the ISO string gives the local start hour. Sessions
// starting before noon local time are attributed to the previous day
// (they are the tail of the previous night's sleep, not a new day's nap).

function sleepPoint(startIso: string, endIso: string, minutesAsleep = 420) {
  return {
    sleep: {
      summary: {
        minutesAsleep: String(minutesAsleep),
        minutesInSleepPeriod: String(minutesAsleep + 30),
        minutesToFallAsleep: '10',
      },
      interval: { startTime: startIso, endTime: endIso },
      stages: [],
    },
  };
}

describe('processGoogleSleep — date anchoring', () => {
  it('attributes a late-evening session (hour >= 12) to its own date', async () => {
    // 23:30 on May 1 — should land on 2026-05-01
    await processGoogleSleep(UID, CID, dataPoints(sleepPoint('2026-05-01T23:30:00Z', '2026-05-02T07:00:00Z')));
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID, CID, expect.objectContaining({ entry_date: '2026-05-01' })
    );
  });

  it('attributes a past-midnight session (hour < 12) to the previous date', async () => {
    // 00:30 on May 2 — civil-time interpretation means it is still May 1 night
    await processGoogleSleep(UID, CID, dataPoints(sleepPoint('2026-05-02T00:30:00Z', '2026-05-02T08:00:00Z')));
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID, CID, expect.objectContaining({ entry_date: '2026-05-01' })
    );
  });

  it('keeps the longer session when two sessions share the same anchor date', async () => {
    const shortNap = sleepPoint('2026-05-01T23:00:00Z', '2026-05-01T23:45:00Z', 40);
    const mainSleep = sleepPoint('2026-05-01T23:30:00Z', '2026-05-02T07:00:00Z', 420);
    await processGoogleSleep(UID, CID, dataPoints(shortNap, mainSleep));
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID, CID, expect.objectContaining({ time_asleep_in_seconds: 420 * 60 })
    );
  });

  it('skips a point with no parseable startTime', async () => {
    const point = { sleep: { summary: {}, interval: { startTime: 'bad', endTime: 'bad' }, stages: [] } };
    await processGoogleSleep(UID, CID, dataPoints(point));
    expect(sleepRepository.upsertSleepEntry).not.toHaveBeenCalled();
  });
});

// ─── Exercise — null guard after createExercise ───────────────────────────────

describe('processGoogleActivities — exercise record null guard', () => {
  it('skips the entry when createExercise returns null', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (exerciseRepository.createExercise as any).mockResolvedValue(null);

    const point = {
      startTime: '2026-05-01T10:00:00Z',
      exercise: {
        displayName: 'Running',
        activeDuration: '3600s',
        metricsSummary: {},
      },
    };
    await processGoogleActivities(UID, CID, dataPoints(point));
    // should log an error and continue — no crash, no entry created
    const { log } = await import('../config/logging.js');
    expect(log).toHaveBeenCalledWith('error', expect.stringContaining('Failed to find or create'));
  });
});
