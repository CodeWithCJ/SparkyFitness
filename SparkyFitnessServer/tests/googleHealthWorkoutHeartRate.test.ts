import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getWorkoutEntriesWithoutHeartRate } from '../models/workoutTelemetryRepository.js';
import exerciseEntryService from '../services/exerciseEntryService.js';
import { fetchHeartRateSamples } from '../integrations/googlehealth/googleHealthService.js';
import {
  attachHeartRateToLoggedWorkouts,
  mergeWindows,
  parseHeartRateSamples,
} from '../integrations/googlehealth/googleHealthWorkoutHeartRate.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/workoutTelemetryRepository.js', () => ({
  getWorkoutEntriesWithoutHeartRate: vi.fn(),
}));
vi.mock('../services/exerciseEntryService.js', () => ({
  default: { attachWatchTelemetryToExerciseEntry: vi.fn() },
}));
vi.mock('../integrations/googlehealth/googleHealthService.js', () => ({
  fetchHeartRateSamples: vi.fn(),
}));

const userId = 'user-1';
const NOW = Date.parse('2026-11-02T20:00:00Z');

/** A Google Health `heart-rate` data point as the v4 API returns it. */
function point(iso: string, bpm: number | string) {
  return {
    name: `users/me/dataTypes/heart-rate/dataPoints/${iso}`,
    heartRate: {
      sampleTime: { physicalTime: iso, utcOffset: '-18000s' },
      beatsPerMinute: String(bpm),
    },
  };
}

/** One reading every 10 seconds from `fromIso` up to (not including) `toIso`. */
function readings(fromIso: string, toIso: string, bpm = 120) {
  const points = [];
  for (let ms = Date.parse(fromIso); ms < Date.parse(toIso); ms += 10_000) {
    points.push(point(new Date(ms).toISOString(), bpm));
  }
  return { dataPoints: points };
}

/** A strength exercise logged at 12:00 New York time (EST, 17:00 UTC) for 20 minutes. */
function entry(id: string, entry_time = '12:00:00', duration_minutes = 20) {
  return {
    id,
    entry_date: '2026-11-02',
    entry_time,
    record_timezone: null,
    duration_minutes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseHeartRateSamples', () => {
  it('reads the time and bpm of each point, oldest first', () => {
    expect(
      parseHeartRateSamples({
        dataPoints: [
          point('2026-11-02T17:00:10Z', '121'),
          point('2026-11-02T17:00:00Z', 118),
        ],
      })
    ).toEqual([
      { t: '2026-11-02T17:00:00.000Z', bpm: 118 },
      { t: '2026-11-02T17:00:10.000Z', bpm: 121 },
    ]);
  });

  it('skips points without a usable time or bpm', () => {
    expect(
      parseHeartRateSamples({
        dataPoints: [
          { heartRate: { beatsPerMinute: '100' } },
          point('not a time', 100),
          point('2026-11-02T17:00:00Z', 0),
          point('2026-11-02T17:00:10Z', 'abc'),
          { weight: {} },
        ],
      })
    ).toEqual([]);
  });

  it('returns nothing for an empty response', () => {
    expect(parseHeartRateSamples({})).toEqual([]);
  });
});

describe('mergeWindows', () => {
  it('joins workouts within an hour of each other into one span', () => {
    expect(
      mergeWindows([
        { id: 'b', window: { startMs: 3_000_000, endMs: 4_000_000 } },
        { id: 'a', window: { startMs: 0, endMs: 1_000_000 } },
        { id: 'c', window: { startMs: 20_000_000, endMs: 21_000_000 } },
      ])
    ).toEqual([
      { startMs: 0, endMs: 4_000_000 },
      { startMs: 20_000_000, endMs: 21_000_000 },
    ]);
  });
});

