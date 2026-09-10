import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import activityDetailsRepository from '../models/activityDetailsRepository.js';
import { processStravaActivities } from '../integrations/strava/stravaDataProcessor.js';

type StravaActivity = NonNullable<
  Parameters<typeof processStravaActivities>[2]
>[number];

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
    updateExerciseEntryTelemetryOnly: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));

const UID = 1;
const CID = 1;

describe('processStravaActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(exerciseRepository.findExerciseByNameAndUserId).mockResolvedValue(
      { id: 'exercise-1', name: 'Morning Run' }
    );
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    await processStravaActivities(UID, CID, [
      {
        id: 987,
        name: 'Morning Run',
        sport_type: 'Run',
        start_date_local: '2026-07-15T07:30:00Z',
        moving_time: 1800,
        distance: 5000,
        average_heartrate: 140.4,
        calories: 300,
      } as StravaActivity,
    ]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Strava',
      null,
      { activityDetail: undefined }
    );
  });

  it('passes repeated complete snapshots through the entry transaction', async () => {
    const activity = { id: 987, name: 'Morning Run' };
    const detail = { ...activity, resource_state: 3, calories: 300 };

    for (let i = 0; i < 2; i++) {
      await processStravaActivities(UID, CID, [activity], { 987: detail });
    }

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledTimes(
      2
    );
    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({ source_id: '987', calories_burned: 300 }),
      CID,
      'Strava',
      null,
      {
        activityDetail: {
          provider_name: 'Strava',
          detail_type: 'full_activity_data',
          detail_data: detail,
          created_by_user_id: String(CID),
          updated_by_user_id: String(CID),
        },
      }
    );
    expect(
      activityDetailsRepository.createActivityDetail
    ).not.toHaveBeenCalled();
  });

  it('does not replace a complete snapshot when the next detail fetch is missing', async () => {
    const activity = { id: 987, name: 'Morning Run' };
    await processStravaActivities(UID, CID, [activity], {
      987: { ...activity, resource_state: 3, calories: 300 },
    });
    await processStravaActivities(UID, CID, [activity]);

    expect(
      exerciseEntryRepository.createExerciseEntry
    ).toHaveBeenLastCalledWith(
      UID,
      expect.objectContaining({ source_id: '987' }),
      CID,
      'Strava',
      null,
      { activityDetail: undefined }
    );
    expect(
      activityDetailsRepository.createActivityDetail
    ).not.toHaveBeenCalled();
  });
});
