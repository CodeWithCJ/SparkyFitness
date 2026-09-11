import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import sleepRepository from '../models/sleepRepository.js';
import {
  hypnogramStageStartMs,
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

describe('processPolarSleep hypnogram stages (issue #2431)', () => {
  // A night recorded at UTC+03:00: bedtime 23:39:07, wake 07:00 local, with the
  // hypnogram keyed by wall-clock HH:MM in that zone. Expected instants are in
  // UTC and must not depend on the zone this test process runs in.
  const night = {
    date: '2026-07-15',
    'sleep-start-time': '2026-07-14T23:39:07+03:00',
    'sleep-end-time': '2026-07-15T07:00:00+03:00',
    'light-sleep': 15000,
    'deep-sleep': 6000,
    'rem-sleep': 6000,
    'total-interruption-duration': 1800,
    'sleep-score': 80,
    hypnogram: { '23:39': 0, '23:50': 4, '02:10': 1, '06:40': 0 },
  } as never;

  const stageCalls = () =>
    vi.mocked(sleepRepository.upsertSleepStageEvent).mock.calls.map(
      (call) =>
        call[2] as {
          stage_type: string;
          start_time: string;
          end_time: string;
          duration_in_seconds: number;
        }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
    });
  });

  it('anchors every stage in the recording zone and ends the last one at wake time', async () => {
    await processPolarSleep(UID, CID, [night]);
    expect(stageCalls()).toEqual([
      {
        stage_type: 'awake',
        start_time: '2026-07-14T20:39:00.000Z',
        end_time: '2026-07-14T20:50:00.000Z',
        duration_in_seconds: 660,
      },
      {
        stage_type: 'deep',
        start_time: '2026-07-14T20:50:00.000Z',
        end_time: '2026-07-14T23:10:00.000Z',
        duration_in_seconds: 8400,
      },
      {
        stage_type: 'rem',
        start_time: '2026-07-14T23:10:00.000Z',
        end_time: '2026-07-15T03:40:00.000Z',
        duration_in_seconds: 16200,
      },
      {
        stage_type: 'awake',
        start_time: '2026-07-15T03:40:00.000Z',
        end_time: '2026-07-15T04:00:00.000Z',
        duration_in_seconds: 1200,
      },
    ]);
  });

  it('keeps the stage total inside the recorded night', async () => {
    await processPolarSleep(UID, CID, [night]);
    const stages = stageCalls();
    const total = stages.reduce((sum, s) => sum + s.duration_in_seconds, 0);
    const nightSeconds =
      (Date.parse('2026-07-15T07:00:00+03:00') -
        Date.parse('2026-07-14T23:39:00+03:00')) /
      1000;
    expect(total).toBe(nightSeconds);
    expect(stages.at(-1)?.end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('clamps stages to the wake time and drops one that starts after it', async () => {
    await processPolarSleep(UID, CID, [
      { ...(night as object), hypnogram: { '23:39': 4, '07:30': 0 } } as never,
    ]);
    const stages = stageCalls();
    expect(stages.map((s) => s.stage_type)).toEqual(['deep']);
    expect(stages[0].end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('orders stages by instant, not by clock string, across midnight', async () => {
    // Keys handed over in a scrambled order: the night is 23:39 → 23:50 → 02:10 → 06:40.
    await processPolarSleep(UID, CID, [
      {
        ...(night as object),
        hypnogram: [
          { time: '06:40', value: 0 },
          { time: '23:50', value: 4 },
          { time: '02:10', value: 1 },
          { time: '23:39', value: 0 },
        ],
      } as never,
    ]);
    expect(stageCalls().map((s) => [s.stage_type, s.start_time])).toEqual([
      ['awake', '2026-07-14T20:39:00.000Z'],
      ['deep', '2026-07-14T20:50:00.000Z'],
      ['rem', '2026-07-14T23:10:00.000Z'],
      ['awake', '2026-07-15T03:40:00.000Z'],
    ]);
  });
});

describe('hypnogramStageStartMs', () => {
  const bedtime = Date.parse('2026-07-14T23:39:07+03:00');

  it('places a key on the anchor day in the recording zone', () => {
    expect(hypnogramStageStartMs('23:39', bedtime, 180)).toBe(
      Date.parse('2026-07-14T23:39:00+03:00')
    );
  });

  it('rolls a key that reads earlier than the anchor onto the next day', () => {
    expect(hypnogramStageStartMs('00:05', bedtime, 180)).toBe(
      Date.parse('2026-07-15T00:05:00+03:00')
    );
    expect(hypnogramStageStartMs('06:40', bedtime, 180)).toBe(
      Date.parse('2026-07-15T06:40:00+03:00')
    );
  });

  it('works for a negative offset and for a naive (UTC) record', () => {
    const west = Date.parse('2026-07-14T22:30:00-05:00');
    expect(hypnogramStageStartMs('22:30', west, -300)).toBe(west);
    expect(hypnogramStageStartMs('06:10', west, -300)).toBe(
      Date.parse('2026-07-15T06:10:00-05:00')
    );
    const naive = Date.parse('2026-07-14T21:00:00Z');
    expect(hypnogramStageStartMs('03:15', naive, 0)).toBe(
      Date.parse('2026-07-15T03:15:00Z')
    );
  });
});
