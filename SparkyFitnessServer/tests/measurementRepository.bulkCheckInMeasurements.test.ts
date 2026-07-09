import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('measurementRepository.bulkUpsertCheckInMeasurements', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const queryCalls = (): Array<{ text: string; values?: any[] }> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mock.calls.map((call: any[]) => ({
      text: call[0],
      values: call[1],
    }));

  const findCall = (fragment: string) =>
    queryCalls().find((call) => call.text.includes(fragment));

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('merges same-date measurements into one insert and stamps audit columns', async () => {
    const insertedRow = {
      id: 'ci-1',
      entry_date: '2025-02-01',
      steps: 5000,
      weight: 70.5,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO check_in_measurements')) {
        return { rows: [insertedRow] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCheckInMeasurements(
      'user-1',
      'acting-1',
      [
        { entryDate: '2025-02-01', measurements: { steps: 5000 } },
        { entryDate: '2025-02-01', measurements: { weight: 70.5 } },
      ]
    );

    // RLS context comes from the acting user, like upsertCheckInMeasurements.
    expect(getClient).toHaveBeenCalledWith('acting-1');
    expect(findCall('BEGIN')).toBeDefined();
    expect(findCall('COMMIT')).toBeDefined();
    const insert = findCall('INSERT INTO check_in_measurements');
    expect(insert).toBeDefined();
    // Both records collapse into one row with both columns and the acting
    // user in created_by/updated_by.
    expect(insert!.text).toContain('steps, weight');
    expect(insert!.text).toContain("('user-1', '2025-02-01', '5000', '70.5'");
    expect(insert!.text).toContain("'acting-1', 'acting-1'");
    expect((insert!.text.match(/\('user-1'/g) ?? []).length).toBe(1);
    // Both input entries share the merged written row.
    expect(result).toEqual([insertedRow, insertedRow]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('later record wins per column when the same date repeats a column', async () => {
    const insertedRow = { id: 'ci-1', entry_date: '2025-02-01', weight: 71 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO check_in_measurements')) {
        return { rows: [insertedRow] };
      }
      return { rows: [] };
    });

    await measurementRepository.bulkUpsertCheckInMeasurements(
      'user-1',
      'acting-1',
      [
        { entryDate: '2025-02-01', measurements: { weight: 70.5 } },
        { entryDate: '2025-02-01', measurements: { weight: 71 } },
      ]
    );

    const insert = findCall('INSERT INTO check_in_measurements');
    expect(insert!.text).toContain("'71'");
    expect(insert!.text).not.toContain("'70.5'");
  });

  it('updates existing dates and inserts new ones in one transaction', async () => {
    const existingRow = { id: 'ci-existing', entry_date: '2025-02-01' };
    const updatedRow = {
      id: 'ci-existing',
      entry_date: '2025-02-01',
      weight: 70.5,
    };
    const insertedRow = { id: 'ci-new', entry_date: '2025-02-02', steps: 900 };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT * FROM check_in_measurements')) {
        return { rows: [existingRow] };
      }
      if (text.includes('UPDATE check_in_measurements')) {
        return { rows: [updatedRow] };
      }
      if (text.includes('INSERT INTO check_in_measurements')) {
        return { rows: [insertedRow] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCheckInMeasurements(
      'user-1',
      'acting-1',
      [
        { entryDate: '2025-02-01', measurements: { weight: 70.5 } },
        { entryDate: '2025-02-02', measurements: { steps: 900 } },
      ]
    );

    const update = findCall('UPDATE check_in_measurements');
    expect(update).toBeDefined();
    // [actingUserId, ids, ...one array per batch column]
    expect(update!.values![0]).toBe('acting-1');
    expect(update!.values![1]).toEqual(['ci-existing']);
    expect(update!.text).toContain('updated_by_user_id = $1');
    const insert = findCall('INSERT INTO check_in_measurements');
    expect(insert!.text).toContain("'2025-02-02'");
    expect(result).toEqual([updatedRow, insertedRow]);
  });

  // Regression: the mobile /api/health-data sync path (bulkUpsert) must not let
  // a smaller step read clobber a complete day's total. steps is max-wins while
  // other columns stay COALESCE.
  it('uses a max-wins GREATEST for steps but COALESCE for other columns on update', async () => {
    const existingRow = {
      id: 'ci-existing',
      entry_date: '2026-07-07',
      steps: 13441,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT * FROM check_in_measurements')) {
        return { rows: [existingRow] };
      }
      if (text.includes('UPDATE check_in_measurements')) {
        return { rows: [{ ...existingRow, steps: 13441, weight: 70.5 }] };
      }
      return { rows: [] };
    });

    await measurementRepository.bulkUpsertCheckInMeasurements(
      'user-1',
      'acting-1',
      [{ entryDate: '2026-07-07', measurements: { steps: 4252, weight: 70.5 } }]
    );

    const update = findCall('UPDATE check_in_measurements');
    expect(update).toBeDefined();
    expect(update!.text).toContain('steps = GREATEST(u.steps, cm.steps)');
    expect(update!.text).toContain('weight = COALESCE(u.weight, cm.weight)');
    expect(update!.text).not.toContain('steps = COALESCE');
  });

  it('filters unauthorized measurement keys and skips entries left empty', async () => {
    const result = await measurementRepository.bulkUpsertCheckInMeasurements(
      'user-1',
      'acting-1',
      [{ entryDate: '2025-02-01', measurements: { malicious_column: 1 } }]
    );

    // Nothing writable → no SELECT/UPDATE/INSERT, and the entry maps to null
    // (matching upsertCheckInMeasurements' no-op return).
    expect(findCall('SELECT * FROM check_in_measurements')).toBeUndefined();
    expect(findCall('INSERT INTO check_in_measurements')).toBeUndefined();
    expect(result).toEqual([null]);
  });

  it('rolls back the transaction and rethrows when a write fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO check_in_measurements')) {
        throw new Error('insert failed');
      }
      return { rows: [] };
    });

    await expect(
      measurementRepository.bulkUpsertCheckInMeasurements(
        'user-1',
        'acting-1',
        [{ entryDate: '2025-02-01', measurements: { weight: 70.5 } }]
      )
    ).rejects.toThrow('insert failed');

    expect(findCall('ROLLBACK')).toBeDefined();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
