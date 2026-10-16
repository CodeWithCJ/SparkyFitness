import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import * as workoutTelemetryRepo from '../models/workoutTelemetryRepository.js';
import { getClient } from '../db/poolManager.js';
import { attachLapsToExerciseEntry } from '../services/exerciseEntryService.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../db/poolManager', () => ({ getClient: vi.fn() }));
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

describe('attachLapsToExerciseEntry', () => {
  it('stores the laps with duration and speed worked out, in one transaction', async () => {
    await attachLapsToExerciseEntry(userId, 'actor-1', entryId, {
      laps: [
        {
          lap_index: 1,
          start_time: '2026-10-06T10:00:00.000Z',
          end_time: '2026-10-06T10:05:00.000Z',
          distance_meters: 900,
          avg_heart_rate: 150,
        },
        {
          lap_index: 2,
          start_time: '2026-10-06T10:05:00.000Z',
          end_time: '2026-10-06T10:09:00.000Z',
        },
      ],
    });

    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    const rows = vi.mocked(
      workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient
    ).mock.calls[0][2];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      exercise_entry_id: entryId,
      entry_date: '2026-10-06',
      lap_index: 1,
      duration_seconds: 300,
      distance_meters: 900,
      avg_speed_mps: 3,
      avg_heart_rate: 150,
    });
    expect(rows[1].avg_speed_mps).toBeUndefined();
    expect(client.release).toHaveBeenCalled();
  });

  it('replaces any earlier laps, inside the transaction', async () => {
    await attachLapsToExerciseEntry(userId, 'actor-1', entryId, {
      laps: [
        {
          lap_index: 1,
          start_time: '2026-10-06T10:00:00.000Z',
          end_time: '2026-10-06T10:05:00.000Z',
        },
      ],
    });
    const sql = client.query.mock.calls.map((call) => String(call[0]));
    const deleteAt = sql.findIndex((q) =>
      q.includes('DELETE FROM exercise_entry_laps')
    );
    expect(deleteAt).toBeGreaterThan(0);
    expect(sql[deleteAt - 1]).toContain(
      'SELECT 1 FROM exercise_entry_gps_points'
    );
  });

  it('refuses an entry that has a GPS track and writes nothing', async () => {
    client.query.mockImplementation(async (sql: string) =>
      String(sql).includes('exercise_entry_gps_points')
        ? { rows: [{ '?column?': 1 }] }
        : { rows: [] }
    );
    await expect(
      attachLapsToExerciseEntry(userId, 'actor-1', entryId, {
        laps: [
          {
            lap_index: 1,
            start_time: '2026-10-06T10:00:00.000Z',
            end_time: '2026-10-06T10:05:00.000Z',
          },
        ],
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(
      workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient
    ).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('rolls back and releases the connection when the write fails', async () => {
    vi.mocked(
      workoutTelemetryRepo._bulkInsertExerciseEntryLapsWithClient
    ).mockRejectedValue(new Error('boom'));
    await expect(
      attachLapsToExerciseEntry(userId, 'actor-1', entryId, {
        laps: [
          {
            lap_index: 1,
            start_time: '2026-10-06T10:00:00.000Z',
            end_time: '2026-10-06T10:05:00.000Z',
          },
        ],
      })
    ).rejects.toThrow('boom');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalled();
  });

  it('refuses an entry that belongs to someone else', async () => {
    vi.mocked(
      exerciseEntryRepository.getExerciseEntryOwnerId
    ).mockResolvedValue('other-user');
    await expect(
      attachLapsToExerciseEntry(userId, 'actor-1', entryId, {
        laps: [
          {
            lap_index: 1,
            start_time: '2026-10-06T10:00:00.000Z',
            end_time: '2026-10-06T10:05:00.000Z',
          },
        ],
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(getClient).not.toHaveBeenCalled();
  });
});