describe('attachHeartRateToLoggedWorkouts', () => {
  it('attaches the readings taken during each exercise', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('bench', '12:00:00', 20),
      entry('row', '12:20:00', 15),
    ]);
    vi.mocked(fetchHeartRateSamples).mockResolvedValue(
      readings('2026-11-02T16:55:00Z', '2026-11-02T17:45:00Z')
    );

    const attached = await attachHeartRateToLoggedWorkouts(
      userId,
      '2026-11-01',
      '2026-11-02',
      'America/New_York',
      'token',
      0,
      NOW
    );

    expect(attached).toBe(2);
    // One request covers the whole session plus the settle margin.
    expect(fetchHeartRateSamples).toHaveBeenCalledTimes(1);
    expect(fetchHeartRateSamples).toHaveBeenCalledWith(
      userId,
      '2026-11-02T17:00:00.000Z',
      '2026-11-02T17:40:00.000Z',
      'token'
    );
    const calls = vi.mocked(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).mock.calls;
    const bench = calls.find((call) => call[2] === 'bench')!;
    expect(bench[0]).toBe(userId);
    expect(bench[3]!.length).toBe(121); // 17:00:00 through 17:20:00 inclusive
    expect(bench[3]![0]).toEqual({ t: '2026-11-02T17:00:00.000Z', bpm: 120 });
    expect(bench[3]![120]).toEqual({ t: '2026-11-02T17:20:00.000Z', bpm: 120 });
    expect(bench[8]).toBe('Google Health');
    // Calories and duration are left to the workout itself.
    expect(bench.slice(4, 8)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('waits when the tracker has not synced past the end of the workout', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('bench'),
    ]);
    vi.mocked(fetchHeartRateSamples).mockResolvedValue(
      readings('2026-11-02T17:00:00Z', '2026-11-02T17:12:00Z')
    );

    const attached = await attachHeartRateToLoggedWorkouts(
      userId,
      '2026-11-01',
      '2026-11-02',
      'America/New_York',
      'token',
      0,
      NOW
    );

    expect(attached).toBe(0);
    expect(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).not.toHaveBeenCalled();
  });

  it('leaves a workout that has not finished yet for a later sync', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('bench', '12:00:00', 20),
    ]);

    const attached = await attachHeartRateToLoggedWorkouts(
      userId,
      '2026-11-01',
      '2026-11-02',
      'America/New_York',
      'token',
      0,
      Date.parse('2026-11-02T17:10:00Z')
    );

    expect(attached).toBe(0);
    expect(fetchHeartRateSamples).not.toHaveBeenCalled();
  });

  it('does nothing without logged workouts', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([]);

    await expect(
      attachHeartRateToLoggedWorkouts(
        userId,
        '2026-11-01',
        '2026-11-02',
        'America/New_York',
        'token',
        0,
        NOW
      )
    ).resolves.toBe(0);
    expect(fetchHeartRateSamples).not.toHaveBeenCalled();
  });

  it('skips a workout with fewer than two readings', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('bench'),
    ]);
    vi.mocked(fetchHeartRateSamples).mockResolvedValue({
      dataPoints: [
        point('2026-11-02T17:05:00Z', 110),
        point('2026-11-02T17:30:00Z', 90),
      ],
    });

    await expect(
      attachHeartRateToLoggedWorkouts(
        userId,
        '2026-11-01',
        '2026-11-02',
        'America/New_York',
        'token',
        0,
        NOW
      )
    ).resolves.toBe(0);
  });

  it('uses the zone the workout was recorded in', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      { ...entry('bench', '10:00:00', 20), record_timezone: 'America/Denver' },
    ]);
    vi.mocked(fetchHeartRateSamples).mockResolvedValue(
      readings('2026-11-02T17:00:00Z', '2026-11-02T17:30:00Z')
    );

    await attachHeartRateToLoggedWorkouts(
      userId,
      '2026-11-01',
      '2026-11-02',
      'America/New_York',
      'token',
      0,
      NOW
    );

    // 10:00 in Denver is 17:00 UTC on 2 November (MST, UTC-7).
    expect(vi.mocked(fetchHeartRateSamples).mock.calls[0][1]).toBe(
      '2026-11-02T17:00:00.000Z'
    );
  });

  it('keeps going when one workout cannot be updated', async () => {
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('bench', '12:00:00', 20),
      entry('row', '12:20:00', 15),
    ]);
    vi.mocked(fetchHeartRateSamples).mockResolvedValue(
      readings('2026-11-02T16:55:00Z', '2026-11-02T17:45:00Z')
    );
    vi.mocked(exerciseEntryService.attachWatchTelemetryToExerciseEntry)
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce(undefined);

    await expect(
      attachHeartRateToLoggedWorkouts(
        userId,
        '2026-11-01',
        '2026-11-02',
        'America/New_York',
        'token',
        0,
        NOW
      )
    ).resolves.toBe(1);
  });

  it('keeps going when the readings for one span cannot be fetched', async () => {
    // More than an hour apart, so each workout gets its own request.
    vi.mocked(getWorkoutEntriesWithoutHeartRate).mockResolvedValue([
      entry('morning', '10:00:00', 20),
      entry('afternoon', '13:00:00', 20),
    ]);
    vi.mocked(fetchHeartRateSamples)
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(
        readings('2026-11-02T17:55:00Z', '2026-11-02T18:30:00Z')
      );

    await expect(
      attachHeartRateToLoggedWorkouts(
        userId,
        '2026-11-01',
        '2026-11-02',
        'America/New_York',
        'token',
        0,
        NOW
      )
    ).resolves.toBe(1);
    expect(fetchHeartRateSamples).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(
      exerciseEntryService.attachWatchTelemetryToExerciseEntry
    ).mock.calls;
    expect(calls.map((call) => call[2])).toEqual(['afternoon']);
  });
});
