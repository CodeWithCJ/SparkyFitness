import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createFitnessTest,
  deleteFitnessTest,
  getLatestFitnessTest,
  InvalidFitnessTestError,
  listFitnessTests,
  UnknownExerciseEntryError,
} from '../models/fitnessTestRepository.js';
import { getClient } from '../db/poolManager.js';
import { evaluateFitnessTest } from '@workspace/shared';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const entryId = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';

const body = {
  test_type: '5k' as const,
  test_date: '2026-10-18',
  distance_meters: 5000,
  duration_seconds: 1500,
};
const paces = evaluateFitnessTest({
  type: '5k',
  distanceMeters: 5000,
  durationSeconds: 1500,
})!.paces;
const row = {
  id: entryId,
  test_type: '5k',
  test_day: '2026-10-18',
  distance_meters: '5000.0',
  duration_seconds: 1500,
  split_distance_meters: null,
  result_value: '1500.0',
  exercise_entry_id: null,
  paces,
  created_at: '2026-10-18T10:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('fitness test repository', () => {
  it('works the result and paces out on the server and saves them', async () => {
    query.mockResolvedValue({ rows: [row] });
    const saved = await createFitnessTest('u1', body, 'u1');
    expect(saved.result_value).toBe(1500);
    expect(saved.test_date).toBe('2026-10-18');
    const [sql, values] = query.mock.calls[0];
    expect(String(sql)).toContain('INSERT INTO fitness_tests');
    expect(String(sql)).not.toContain('ON CONFLICT');
    expect(values[7]).toBe(1500);
    expect(values[8]).toBe(paces.thresholdSecondsPerKm);
    expect(JSON.parse(values[10])).toEqual(JSON.parse(JSON.stringify(paces)));
    expect(getClient).toHaveBeenCalledWith('u1', 'u1');
    expect(release).toHaveBeenCalled();
  });

  it('refuses measurements that make no believable test, writing nothing', async () => {
    await expect(
      createFitnessTest('u1', { ...body, duration_seconds: 60 })
    ).rejects.toBeInstanceOf(InvalidFitnessTestError);
    expect(query).not.toHaveBeenCalled();
  });

  it('replaces the test of an activity that already has one', async () => {
    query.mockImplementation(async (sql: string) =>
      String(sql).startsWith('SELECT 1')
        ? { rows: [{ '?column?': 1 }], rowCount: 1 }
        : { rows: [{ ...row, exercise_entry_id: entryId }] }
    );
    const saved = await createFitnessTest('u1', {
      ...body,
      exercise_entry_id: entryId,
    });
    expect(saved.exercise_entry_id).toBe(entryId);
    expect(String(query.mock.calls[1][0])).toContain(
      'ON CONFLICT (exercise_entry_id)'
    );
  });

  it("refuses an activity that is not the person's", async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    await expect(
      createFitnessTest('u1', { ...body, exercise_entry_id: entryId })
    ).rejects.toBeInstanceOf(UnknownExerciseEntryError);
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalled();
  });

  it('lists newest first, capped, and skips rows it cannot read', async () => {
    query.mockResolvedValue({ rows: [row, { ...row, paces: { bad: true } }] });
    const tests = await listFitnessTests('u1', 'u1', 500);
    expect(tests).toHaveLength(1);
    expect(String(query.mock.calls[0][0])).toContain(
      'ORDER BY test_date DESC, created_at DESC'
    );
    expect(query.mock.calls[0][1]).toEqual(['u1', 50, 0]);
  });

  it('reads the latest, or null', async () => {
    query.mockResolvedValueOnce({ rows: [row] });
    expect((await getLatestFitnessTest('u1', 'u1'))?.id).toBe(entryId);
    query.mockResolvedValueOnce({ rows: [] });
    expect(await getLatestFitnessTest('u1', 'u1')).toBeNull();
  });

  it('reads an older valid test when the newest one is unreadable', async () => {
    const older = { ...row, id: 'older-id' };
    query.mockResolvedValue({
      rows: [{ ...row, id: 'bad-id', paces: { bad: true } }, older],
    });
    expect((await getLatestFitnessTest('u1', 'u1'))?.id).toBe('older-id');
    expect(await listFitnessTests('u1', 'u1', 1)).toHaveLength(1);
  });

  it('reads further pages when the newest 50 rows are all unreadable', async () => {
    const bad = (i: number) => ({
      ...row,
      id: `bad-${i}`,
      paces: { bad: true },
    });
    query
      .mockResolvedValueOnce({
        rows: Array.from({ length: 50 }, (_, i) => bad(i)),
      })
      .mockResolvedValueOnce({ rows: [{ ...row, id: 'valid-id' }] });
    expect((await getLatestFitnessTest('u1', 'u1'))?.id).toBe('valid-id');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1]).toEqual(['u1', 50, 50]);
  });

  it('deletes only the persons own test', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteFitnessTest('u1', entryId)).toBe(true);
    expect(query.mock.calls[0][1]).toEqual([entryId, 'u1']);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteFitnessTest('u1', entryId)).toBe(false);
  });

  describe('on a treadmill', () => {
    const treadmill = {
      test_type: 'cooper' as const,
      test_date: '2026-10-18',
      distance_meters: 3000,
      duration_seconds: 720,
      surface: 'indoor' as const,
      incline_percent: 3,
    };
    const insertValues = () => query.mock.calls[0][1];

    it('saves the surface and incline and corrects the result for it', async () => {
      query.mockResolvedValue({
        rows: [
          {
            ...row,
            test_type: 'cooper',
            surface: 'indoor',
            incline_percent: '3.0',
            incline_adjusted: true,
          },
        ],
      });
      const saved = await createFitnessTest('u1', treadmill, 'u1');
      expect(saved).toMatchObject({
        surface: 'indoor',
        incline_percent: 3,
        incline_adjusted: true,
      });
      const values = insertValues();
      // The raw distance is kept; the result is the corrected one.
      expect(values[4]).toBe(3000);
      expect(values[7]).toBe(Math.round((3000 * 0.227) / 0.209));
      expect(values.slice(11)).toEqual(['indoor', 3, true]);
    });

    it('keeps the numbers as measured when the correction is off', async () => {
      query.mockResolvedValue({ rows: [{ ...row, surface: 'indoor' }] });
      await createFitnessTest('u1', { ...treadmill, incline_adjusted: false });
      expect(insertValues()[7]).toBe(3000);
      expect(insertValues().slice(11)).toEqual(['indoor', 3, false]);
    });

    it('records no correction when no incline was entered', async () => {
      query.mockResolvedValue({ rows: [{ ...row, surface: 'indoor' }] });
      await createFitnessTest('u1', { ...treadmill, incline_percent: null });
      expect(insertValues()[7]).toBe(3000);
      expect(insertValues().slice(11)).toEqual(['indoor', null, false]);
    });

    it('ignores an incline sent with an outdoor test', async () => {
      query.mockResolvedValue({ rows: [row] });
      await createFitnessTest('u1', { ...body, incline_percent: 6 });
      expect(insertValues().slice(11)).toEqual(['outdoor', null, false]);
    });

    it('refuses an incline outside 0 to 15 percent, writing nothing', async () => {
      await expect(
        createFitnessTest('u1', { ...treadmill, incline_percent: 20 })
      ).rejects.toBeInstanceOf(InvalidFitnessTestError);
      expect(query).not.toHaveBeenCalled();
    });

    it('reads a test saved before surfaces existed as outdoor', async () => {
      query.mockResolvedValue({ rows: [row] });
      const [only] = await listFitnessTests('u1', 'u1');
      expect(only).toMatchObject({
        surface: 'outdoor',
        incline_percent: null,
        incline_adjusted: false,
      });
    });
  });
});
