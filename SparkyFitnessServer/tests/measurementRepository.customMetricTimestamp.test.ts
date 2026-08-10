import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('measurementRepository custom metric entry_timestamp defaulting', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults entry_timestamp for Unlimited frequency when omitted (logging for today)', async () => {
    mockClient.query.mockResolvedValue({
      rows: [
        {
          id: 'cm-1',
          user_id: 'user-1',
          category_id: 'cat-unlimited',
          value: '120',
          entry_date: '2026-08-10',
          entry_hour: null,
          entry_timestamp: '2026-08-10T18:00:00.000Z',
        },
      ],
    });

    const todayStr = new Date().toISOString().split('T')[0];

    await measurementRepository.upsertCustomMeasurement(
      'user-1',
      'user-1',
      'cat-unlimited',
      '120',
      todayStr,
      null,
      undefined, // entryTimestamp omitted!
      'blood pressure systolic',
      'Unlimited'
    );

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [query, values] = mockClient.query.mock.calls[0];
    expect(query).toContain('INSERT INTO custom_measurements');
    // Parameter $6 is entry_timestamp
    const entryTimestampVal = values[5];
    expect(entryTimestampVal).toBeDefined();
    expect(typeof entryTimestampVal).toBe('string');
    expect(new Date(entryTimestampVal).toString()).not.toBe('Invalid Date');
  });

  it('defaults entry_timestamp for Hourly frequency when entry_hour is provided', async () => {
    // Secondary call for insert/update will carry the normalized timestamp
    // If SELECT returns empty, INSERT query runs
    mockClient.query.mockResolvedValueOnce({ rows: [] });
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: 'cm-2' }] });

    await measurementRepository.upsertCustomMeasurement(
      'user-1',
      'user-1',
      'cat-hourly',
      '72',
      '2026-08-05',
      14,
      undefined,
      'heart rate',
      'Hourly'
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
      call[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    const entryTimestampVal = insertCall[1][5];
    expect(entryTimestampVal).toBe('2026-08-05T14:00:00.000Z');
  });

  it('defaults entry_timestamp in bulkUpsertCustomMeasurements for non-Daily entries', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text === 'BEGIN' || text === 'COMMIT') return { rows: [] };
      if (text.includes('SELECT id, category_id')) return { rows: [] };
      if (text.includes('INSERT INTO custom_measurements')) {
        return { rows: [{ id: 'cm-bulk-1' }] };
      }
      return { rows: [] };
    });

    const result = await measurementRepository.bulkUpsertCustomMeasurements(
      'user-1',
      'user-1',
      [
        {
          categoryId: 'cat-all',
          value: '130',
          entryDate: '2026-08-01',
          entryHour: null,
          entryTimestamp: undefined, // missing timestamp
          notes: 'bp high',
          frequency: 'All',
        },
      ]
    );

    expect(result).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
      call[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    // In bulk insert query, pg-format formats values into the SQL text
    const insertSql = insertCall[0];
    expect(insertSql).toContain("'2026-08-01T00:00:00.000Z'");
  });
});
