import { vi, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import userRepository from '../models/userRepository.js';
import { attachWatchTelemetryToExerciseEntry } from '../services/exerciseEntryService.js';
import { upsertSamplesByDay } from '../services/healthMetricSampleWriter.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../models/exerciseEntry.js')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      getExerciseEntryOwnerId: vi.fn(),
      applyWatchTelemetryAtomically: vi.fn(),
    },
  };
});
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../services/healthMetricSampleWriter', () => ({
  upsertSamplesByDay: vi.fn(),
}));
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(() => Promise.resolve('UTC')),
}));
vi.mock('../models/userRepository', () => ({
  default: { getUserProfile: vi.fn() },
}));
vi.mock('../models/heartRateZoneRepository', () => ({
  getHeartRateZoneSettings: vi.fn().mockResolvedValue({
    maxHeartRate: null,
    restingHeartRate: null,
    method: 'percent_max',
    customFloors: null,
  }),
}));
vi.mock('../models/workoutTelemetryRepository', () => ({
  bulkInsertExerciseEntryHrZones: vi.fn(),
  replaceExerciseEntryHrZones: vi.fn(),
}));

const userId = 'user-1';
const entryId = 'entry-1';

/** A flat series, so the zone it lands in is decided purely by the max-HR ceiling. */
function series(bpm: number, count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    t: new Date(Date.UTC(2026, 0, 1, 12, 0, index * 10)).toISOString(),
    bpm,
  }));
}

describe('attachWatchTelemetryToExerciseEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryOwnerId.mockResolvedValue(userId);
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.applyWatchTelemetryAtomically.mockImplementation(
      async (...args: unknown[]) => {
        const onAccepted = args[5];
        if (typeof onAccepted === 'function') await onAccepted();
      }
    );
    // @ts-expect-error TS(2339): mock method not on typed function.
    userRepository.getUserProfile.mockResolvedValue({ date_of_birth: null });
  });

  it('derives the zone ceiling from the stored date of birth', async () => {
    // @ts-expect-error TS(2339): mock method not on typed function.
    userRepository.getUserProfile.mockResolvedValue({
      date_of_birth: '1971-01-01',
    });

    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );

    const zones = vi.mocked(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).mock.calls[0][4];
    if (!zones) throw new Error('expected zones');
    // Mid-fifties, so the Nes estimate puts max HR near 176 and zone 4 starts
    // at 0.8 x that. The pairing with the case below is the point: the same
    // series must not be filed under a different zone depending on whether it
    // arrived from the wrist or from a later sync of the same workout.
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(4);
  });

  it('falls back to the observed max when no date of birth is stored', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );

    const zones = vi.mocked(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).mock.calls[0][4];
    if (!zones) throw new Error('expected zones');
    // FALLBACK_MAX_HR (190) rather than an age estimate, which lands the very
    // same 150 bpm a zone lower.
    expect(zones).toHaveLength(1);
    expect(zones[0].zone_index).toBe(3);
    expect(zones[0].zone_lower_bpm).toBe(133);
  });

  it('writes measured calories with no series at all', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      undefined,
      312.4
    );

    expect(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).toHaveBeenCalledWith(
      entryId,
      userId,
      userId,
      {
        calories_burned: 312,
        active_calories: 312,
      },
      null,
      undefined,
      false
    );
  });

  it("404s instead of attaching telemetry to another user's entry", async () => {
    // @ts-expect-error TS(2339): mock method not on typed function.
    exerciseEntryRepository.getExerciseEntryOwnerId.mockResolvedValue(
      'someone-else'
    );

    await expect(
      attachWatchTelemetryToExerciseEntry(userId, userId, entryId, series(150))
    ).rejects.toMatchObject({ status: 404 });

    expect(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).not.toHaveBeenCalled();
  });

  it('hands the proposed snapshot to the atomic writer', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150),
      200
    );

    expect(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).toHaveBeenCalledWith(
      entryId,
      userId,
      userId,
      expect.objectContaining({
        max_heart_rate: 150,
        calories_burned: 200,
        active_calories: 200,
      }),
      expect.any(Array),
      expect.any(Function),
      false
    );
  });

  describe('Apple zones', () => {
    const appleZones = [
      { index: 1, minimumBpm: null, maximumBpm: 100, seconds: 60 },
      { index: 2, minimumBpm: 100, maximumBpm: 120, seconds: 0 },
      { index: 3, minimumBpm: 120, maximumBpm: 140, seconds: 300 },
      { index: 4, minimumBpm: 140, maximumBpm: 160, seconds: 120 },
      { index: 5, minimumBpm: 160, maximumBpm: null, seconds: 30 },
    ];

    it('stores the zone group as device zones and replaces the session', async () => {
      await attachWatchTelemetryToExerciseEntry(
        userId,
        userId,
        entryId,
        undefined,
        undefined,
        undefined,
        appleZones
      );

      expect(
        exerciseEntryRepository.applyWatchTelemetryAtomically
      ).toHaveBeenCalledWith(
        entryId,
        userId,
        userId,
        {},
        [
          {
            zone_index: 1,
            zone_lower_bpm: 30,
            zone_upper_bpm: 99,
            seconds_in_zone: 60,
            zone_method: 'device',
          },
          {
            zone_index: 3,
            zone_lower_bpm: 120,
            zone_upper_bpm: 139,
            seconds_in_zone: 300,
            zone_method: 'device',
          },
          {
            zone_index: 4,
            zone_lower_bpm: 140,
            zone_upper_bpm: 159,
            seconds_in_zone: 120,
            zone_method: 'device',
          },
          {
            zone_index: 5,
            zone_lower_bpm: 160,
            zone_upper_bpm: null,
            seconds_in_zone: 30,
            zone_method: 'device',
          },
        ],
        undefined,
        true
      );
    });

    it('ignores a zone group that is not five usable zones', async () => {
      await attachWatchTelemetryToExerciseEntry(
        userId,
        userId,
        entryId,
        undefined,
        312,
        undefined,
        appleZones.slice(0, 4)
      );

      expect(
        exerciseEntryRepository.applyWatchTelemetryAtomically
      ).toHaveBeenCalledWith(
        entryId,
        userId,
        userId,
        expect.objectContaining({ calories_burned: 312 }),
        null,
        undefined,
        false
      );
    });
  });
});

