import { vi, beforeEach, describe, expect, it } from 'vitest';
import { instantHourMinuteWithOffset } from '@workspace/shared';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import sleepRepository from '../models/sleepRepository.js';
import {
  processFitbitActivities,
  processFitbitSleep,
} from '../integrations/fitbit/fitbitDataProcessor.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/measurementRepository.js', () => ({ default: {} }));
vi.mock('../models/exercise.js', () => ({
  default: {
    findExerciseByNameAndUserId: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    createExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn(),
    deleteSleepStageEventsByEntryId: vi.fn(),
    upsertSleepStageEvent: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));

const UID = 'user-1';
const CID = 'user-1';

describe('processFitbitActivities duration units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      { id: 'exercise-1', name: 'Run' }
    );
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    await processFitbitActivities(UID, CID, {
      activities: [
        {
          logId: 999,
          activityName: 'Run',
          activityParentName: 'Run',
          startTime: '2026-07-15T10:00:00.000',
          duration: 1800000,
          calories: 300,
          distance: 5.2,
          averageHeartRate: 140,
        },
      ],
    });

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Fitbit'
    );
  });
});

describe('processFitbitSleep recording-zone stamp (issue #2033)', () => {
  const sleepData = {
    sleep: [
      {
        dateOfSleep: '2026-01-16',
        startTime: '2026-01-15T23:00:00.000', // offset-less local time
        endTime: '2026-01-16T07:00:00.000',
        duration: 28800000,
        minutesAsleep: 450,
        efficiency: 94,
        levels: { summary: {}, data: [] },
      },
    ],
  };
  const offsetMs = -4 * 3600000; // profile offset fetched in summer (EDT)

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
    });
  });

  it('stamps the exact offset the parser used, so display round-trips the reported wall clock across DST', async () => {
    await processFitbitSleep(UID, CID, sleepData, offsetMs, -240);

    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBe(-240);
    // A January night parsed with the summer offset: displaying with the
    // same stored offset must reproduce Fitbit's reported 23:00, even though
    // the historical zone offset that January was -300.
    const { hour, minute } = instantHourMinuteWithOffset(
      new Date(entry.bedtime),
      entry.record_utc_offset_minutes
    );
    expect({ hour, minute }).toEqual({ hour: 23, minute: 0 });
  });

  it('stamps NULL when the profile carried no offset (no false UTC claim)', async () => {
    await processFitbitSleep(UID, CID, sleepData, 0, null);

    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeNull();
  });
});
