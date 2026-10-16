import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCustomRunProgram,
  CustomRunProgramLimitError,
  deleteCustomRunProgram,
  updateCustomRunProgram,
} from '../models/runProgramRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();
const id = '0b6f1c1e-6a52-4a8e-9a3b-2f1d4f5a9c10';
const input = {
  name: 'My plan',
  activity: 'run' as const,
  workouts: Array.from({ length: 9 }, (_, i) => ({
    title: i === 0 ? 'First' : undefined,
    plan: {
      style: 'runWalk' as const,
      steps: [{ kind: 'work' as const, seconds: 600 }],
    },
  })),
};
const row = {
  id,
  name: 'My plan',
  activity: 'run',
  workouts: [],
  created_at: '2026-10-13T00:00:00.000Z',
  updated_at: '2026-10-13T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('custom run programs', () => {
  it('numbers workouts into weeks of seven and saves them', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ n: 0 }] };
      if (sql.includes('INSERT INTO custom_run_programs')) {
        return { rows: [row] };
      }
      return { rows: [] };
    });
    const created = await createCustomRunProgram('u1', input);
    expect(created.id).toBe(id);
    // One person's creates are serialized, and the insert commits.
    expect(query.mock.calls.map(([sql]) => String(sql))).toEqual([
      'BEGIN',
      expect.stringContaining('pg_advisory_xact_lock'),
      expect.stringContaining('COUNT(*)'),
      expect.stringContaining('INSERT INTO custom_run_programs'),
      'COMMIT',
    ]);
    const saved = JSON.parse(query.mock.calls[3][1][3]);
    expect(saved).toHaveLength(9);
    expect(saved[0]).toMatchObject({ week: 0, day: 0, title: 'First' });
    expect(saved[7]).toMatchObject({ week: 1, day: 0 });
    expect(release).toHaveBeenCalled();
  });

  it('refuses a thirty-first program', async () => {
    query.mockImplementation(async (sql: string) =>
      sql.includes('COUNT(*)') ? { rows: [{ n: 30 }] } : { rows: [] }
    );
    await expect(createCustomRunProgram('u1', input)).rejects.toBeInstanceOf(
      CustomRunProgramLimitError
    );
    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });

  it('updates the copy being run and keeps the place', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.startsWith('UPDATE custom_run_programs')) return { rows: [row] };
      return { rows: [] };
    });
    const updated = await updateCustomRunProgram('u1', id, input);
    expect(updated?.id).toBe(id);
    const runUpdate = query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE run_programs')
    );
    expect(runUpdate?.[0]).toContain('LEAST(next_index');
    expect(runUpdate?.[1][1]).toBe(`custom:${id}`);
    expect(query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('returns null and rolls back when the program is not there', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await updateCustomRunProgram('u1', id, input)).toBeNull();
    expect(query).toHaveBeenLastCalledWith('ROLLBACK');
  });

  it('says whether a delete removed anything', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 });
    expect(await deleteCustomRunProgram('u1', id)).toBe(true);
    query.mockResolvedValueOnce({ rowCount: 0 });
    expect(await deleteCustomRunProgram('u1', id)).toBe(false);
  });
});
