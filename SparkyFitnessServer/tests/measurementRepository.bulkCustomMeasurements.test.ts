import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

const baseRow = {
  categoryId: 'cat-1',
  value: 42,
  entryDate: '2025-06-01',
  entryHour: 10,
  entryTimestamp: '2025-06-01T10:00:00.000Z',
  notes: undefined,
  frequency: 'Daily',
  source: 'apple_health',
};

describe('measurementRepository.bulkUpsertCustomMeasurements', () => {
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

  it('normalizes Daily rows (hour 0, midnight timestamp) and stamps audit columns on insert', async () => {
    const insertedRow = { id: 'cm-new', value: '42' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO custom_measurements')) {
        return { rows: [insertedRow] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCustomMeasurements(
      'user-1',
      'acting-1',
      [baseRow]
    );

    // RLS context comes from the acting user, like upsertCustomMeasurement.
    expect(getClient).toHaveBeenCalledWith('acting-1');
    expect(findCall('BEGIN')).toBeDefined();
    expect(findCall('COMMIT')).toBeDefined();
    const insert = findCall('INSERT INTO custom_measurements');
    expect(insert).toBeDefined();
    // Daily normalization: entry_hour 0 and the timestamp collapsed to the
    // start of the entry date, target user + acting user audit columns.
    expect(insert!.text).toContain(
      "('user-1', 'cat-1', '42', '2025-06-01', '0', '2025-06-01T00:00:00.000Z', NULL, 'acting-1', 'acting-1'"
    );
    expect(result).toEqual([insertedRow]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('dedupes same-key Daily rows with last-in-payload-wins', async () => {
    const insertedRow = { id: 'cm-new', value: '20' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO custom_measurements')) {
        return { rows: [insertedRow] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCustomMeasurements(
      'user-1',
      'acting-1',
      [
        { ...baseRow, value: 10 },
        { ...baseRow, value: 20 },
      ]
    );

    const insert = findCall('INSERT INTO custom_measurements');
    // Only the later row is written…
    expect(insert!.text).toContain("'20'");
    expect(insert!.text).not.toContain("'10'");
    expect((insert!.text.match(/\('user-1'/g) ?? []).length).toBe(1);
    // …and both input rows share its written result.
    expect(result).toEqual([insertedRow, insertedRow]);
  });

  it('always inserts Unlimited rows without an existence lookup', async () => {
    const insertedRows = [
      { id: 'cm-1', value: '10' },
      { id: 'cm-2', value: '20' },
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO custom_measurements')) {
        return { rows: insertedRows };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCustomMeasurements(
      'user-1',
      'acting-1',
      [
        { ...baseRow, frequency: 'Unlimited', value: 10 },
        { ...baseRow, frequency: 'Unlimited', value: 20 },
      ]
    );

    // No SELECT: Unlimited/All frequencies never check for existing rows.
    expect(findCall('SELECT id, category_id')).toBeUndefined();
    const insert = findCall('INSERT INTO custom_measurements');
    expect((insert!.text.match(/\('user-1'/g) ?? []).length).toBe(2);
    expect(result).toEqual(insertedRows);
  });

  it('updates the matching existing row and stamps updated_by_user_id', async () => {
    const existingRow = {
      id: 'cm-existing',
      category_id: 'cat-1',
      entry_date: '2025-06-01',
      source: 'apple_health',
      entry_hour: 0,
    };
    const updatedRow = { id: 'cm-existing', value: '42' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('SELECT id, category_id')) {
        return { rows: [existingRow] };
      }
      if (text.includes('UPDATE custom_measurements')) {
        return { rows: [updatedRow] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCustomMeasurements(
      'user-1',
      'acting-1',
      [baseRow]
    );

    const update = findCall('UPDATE custom_measurements');
    expect(update).toBeDefined();
    // [actingUserId, ids, values, timestamps, notes, sources]
    expect(update!.values![0]).toBe('acting-1');
    expect(update!.values![1]).toEqual(['cm-existing']);
    expect(update!.values![2]).toEqual([42]);
    expect(update!.values![3]).toEqual(['2025-06-01T00:00:00.000Z']);
    expect(update!.values![5]).toEqual(['apple_health']);
    expect(findCall('INSERT INTO custom_measurements')).toBeUndefined();
    expect(result).toEqual([updatedRow]);
  });

  it('rolls back the transaction and rethrows when a write fails', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO custom_measurements')) {
        throw new Error('insert failed');
      }
      return { rows: [] };
    });

    await expect(
      measurementRepository.bulkUpsertCustomMeasurements('user-1', 'acting-1', [
        baseRow,
      ])
    ).rejects.toThrow('insert failed');

    expect(findCall('ROLLBACK')).toBeDefined();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
