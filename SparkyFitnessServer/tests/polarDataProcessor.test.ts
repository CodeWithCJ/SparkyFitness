import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import sleepRepository from '../models/sleepRepository.js';
import {
  processPolarExercises,
  processPolarSleep,
} from '../integrations/polar/polarDataProcessor.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/measurementRepository.js', () => ({ default: {} }));
vi.mock('../models/exercise.js', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
    searchExercises: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    deleteExerciseEntriesByEntrySourceAndDate: vi.fn(),
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

describe('processPolarExercises duration units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      exerciseRepository.getExerciseBySourceAndSourceId
    ).mockResolvedValue({ id: 'exercise-1', name: 'Running' });
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    await processPolarExercises(UID, CID, [
      {
        id: 42,
        'start-time': '2026-07-15T10:00:00',
        duration: 'PT30M',
        calories: 300,
        distance: 5000,
        sport: 'RUNNING',
        'detailed-sport-info': 'Running',
      },
    ] as Parameters<typeof processPolarExercises>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Polar'
    );
  });
});

describe('processPolarSleep recording-zone stamp (issue #2033)', () => {
  // processPolarSleep's untyped `sleepData = []` default infers never[].
  const night = (startTime: string) =>
    ({
      date: '2026-07-15',
      'sleep-start-time': startTime,
      'sleep-end-time': '2026-07-15T07:00:00+03:00',
      'light-sleep': 15000,
      'deep-sleep': 6000,
      'rem-sleep': 6000,
      'total-interruption-duration': 1800,
      'sleep-score': 80,
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
    });
  });

  it('stamps the offset from the raw offset-suffixed sleep-start-time', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07+03:00')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBe(180);
  });

  it('omits the stamp for a naive sleep-start-time (no zone claim)', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeUndefined();
  });
});
