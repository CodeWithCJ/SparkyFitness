import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { todayInZone } from '@workspace/shared';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

type QueryTuple = [string, unknown[] | undefined];

describe('measurementRepository custom metric entry_timestamp defaulting', () => {
  let mockClient: MockDbClient;

  beforeEach(() => {
    mockClient = createMockDbClient([]);
    vi.mocked(getClient).mockResolvedValue(
      mockClient as unknown as Awaited<ReturnType<typeof getClient>>
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('defaults entry_timestamp for Unlimited frequency when omitted (logging for today in UTC)', async () => {
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

    const todayStr = todayInZone('UTC');

    await measurementRepository.upsertCustomMeasurement(
      'user-1',
      'user-1',
      'cat-unlimited',
      '120',
      todayStr,
      null,
      undefined, // entryTimestamp omitted!
      'blood pressure systolic',
      'Unlimited',
      'manual',
      'UTC'
    );

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const calls = mockClient.query.mock.calls as unknown as QueryTuple[];
    const [query, values] = calls[0]!;
    expect(query).toContain('INSERT INTO custom_measurements');
    expect(values).toBeDefined();

    const entryTimestampVal = values![5] as string;
    expect(entryTimestampVal).toBeDefined();
    expect(typeof entryTimestampVal).toBe('string');
    expect(new Date(entryTimestampVal).toString()).not.toBe('Invalid Date');
  });

  it('handles positive timezone offsets (e.g. Asia/Tokyo) around UTC midnight deterministically', async () => {
    vi.useFakeTimers();
    // At 23:30 UTC on 2026-08-08, local date in Tokyo (UTC+9) is 2026-08-09
    const frozenUtc = new Date('2026-08-08T23:30:00.000Z');
    vi.setSystemTime(frozenUtc);

    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-tokyo' }] });
    const tokyoToday = '2026-08-09'; // Matches todayInZone('Asia/Tokyo') at 23:30 UTC

    await measurementRepository.upsertCustomMeasurement(
      'user-1',
      'user-1',
      'cat-unlimited',
      '125',
      tokyoToday,
      null,
      undefined,
      'notes',
      'Unlimited',
      'manual',
      'Asia/Tokyo'
    );

    const calls = mockClient.query.mock.calls as unknown as QueryTuple[];
    const insertCall = calls.find((c) =>
      c[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    const timestampVal = insertCall![1]![5] as string;
    expect(timestampVal).toBe(frozenUtc.toISOString());
  });

  it('handles negative timezone offsets (e.g. America/Los_Angeles) around UTC midnight deterministically', async () => {
    vi.useFakeTimers();
    // At 00:30 UTC on 2026-08-08, local date in LA (UTC-7) is 2026-08-07
    const frozenUtc = new Date('2026-08-08T00:30:00.000Z');
    vi.setSystemTime(frozenUtc);

    mockClient.query.mockResolvedValue({ rows: [{ id: 'cm-la' }] });
    const laToday = '2026-08-07'; // Matches todayInZone('America/Los_Angeles') at 00:30 UTC

    await measurementRepository.upsertCustomMeasurement(
      'user-1',
      'user-1',
      'cat-unlimited',
      '115',
      laToday,
      null,
      undefined,
      'notes',
      'Unlimited',
      'manual',
      'America/Los_Angeles'
    );

    const calls = mockClient.query.mock.calls as unknown as QueryTuple[];
    const insertCall = calls.find((c) =>
      c[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    const timestampVal = insertCall![1]![5] as string;
    expect(timestampVal).toBe(frozenUtc.toISOString());
  });

  it('defaults entry_timestamp for Hourly frequency when entry_hour is provided', async () => {
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
      'Hourly',
      'manual',
      'UTC'
    );

    const calls = mockClient.query.mock.calls as unknown as QueryTuple[];
    const insertCall = calls.find((c) =>
      c[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    const entryTimestampVal = insertCall![1]![5] as string;
    expect(entryTimestampVal).toBe('2026-08-05T14:00:00.000Z');
  });

  it('defaults entry_timestamp in bulkUpsertCustomMeasurements for non-Daily entries with userTimezone', async () => {
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
          entryTimestamp: undefined,
          notes: 'bp high',
          frequency: 'All',
          userTimezone: 'Asia/Tokyo',
        },
      ],
      'Asia/Tokyo'
    );

    expect(result).toHaveLength(1);
    const calls = mockClient.query.mock.calls as unknown as QueryTuple[];
    const insertCall = calls.find((c) =>
      c[0].includes('INSERT INTO custom_measurements')
    );
    expect(insertCall).toBeDefined();
    const insertSql = insertCall![0];
    expect(insertSql).toContain("'2026-08-01T00:00:00.000Z'");
  });
});
