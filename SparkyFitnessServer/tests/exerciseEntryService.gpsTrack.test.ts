import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { getClient } from '../db/poolManager.js';
import { attachGpsTrackToExerciseEntry } from '../services/exerciseEntryService.js';
import { attachWeatherToExerciseEntry } from '../services/weatherService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
// The weather lookup runs after the commit and would otherwise borrow this
// test's database client.
vi.mock('../services/weatherService', () => ({
  attachWeatherToExerciseEntry: vi.fn(),
}));
vi.mock('../models/exercise', () => ({ default: {} }));
vi.mock('../models/exerciseEntry', () => ({
  default: {
    getExerciseEntryOwnerId: vi.fn(),
    getExerciseEntryById: vi.fn(),
    _updateExerciseEntryTelemetryOnlyWithClient: vi.fn(),
  },
}));
vi.mock('../models/workoutPresetRepository', () => ({ default: {} }));
vi.mock('../models/activityDetailsRepository', () => ({ default: {} }));
vi.mock('../models/preferenceRepository', () => ({ default: {} }));
vi.mock('../models/userRepository', () => ({ default: {} }));
vi.mock('../models/workoutTelemetryRepository', () => ({
  _bulkInsertExerciseEntryGpsPointsWithClient: vi.fn(),
  _bulkInsertExerciseEntryLapsWithClient: vi.fn(),
}));

const userId = 'user-1';
const entryId = 'entry-1';

// About 11 m north per fix, one fix every 5 s, climbing 1 m each time.
const points = Array.from({ length: 6 }, (_, i) => ({
  t: new Date(Date.UTC(2026, 9, 6, 10, 0, i * 5)).toISOString(),
  lat: 51.5 + i * 0.0001,
  lon: -0.12,
  alt: 10 + i,
  speed: 2.2,
}));

const client = { query: vi.fn(), release: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue(client as never);
  client.query.mockResolvedValue({ rows: [] });
  vi.mocked(exerciseEntryRepository.getExerciseEntryOwnerId).mockResolvedValue(
    userId
  );
  vi.mocked(exerciseEntryRepository.getExerciseEntryById).mockResolvedValue({
    id: entryId,
    entry_date: '2026-10-06',
  });
});

describe('attachGpsTrackToExerciseEntry', () => {
  it('stores the route, laps and derived summary in one transaction', async () => {
    await attachGpsTrackToExerciseEntry(userId, 'actor-1', entryId, {
      points,
      laps: [{ lap_index: 7, start_time: points[0].t, end_time: points[5].t }],
    });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM exercise_entry_laps WHERE exercise_entry_id = $1',
      [entryId]
    );
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(attachWeatherToExerciseEntry).toHaveBeenCalledWith(userId, entryId, {
      lat: points[0].lat,
      lon: points[0].lon,
      t: points[0].t,
    });
    const gpsCall = vi.mocked(
      workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient
    ).mock.calls[0];
    expect(gpsCall[2]).toHaveLength(6);
    expect(gpsCall[2][0]).toMatchObject({
      exercise_entry_id: entryId,
      entry_date: '2026-10-06',
      altitude_meters: 10,
    });
    const lapCall = vi.mocked(
      workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient
    ).mock.calls[0];
    // Laps are renumbered densely from 1 whatever the client sent.
    expect(lapCall[2].map((l) => l.lap_index)).toEqual([1]);
    const telemetry = vi.mocked(
      exerciseEntryRepository._updateExerciseEntryTelemetryOnlyWithClient
    ).mock.calls[0][3] as Record<string, number>;
    expect(telemetry.avg_speed_mps).toBeCloseTo(2.2, 1);
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses an invalid timestamp instead of saving a shorter track', async () => {
    await expect(
      attachGpsTrackToExerciseEntry(userId, 'actor-1', entryId, {
        points: [{ ...points[0], t: 'not-a-time' }, points[1]],
      })
    ).rejects.toMatchObject({ status: 400 });

    expect(getClient).not.toHaveBeenCalled();
    expect(
      workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient
    ).not.toHaveBeenCalled();
  });

  it('rolls back and releases the connection when a write fails', async () => {
    vi.mocked(
      workoutTelemetryRepo._bulkInsertExerciseEntryGpsPointsWithClient
    ).mockRejectedValue(new Error('boom'));

    await expect(
      attachGpsTrackToExerciseEntry(userId, 'actor-1', entryId, { points })
    ).rejects.toThrow('boom');

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses an entry that belongs to someone else', async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue('other-user');

    await expect(
      attachGpsTrackToExerciseEntry(userId, 'actor-1', entryId, { points })
    ).rejects.toMatchObject({ status: 404 });
    expect(getClient).not.toHaveBeenCalled();
  });
});
