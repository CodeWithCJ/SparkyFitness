import { vi, beforeEach, describe, it, expect } from 'vitest';

// Pure helpers are tested in googleHealthParsers.test.ts; use real implementations here
// so that sleep-anchoring and duration tests run against actual logic.
vi.mock('../integrations/googlehealth/googleHealthService.js', async () => {
  const real = await vi.importActual<
    typeof import('../integrations/googlehealth/googleHealthService.js')
  >('../integrations/googlehealth/googleHealthService.js');
  return {
    googleTimeToIso: real.googleTimeToIso,
    parseDurationToSeconds: real.parseDurationToSeconds,
  };
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
  default: {
    createExerciseEntry: vi.fn().mockResolvedValue({ id: 'entry-1' }),
  },
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
  processGoogleHRV,
  dailyHrvByDate,
  dailyRestingHeartRateByDate,
  processGoogleActiveZoneMinutes,
  processGoogleSleep,
  processGoogleActivities,
  processGoogleActivityMinutes,
  processGoogleCoreTemperature,
} from '../integrations/googlehealth/googleHealthDataProcessor.js';
import measurementRepository from '../models/measurementRepository.js';
import sleepRepository from '../models/sleepRepository.js';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';

const UID = 'user-1';
const CID = 'user-1';

// Helper: wrap a data point in the shape fetchDataPointsRange returns
function dataPoints(...points: object[]): {
  dataPoints: Record<string, unknown>[];
} {
  return { dataPoints: points as Record<string, unknown>[] };
}
function rollupPoints(...points: object[]): {
  rollupDataPoints: Record<string, unknown>[];
} {
  return { rollupDataPoints: points as Record<string, unknown>[] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Weight ──────────────────────────────────────────────────────────────────

describe('processGoogleWeight', () => {
  it('skips a point with missing weightGrams', async () => {
    const point = { weight: {} };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCheckInMeasurements
    ).not.toHaveBeenCalled();
  });

  it('skips a point where weightGrams is not a number', async () => {
    const point = {
      weight: { date: { year: 2026, month: 5, day: 1 }, weightGrams: 'bad' },
    };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCheckInMeasurements
    ).not.toHaveBeenCalled();
  });

  it('converts grams to kg and upserts', async () => {
    const point = {
      weight: { date: { year: 2026, month: 5, day: 1 }, weightGrams: '70000' },
    };
    await processGoogleWeight(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCheckInMeasurements
    ).toHaveBeenCalledWith(UID, CID, '2026-05-01', { weight: 70 });
  });
});

// ─── SpO2 ────────────────────────────────────────────────────────────────────

describe('processGoogleSpO2', () => {
  it('skips a point with missing percentage', async () => {
    const point = {
      oxygenSaturation: { date: { year: 2026, month: 5, day: 1 } },
    };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });

  it('skips a point where percentage is not a number', async () => {
    const point = {
      oxygenSaturation: {
        date: { year: 2026, month: 5, day: 1 },
        percentage: 'nan',
      },
    };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });

  it('upserts a valid percentage', async () => {
    const point = {
      oxygenSaturation: {
        date: { year: 2026, month: 5, day: 1 },
        percentage: '97.5',
      },
    };
    await processGoogleSpO2(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID,
      CID,
      'cat-1',
      97.5,
      '2026-05-01',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
    );
  });
});

// ─── Resting Heart Rate ───────────────────────────────────────────────────────

describe('processGoogleHeartRate', () => {
  it('skips a point with undefined beatsPerMinute', async () => {
    const point = {
      dailyRestingHeartRate: { date: { year: 2026, month: 5, day: 1 } },
    };
    await processGoogleHeartRate(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });

  it('upserts a valid bpm value', async () => {
    const point = {
      dailyRestingHeartRate: {
        date: { year: 2026, month: 5, day: 1 },
        beatsPerMinute: 58,
      },
    };
    await processGoogleHeartRate(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID,
      CID,
      'cat-1',
      58,
      '2026-05-01',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
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
      UID,
      CID,
      'cat-1',
      10,
      '2026-05-01',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
    );
  });

  it('skips a point where all zones sum to zero', async () => {
    const point = {
      civilStartTime: { date: { year: 2026, month: 5, day: 1 } },
      activeZoneMinutes: {
        sumInFatBurnHeartZone: '0',
        sumInCardioHeartZone: '0',
        sumInPeakHeartZone: '0',
      },
    };
    await processGoogleActiveZoneMinutes(UID, CID, rollupPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });
});

// ─── Sleep anchoring ─────────────────────────────────────────────────────────

// A sleep session is anchored to the day it ends (the wake-up day), matching
// how Google Health / Fitbit file it. A session that starts before midnight and
// one that starts after midnight both belong to the morning they end on.

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
  it('anchors an overnight session to the day it ends', async () => {
    // Asleep 23:30 May 1 → awake 07:00 May 2 — files under the wake day, May 2.
    await processGoogleSleep(
      UID,
      CID,
      dataPoints(sleepPoint('2026-05-01T23:30:00Z', '2026-05-02T07:00:00Z'))
    );
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({ entry_date: '2026-05-02' }),
      { keepExistingBiometrics: true }
    );
  });

  it('anchors a past-midnight session to its own wake day, not the night before', async () => {
    // Asleep 00:30 → awake 08:00, both May 2. This is the case that regressed:
    // it must land on May 2 (wake day), not May 1.
    await processGoogleSleep(
      UID,
      CID,
      dataPoints(sleepPoint('2026-05-02T00:30:00Z', '2026-05-02T08:00:00Z'))
    );
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({ entry_date: '2026-05-02' }),
      { keepExistingBiometrics: true }
    );
  });

  it('keeps the longer session when two sessions share the same anchor date', async () => {
    const shortNap = sleepPoint(
      '2026-05-02T00:00:00Z',
      '2026-05-02T00:45:00Z',
      40
    );
    const mainSleep = sleepPoint(
      '2026-05-01T23:30:00Z',
      '2026-05-02T07:00:00Z',
      420
    );
    await processGoogleSleep(UID, CID, dataPoints(shortNap, mainSleep));
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({ time_asleep_in_seconds: 420 * 60 }),
      { keepExistingBiometrics: true }
    );
  });

  it('anchors to the local wake day in a negative offset timezone', async () => {
    // Awake 2026-05-02T14:00Z is 10:00 AM on May 2 in New York, so the session
    // files under May 2 in that zone.
    await processGoogleSleep(
      UID,
      CID,
      dataPoints(sleepPoint('2026-05-02T06:00:00Z', '2026-05-02T14:00:00Z')),
      'America/New_York'
    );
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({ entry_date: '2026-05-02' }),
      { keepExistingBiometrics: true }
    );
  });

  it('skips a point with no parseable startTime', async () => {
    const point = {
      sleep: {
        summary: {},
        interval: { startTime: 'bad', endTime: 'bad' },
        stages: [],
      },
    };
    await processGoogleSleep(UID, CID, dataPoints(point));
    expect(sleepRepository.upsertSleepEntry).not.toHaveBeenCalled();
  });
});

