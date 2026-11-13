import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import measurementRepository from '../models/measurementRepository.js';
import { log } from '../config/logging.js';
import sleepRepository from '../models/sleepRepository.js';
import {
  processWithingsMeasures,
  processWithingsSleepData,
  processWithingsWorkouts,
} from '../integrations/withings/withingsDataProcessor.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/measurementRepository.js', () => ({
  default: { upsertCheckInMeasurements: vi.fn() },
}));
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
vi.mock('../models/sleepRepository.js', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));

const UID = 'user-1';
const CID = 'user-1';

describe('processWithingsWorkouts duration units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      exerciseRepository.getExerciseBySourceAndSourceId
    ).mockResolvedValue({ id: 'exercise-1', name: 'Run' });
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    const startdate = 1750000000;
    await processWithingsWorkouts(UID, CID, [
      {
        startdate,
        enddate: startdate + 1800,
        category: 2,
        data: {
          calories: 300,
          distance: 5000,
          steps: 4000,
          intensity: 50,
          hr_average: 140,
        },
      },
    ] as Parameters<typeof processWithingsWorkouts>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Withings'
    );
  });

  // exercise_entries has no unique constraint, and 'Withings' is not in the
  // sync-source list that skips the manual one-per-exercise-per-day lookup.
  // An entry with no source_id therefore matched the earlier workout of the
  // same category and overwrote it, so the day kept only the last one.
  it('stores every workout of the same category on one day', async () => {
    const startdate = 1750000000;
    await processWithingsWorkouts(UID, CID, [
      {
        id: 111,
        startdate,
        enddate: startdate + 1800,
        category: 2,
        data: { calories: 300 },
      },
      {
        id: 222,
        startdate: startdate + 7200,
        enddate: startdate + 9000,
        category: 2,
        data: { calories: 250 },
      },
    ] as Parameters<typeof processWithingsWorkouts>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledTimes(
      2
    );
    const sourceIds = vi
      .mocked(exerciseEntryRepository.createExerciseEntry)
      .mock.calls.map(([, entryData]) => entryData.source_id);
    expect(sourceIds).toEqual(['111', '222']);
  });

  it('falls back to the start time when a workout carries no id', async () => {
    const startdate = 1750000000;
    await processWithingsWorkouts(UID, CID, [
      {
        startdate,
        enddate: startdate + 1800,
        category: 2,
        data: { calories: 300 },
      },
    ] as Parameters<typeof processWithingsWorkouts>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({ source_id: `withings-workout-${startdate}` }),
      CID,
      'Withings'
    );
  });
});

describe('processWithingsMeasures malformed payloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      measurementRepository.upsertCheckInMeasurements
    ).mockResolvedValue(undefined);
  });

  // Withings does not guarantee `measures` on every group. Before the guard,
  // a single malformed group threw a TypeError out of the loop and aborted the
  // whole sync, discarding every later group in the same batch.
  it('skips a group with no measures and still processes the rest', async () => {
    const timestamp = 1750000000;
    await expect(
      processWithingsMeasures(UID, CID, [
        { category: 1, date: timestamp },
        { category: 1, date: timestamp, measures: null },
        {
          category: 1,
          date: timestamp,
          measures: [{ type: 1, value: 805, unit: -1 }],
        },
      ] as Parameters<typeof processWithingsMeasures>[2])
    ).resolves.not.toThrow();

    // The one well-formed group still landed.
    expect(
      measurementRepository.upsertCheckInMeasurements
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementRepository.upsertCheckInMeasurements
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.any(String),
      expect.objectContaining({ weight: 80.5 })
    );
    expect(vi.mocked(log)).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('Missing or malformed measures')
    );
  });
});

describe('processWithingsSleepData stage grouping (#3240)', () => {
  // Unix seconds for 2026-10-28 in UTC.
  const at = (hour: number, minute = 0) =>
    Date.UTC(2026, 9, 28, hour, minute) / 1000;
  const summary = (start: number, end: number) => ({
    date: '2026-10-28',
    startdate: start,
    enddate: end,
    data: { total_timeinbed: end - start, total_sleep_time: end - start },
  });
  const segment = (start: number, end: number, state = 1) => ({
    startdate: start,
    enddate: end,
    state,
    date: '2026-10-28',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(sleepRepository, {
      deleteSleepEntriesByEntrySourceAndDate: vi.fn(),
      upsertSleepEntry: vi.fn(),
      upsertSleepStageEvent: vi.fn(),
      updateSleepEntry: vi.fn(),
    });
  });

  const stageEntryIds = () =>
    vi
      .mocked(sleepRepository.upsertSleepStageEvent)
      .mock.calls.map((call) => call[1]);

  it('keeps a nap’s stages on the nap and the night’s on the night', async () => {
    vi.mocked(sleepRepository.upsertSleepEntry)
      .mockResolvedValueOnce({ id: 'night', created: true })
      .mockResolvedValueOnce({ id: 'nap', created: true });

    await processWithingsSleepData(
      UID,
      CID,
      [segment(at(1), at(6)), segment(at(13, 30), at(14, 15))],
      [summary(at(0), at(7)), summary(at(13), at(15))]
    );

    expect(stageEntryIds()).toEqual(['night', 'nap']);
    const totals = vi.mocked(sleepRepository.updateSleepEntry).mock.calls;
    expect(
      totals.map((call) => [call[1], call[3].light_sleep_seconds])
    ).toEqual([
      ['night', 5 * 3600],
      ['nap', 45 * 60],
    ]);
  });

  it('writes one stage total for summaries stored as one entry', async () => {
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'night',
      created: false,
    });

    await processWithingsSleepData(
      UID,
      CID,
      [segment(at(1), at(3)), segment(at(4), at(6), 2)],
      [summary(at(0), at(3)), summary(at(4), at(7))]
    );

    const totals = vi.mocked(sleepRepository.updateSleepEntry).mock.calls;
    expect(totals).toHaveLength(1);
    expect(totals[0][3]).toMatchObject({
      light_sleep_seconds: 2 * 3600,
      deep_sleep_seconds: 2 * 3600,
    });
  });

  it('puts stages outside every summary on that date’s summary entry', async () => {
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'night',
      created: true,
    });

    await processWithingsSleepData(
      UID,
      CID,
      [segment(at(1), at(3)), segment(at(8), at(9))],
      [summary(at(0), at(7))]
    );

    expect(sleepRepository.upsertSleepEntry).toHaveBeenCalledTimes(1);
    expect(stageEntryIds()).toEqual(['night', 'night']);
  });
});