describe('filterStaleWatchTelemetryFields', () => {
  it('drops max HR and calories that would roll stored snapshots backwards', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields, skipHr } = filterStaleWatchTelemetryFields(
      { max_heart_rate: 178, active_calories: 400 },
      {
        avg_heart_rate: 150,
        max_heart_rate: 150,
        calories_burned: 200,
        active_calories: 200,
      }
    );
    expect(skipHr).toBe(true);
    expect(fields).toEqual({});
  });

  it('keeps a newer max and measured calories', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields, skipHr } = filterStaleWatchTelemetryFields(
      { max_heart_rate: 140, active_calories: 100 },
      {
        avg_heart_rate: 150,
        max_heart_rate: 178,
        calories_burned: 200,
        active_calories: 200,
      }
    );
    expect(skipHr).toBe(false);
    expect(fields.max_heart_rate).toBe(178);
    expect(fields.active_calories).toBe(200);
  });

  it('rejects an older snapshot when max HR and calories are tied', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields, skipHr } = filterStaleWatchTelemetryFields(
      {
        max_heart_rate: 170,
        active_calories: 200,
        watch_telemetry_observed_at: '2026-01-01T12:01:00.000Z',
      },
      {
        avg_heart_rate: 140,
        max_heart_rate: 170,
        calories_burned: 200,
        active_calories: 200,
        watch_telemetry_observed_at: '2026-01-01T12:00:30.000Z',
      }
    );
    expect(skipHr).toBe(true);
    expect(fields.avg_heart_rate).toBeUndefined();
    expect(fields.watch_telemetry_observed_at).toBeUndefined();
    expect(fields.active_calories).toBe(200);
  });

  it('accepts a later snapshot with the same max HR', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields, skipHr } = filterStaleWatchTelemetryFields(
      {
        max_heart_rate: 170,
        active_calories: 200,
        watch_telemetry_observed_at: '2026-01-01T12:00:30.000Z',
      },
      {
        avg_heart_rate: 145,
        max_heart_rate: 170,
        calories_burned: 200,
        active_calories: 200,
        watch_telemetry_observed_at: '2026-01-01T12:01:00.000Z',
      }
    );
    expect(skipHr).toBe(false);
    expect(fields.avg_heart_rate).toBe(145);
    expect(fields.watch_telemetry_observed_at).toBe('2026-01-01T12:01:00.000Z');
  });

  it('replaces a phone share with the watch measurement', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields } = filterStaleWatchTelemetryFields(
      { duration_minutes: 14 },
      { duration_minutes: 3.5 }
    );
    expect(fields.duration_minutes).toBe(3.5);
    expect(fields.watch_duration_minutes).toBe(3.5);
  });

  it('records the watch duration separately from a longer stored duration', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields } = filterStaleWatchTelemetryFields(
      { duration_minutes: 20, watch_duration_minutes: 14 },
      { duration_minutes: 16 }
    );
    expect(fields.duration_minutes).toBe(16);
    expect(fields.watch_duration_minutes).toBe(16);
  });

  it('does not shrink a longer watch window with a later shorter flush', async () => {
    const { filterStaleWatchTelemetryFields } =
      await import('../models/exerciseEntry.js');
    const { fields } = filterStaleWatchTelemetryFields(
      { duration_minutes: 14, watch_duration_minutes: 14 },
      { duration_minutes: 3.5 }
    );
    expect(fields.duration_minutes).toBe(14);
    expect(fields.watch_duration_minutes).toBe(14);
  });

  it('prefers the watch duration over the phone share on an ordinary save', async () => {
    const { ordinaryDurationMinutes } =
      await import('../models/exerciseEntry.js');
    expect(ordinaryDurationMinutes(4.5, 14, 14)).toBe(14);
    expect(ordinaryDurationMinutes(20, 14, 14)).toBe(14);
    expect(ordinaryDurationMinutes(4.5, 20, 14)).toBe(14);
    expect(ordinaryDurationMinutes(4.5, 0, null)).toBe(4.5);
    expect(ordinaryDurationMinutes(undefined, 20, 14)).toBe(20);
  });

  it('resolves the watch floor against the row at write time', async () => {
    const { _updateExerciseEntryWithClient } = exerciseEntryRepository;
    const queries: { sql: string; params: unknown[] }[] = [];
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        queries.push({ sql, params });
        if (sql.startsWith('UPDATE exercise_entries')) {
          return { rows: [{ id: entryId }], rowCount: 1 };
        }
        // The read sees no measurement yet; telemetry commits 14 minutes
        // before the UPDATE runs, so only the UPDATE can see it.
        return {
          rows: [
            {
              id: entryId,
              user_id: userId,
              duration_minutes: 4,
              watch_duration_minutes: null,
            },
          ],
          rowCount: 1,
        };
      }),
    };
    await _updateExerciseEntryWithClient(
      client as unknown as PoolClient,
      entryId,
      userId,
      { duration_minutes: 4.5 },
      userId,
      undefined
    );
    const update = queries.find((q) =>
      q.sql.startsWith('UPDATE exercise_entries')
    );
    expect(update?.params[1]).toBe(4.5);
    expect(update?.sql).toMatch(
      /duration_minutes = CASE[\s\S]*WHEN watch_duration_minutes IS NOT NULL\s+THEN watch_duration_minutes\s+ELSE \$2::numeric/
    );
    expect(update?.sql).not.toMatch(
      /GREATEST\(\$2::numeric, watch_duration_minutes\)/
    );
  });
});