// ─── Exercise — null guard after createExercise ───────────────────────────────

describe('processGoogleActivities — duration units', () => {
  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    const point = {
      startTime: '2026-05-01T10:00:00Z',
      exercise: {
        displayName: 'Running',
        activeDuration: '3600s',
        metricsSummary: {},
      },
    };
    await processGoogleActivities(UID, CID, dataPoints(point));

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 60,
        sets: [expect.objectContaining({ duration: 3600 })],
      }),
      CID,
      'Google Health',
      null,
      {
        // Written with the entry, so a re-sync replaces it instead of adding
        // another copy.
        activityDetail: expect.objectContaining({
          provider_name: 'Google Health',
          detail_type: 'full_activity_data',
        }),
      }
    );
    expect(
      activityDetailsRepository.createActivityDetail
    ).not.toHaveBeenCalled();
  });
});

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
    expect(log).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Failed to find or create')
    );
  });
});

// ─── Sleep recording-zone stamp (issue #2033) ───────────────────────────────

describe('processGoogleSleep — recording-zone stamp', () => {
  it('stamps record_utc_offset_minutes for a string startTime with an explicit offset', async () => {
    await processGoogleSleep(
      UID,
      CID,
      dataPoints(
        sleepPoint('2026-05-01T23:30:00-04:00', '2026-05-02T07:00:00-04:00')
      )
    );
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBe(-240);
  });

  it('stamps nothing for a Z-suffixed string (no zone claim)', async () => {
    await processGoogleSleep(
      UID,
      CID,
      dataPoints(sleepPoint('2026-05-01T23:30:00Z', '2026-05-02T07:00:00Z'))
    );
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeUndefined();
  });

  it('stamps nothing for the {date,time} object form', async () => {
    const point = {
      sleep: {
        summary: {
          minutesAsleep: '420',
          minutesInSleepPeriod: '450',
          minutesToFallAsleep: '10',
        },
        interval: {
          startTime: {
            date: { year: 2026, month: 5, day: 1 },
            time: { hours: 23, minutes: 30 },
          },
          endTime: {
            date: { year: 2026, month: 5, day: 2 },
            time: { hours: 7, minutes: 0 },
          },
        },
        stages: [],
      },
    };
    await processGoogleSleep(UID, CID, dataPoints(point));
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeUndefined();
  });
});

// ─── Activity minutes ────────────────────────────────────────────────────────

