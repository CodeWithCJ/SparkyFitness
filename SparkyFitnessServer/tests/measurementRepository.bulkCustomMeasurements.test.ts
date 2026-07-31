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

describe('measurementRepository.updateCustomMeasurement', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

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

  it('updates value/notes/source by id and user, stamped by the acting user', async () => {
    const updatedRow = { id: 'cm-existing', value: '125', source: 'manual' };
    mockClient.query.mockResolvedValue({ rows: [updatedRow] });

    const result = await measurementRepository.updateCustomMeasurement(
      'cm-existing',
      'user-1',
      'acting-1',
      { value: 125, notes: undefined, source: 'manual' }
    );

    expect(getClient).toHaveBeenCalledWith('acting-1');
    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('UPDATE custom_measurements');
    expect(text).toContain('WHERE id = $5 AND user_id = $6');
    expect(values).toEqual([125, null, 'manual', 'acting-1', 'cm-existing', 'user-1']);
    expect(result).toEqual(updatedRow);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('keeps the current value via COALESCE when value is omitted', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-existing', value: '42' }] });

    await measurementRepository.updateCustomMeasurement(
      'cm-existing',
      'user-1',
      'acting-1',
      { notes: 'edited' }
    );

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('value = COALESCE($1, value)');
    expect(values![0]).toBeNull();
    expect(values![2]).toBeNull();
  });

  it('preserves the current source via COALESCE when source is omitted (value-only PUT)', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-existing', value: '130' }] });

    await measurementRepository.updateCustomMeasurement(
      'cm-existing',
      'user-1',
      'acting-1',
      { value: 130 }
    );

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('source = COALESCE($3, source)');
    expect(values![2]).toBeNull();
    expect(getClient).toHaveBeenCalledWith('acting-1');
  });

  it('updates the source explicitly when one is provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-existing', source: 'apple_health' }] });

    await measurementRepository.updateCustomMeasurement(
      'cm-existing',
      'user-1',
      'acting-1',
      { source: 'apple_health' }
    );

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('source = COALESCE($3, source)');
    expect(values![2]).toBe('apple_health');
  });

  it('stamps updated_by_user_id with the acting user and runs RLS as the actor', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-existing', value: '125' }] });

    await measurementRepository.updateCustomMeasurement(
      'cm-existing',
      'user-1',
      'acting-1',
      { value: 125 }
    );

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('updated_by_user_id = $4');
    expect(text).toContain('WHERE id = $5 AND user_id = $6');
    expect(values![3]).toBe('acting-1');
    expect(values![4]).toBe('cm-existing');
    expect(values![5]).toBe('user-1');
    expect(getClient).toHaveBeenCalledWith('acting-1');
  });

  it('returns an empty row set when the entry does not belong to the user', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await measurementRepository.updateCustomMeasurement(
      'cm-other',
      'user-1',
      'acting-1',
      { value: 125 }
    );

    expect(result).toBeUndefined();
  });
});