describe('attachWatchTelemetryToExerciseEntry heart rate series', () => {
  beforeEach(() => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue(userId);
    vi.mocked(userRepository.getUserProfile).mockResolvedValue(null as never);
    vi.mocked(upsertSamplesByDay).mockReset();
  });

  it('stores the series tagged with the entry, replacing only its own span', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );
    expect(upsertSamplesByDay).toHaveBeenCalledTimes(1);
    const [, , metric, , samples, options] =
      vi.mocked(upsertSamplesByDay).mock.calls[0];
    expect(metric).toBe('heart_rate');
    expect(samples).toHaveLength(10);
    expect(samples[0]).toMatchObject({ ex: entryId, bpm: 150 });
    expect(options).toMatchObject({ mode: 'merge', ex: entryId });
  });

  it('keeps the series under the watch provider by default', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );
    expect(vi.mocked(upsertSamplesByDay).mock.calls[0][3]).toBe(
      'SparkyFitness Watch'
    );
  });

  it('keeps the series under the provider the caller names', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150),
      undefined,
      undefined,
      undefined,
      undefined,
      'Google Health'
    );
    expect(vi.mocked(upsertSamplesByDay).mock.calls[0][3]).toBe(
      'Google Health'
    );
  });

  it('writes no series when the snapshot was rejected', async () => {
    vi.mocked(
      exerciseEntryRepository.applyWatchTelemetryAtomically
    ).mockResolvedValue(undefined);
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      series(150)
    );
    expect(upsertSamplesByDay).not.toHaveBeenCalled();
  });

  it('writes no series for a calories-only post', async () => {
    await attachWatchTelemetryToExerciseEntry(
      userId,
      userId,
      entryId,
      undefined,
      300
    );
    expect(upsertSamplesByDay).not.toHaveBeenCalled();
  });

  it('does not fail the post when the series cannot be stored', async () => {
    vi.mocked(upsertSamplesByDay).mockRejectedValueOnce(new Error('db down'));
    await expect(
      attachWatchTelemetryToExerciseEntry(userId, userId, entryId, series(150))
    ).resolves.toBeUndefined();
  });
});