// Each category resolves to an id equal to its name, so an upsert call shows
// which category it wrote: upsertCustomMeasurement(userId, createdBy, categoryId, value, date, ...).
const ACTIVITY_CATEGORIES = [
  'Minutes Sedentary',
  'Minutes Lightly Active',
  'Minutes Fairly Active',
  'Minutes Very Active',
].map((name) => ({ id: name, name }));

function upsertedValues(): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const call of vi.mocked(measurementRepository.upsertCustomMeasurement)
    .mock.calls) {
    const [, , categoryId, value, entryDate] = call as unknown as [
      string,
      string,
      string,
      number,
      string,
    ];
    out[entryDate] = { ...out[entryDate], [categoryId]: value };
  }
  return out;
}

// dailyRollUp responses recorded from a Fitbit account through the
// Google Health API (active-minutes and sedentary-period, 2026-10-09 and -10).
// Rollup points carry no user or device identifiers. On 2026-10-10 Google
// returned only LIGHT: a level with no minutes is left out of the rollup.
const RECORDED_ACTIVITY_ROLLUPS = [
  {
    civilStartTime: { date: { year: 2026, month: 10, day: 9 }, time: {} },
    civilEndTime: { date: { year: 2026, month: 10, day: 10 }, time: {} },
    activeMinutes: {
      activeMinutesRollupByActivityLevel: [
        { activityLevel: 'LIGHT', activeMinutesSum: '304' },
        { activityLevel: 'MODERATE', activeMinutesSum: '86' },
        { activityLevel: 'VIGOROUS', activeMinutesSum: '27' },
      ],
    },
  },
  {
    civilStartTime: { date: { year: 2026, month: 10, day: 10 }, time: {} },
    civilEndTime: { date: { year: 2026, month: 10, day: 11 }, time: {} },
    activeMinutes: {
      activeMinutesRollupByActivityLevel: [
        { activityLevel: 'LIGHT', activeMinutesSum: '309' },
      ],
    },
  },
  {
    civilStartTime: { date: { year: 2026, month: 10, day: 9 }, time: {} },
    civilEndTime: { date: { year: 2026, month: 10, day: 10 }, time: {} },
    sedentaryPeriod: { durationSum: '31740s' },
  },
  {
    civilStartTime: { date: { year: 2026, month: 10, day: 10 }, time: {} },
    civilEndTime: { date: { year: 2026, month: 10, day: 11 }, time: {} },
    sedentaryPeriod: { durationSum: '32040s' },
  },
];

describe('processGoogleActivityMinutes', () => {
  beforeEach(() => {
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue(
      ACTIVITY_CATEGORIES as never
    );
  });

  it('stores Google daily totals per day from recorded rollups (issue #2915)', async () => {
    await processGoogleActivityMinutes(
      UID,
      CID,
      rollupPoints(...RECORDED_ACTIVITY_ROLLUPS)
    );
    expect(upsertedValues()).toEqual({
      '2026-10-09': {
        'Minutes Lightly Active': 304,
        'Minutes Fairly Active': 86,
        'Minutes Very Active': 27,
        'Minutes Sedentary': 529,
      },
      // MODERATE and VIGOROUS were absent from the rollup, so they are 0
      '2026-10-10': {
        'Minutes Lightly Active': 309,
        'Minutes Fairly Active': 0,
        'Minutes Very Active': 0,
        'Minutes Sedentary': 534,
      },
    });
  });

  it('writes nothing for a day whose rollup has no activity levels', async () => {
    const point = {
      civilStartTime: { date: { year: 2026, month: 10, day: 9 } },
      activeMinutes: {},
    };
    await processGoogleActivityMinutes(UID, CID, rollupPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });

  it('skips a point with no civilStartTime date', async () => {
    const point = {
      activeMinutes: {
        activeMinutesRollupByActivityLevel: [
          { activityLevel: 'MODERATE', activeMinutesSum: '10' },
        ],
      },
    };
    await processGoogleActivityMinutes(UID, CID, rollupPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });
});

// ─── Core body temperature ───────────────────────────────────────────────────

// Shape from the Google Health API v4 discovery document (CoreBodyTemperature):
// temperatureCelsius is a number, sampleTime.physicalTime the instant.
describe('processGoogleCoreTemperature', () => {
  it('reads temperatureCelsius', async () => {
    const point = {
      coreBodyTemperature: {
        sampleTime: { physicalTime: '2026-10-09T14:00:00Z' },
        temperatureCelsius: 37.1,
      },
    };
    await processGoogleCoreTemperature(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID,
      CID,
      'cat-1',
      37.1,
      '2026-10-09',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
    );
  });

  it('skips a point without temperatureCelsius', async () => {
    const point = {
      coreBodyTemperature: {
        sampleTime: { physicalTime: '2026-10-09T14:00:00Z' },
      },
    };
    await processGoogleCoreTemperature(UID, CID, dataPoints(point));
    expect(
      measurementRepository.upsertCustomMeasurement
    ).not.toHaveBeenCalled();
  });
});

describe('processGoogleSleep — overnight biometrics', () => {
  const night = () =>
    dataPoints(sleepPoint('2026-10-14T23:00:00Z', '2026-10-15T07:00:00Z'));

  it('attaches HRV and resting heart rate for the wake day and keeps stored values otherwise', async () => {
    await processGoogleSleep(UID, CID, night(), 'UTC', {
      hrvByDate: new Map([['2026-10-15', 42.3]]),
      restingHrByDate: new Map([['2026-10-15', 58]]),
    });
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-10-15',
        avg_overnight_hrv: 42.3,
        resting_heart_rate: 58,
      }),
      { keepExistingBiometrics: true }
    );
  });

  it('leaves both fields unset when the maps lack the date', async () => {
    await processGoogleSleep(UID, CID, night(), 'UTC', {
      hrvByDate: new Map([['2026-10-14', 40]]),
      restingHrByDate: new Map([['2026-10-16', 60]]),
    });
    const [, , entry, options] = vi.mocked(sleepRepository.upsertSleepEntry)
      .mock.calls[0];
    expect(entry.avg_overnight_hrv).toBeUndefined();
    expect(entry.resting_heart_rate).toBeUndefined();
    expect(options).toEqual({ keepExistingBiometrics: true });
  });

  it('keeps zero-valued biometrics through the date maps and onto the night', async () => {
    const hrvByDate = dailyHrvByDate(
      dataPoints({
        dailyHeartRateVariability: {
          date: { year: 2026, month: 10, day: 15 },
          averageHeartRateVariabilityMilliseconds: 0,
        },
      }),
      'UTC'
    );
    const restingHrByDate = dailyRestingHeartRateByDate(
      dataPoints({
        dailyRestingHeartRate: {
          date: { year: 2026, month: 10, day: 15 },
          beatsPerMinute: 0,
        },
      }),
      'UTC'
    );
    await processGoogleSleep(UID, CID, night(), 'UTC', {
      hrvByDate,
      restingHrByDate,
    });
    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-10-15',
        avg_overnight_hrv: 0,
        resting_heart_rate: 0,
      }),
      { keepExistingBiometrics: true }
    );
  });

  it('leaves both fields unset when no maps are passed', async () => {
    await processGoogleSleep(UID, CID, night());
    const [, , entry, options] = vi.mocked(sleepRepository.upsertSleepEntry)
      .mock.calls[0];
    expect(entry.avg_overnight_hrv).toBeUndefined();
    expect(entry.resting_heart_rate).toBeUndefined();
    expect(options).toEqual({ keepExistingBiometrics: true });
  });
});

describe('daily biometric date maps', () => {
  it('dailyHrvByDate uses the same date key processGoogleHRV stores', async () => {
    const point = {
      dailyHeartRateVariability: {
        date: { year: 2026, month: 10, day: 15 },
        averageHeartRateVariabilityMilliseconds: 42.3,
      },
    };
    const map = dailyHrvByDate(dataPoints(point), 'UTC');
    expect([...map.entries()]).toEqual([['2026-10-15', 42.3]]);
    await processGoogleHRV(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID,
      CID,
      'cat-1',
      42.3,
      '2026-10-15',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
    );
  });

  it('dailyRestingHeartRateByDate uses the same date key processGoogleHeartRate stores', async () => {
    const point = {
      dailyRestingHeartRate: {
        date: { year: 2026, month: 10, day: 15 },
        beatsPerMinute: 58,
      },
    };
    const map = dailyRestingHeartRateByDate(dataPoints(point), 'UTC');
    expect([...map.entries()]).toEqual([['2026-10-15', 58]]);
    await processGoogleHeartRate(UID, CID, dataPoints(point));
    expect(measurementRepository.upsertCustomMeasurement).toHaveBeenCalledWith(
      UID,
      CID,
      'cat-1',
      58,
      '2026-10-15',
      0,
      expect.any(String),
      expect.any(String),
      'Daily',
      'Google Health'
    );
  });

  it('returns empty maps for null data and skips points without a value', () => {
    expect(dailyHrvByDate(null, 'UTC').size).toBe(0);
    expect(dailyRestingHeartRateByDate(undefined, 'UTC').size).toBe(0);
    const p = {
      dailyRestingHeartRate: { date: { year: 2026, month: 10, day: 15 } },
    };
    expect(dailyRestingHeartRateByDate(dataPoints(p), 'UTC').size).toBe(0);
  });
});
