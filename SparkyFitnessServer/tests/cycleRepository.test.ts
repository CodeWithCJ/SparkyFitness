import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import cycleRepository from '../models/cycleRepository.js';
import { DAILY_MOOD_VALUE_SQL } from '../models/moodRepository.js';
import { MAIN_SLEEP_ORDER_SQL } from '../models/sleepRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

interface MockDbClient {
  query: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
}

describe('cycleRepository.upsertLog', () => {
  let mockClient: MockDbClient;
  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'log-1' }] }),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const sqlOf = () => mockClient.query.mock.calls[0][0] as string;
  const paramsOf = () => mockClient.query.mock.calls[0][1] as unknown[];

  it('clears a field when the caller sends an explicit null', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      cervical_mucus: null,
      cervical_position: null,
    });

    expect(sqlOf()).toContain('cervical_mucus = $3');
    expect(sqlOf()).toContain('cervical_position = $4');
    expect(sqlOf()).not.toContain('COALESCE');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01', null, null]);
  });

  it('leaves omitted fields untouched', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      flow_level: 'medium',
    });

    expect(sqlOf()).toContain('flow_level = $3');
    expect(sqlOf()).not.toContain('cervical_mucus =');
    expect(sqlOf()).not.toContain('notes =');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01', 'medium']);
  });

  it('serializes jsonb payloads and passes arrays through', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      product_usage: { pad: 2 },
      unusual_discharge: ['gray'],
      custom_fields: { opk: 'peak' },
    });

    expect(paramsOf()).toEqual([
      'user-1',
      '2026-08-01',
      JSON.stringify({ pad: 2 }),
      ['gray'],
      JSON.stringify({ opk: 'peak' }),
    ]);
  });

  it('still touches the row when the body has no writable fields', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {});

    expect(sqlOf()).toContain('DO UPDATE SET');
    expect(sqlOf()).toContain('updated_at = NOW()');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01']);
  });
});

describe('cycleRepository.getCorrelationSources mood', () => {
  it('reads one non-null mood value per day, never a raw row', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);
    await cycleRepository.getCorrelationSources('user-1');
    const moodSql = client.query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((q: string) => q.includes('FROM mood_entries'));
    expect(moodSql).toContain(DAILY_MOOD_VALUE_SQL);
    expect(moodSql).toContain('GROUP BY entry_date');
    expect(moodSql).toContain('IS NOT NULL');
  });
});

describe('cycleRepository.getCorrelationSources sleep', () => {
  it('reads one sleep per day, its main sleep, so two sources never count twice', async () => {
    const client = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client as never);
    await cycleRepository.getCorrelationSources('user-1');
    const sleepSql = client.query.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .find((q: string) => q.includes('FROM sleep_entries'));
    expect(sleepSql).toContain('DISTINCT ON (entry_date)');
    expect(sleepSql).toContain(MAIN_SLEEP_ORDER_SQL);
  });
});

describe('cycleRepository.deleteCycle', () => {
  let mockClient: MockDbClient;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('safely bounds flow clearing to bleed span and caps before next cycle', async () => {
    // 1. BEGIN
    // 2. Look up cycle (2026-08-01, period_length: 5)
    // 3. Look up next cycle (found 2026-08-04)
    // 4. Update daily entries [2026-08-01, 2026-08-03]
    // 5. Look up prev cycle
    // 6. Delete cycle
    // 7. COMMIT
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            start_date: '2026-08-01',
            end_date: null,
            period_length: 5,
            source: 'manual',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_date: '2026-08-04' }],
      })
      .mockResolvedValueOnce({ rowCount: 3 }) // UPDATE cycle_daily_entries
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // prevRes
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cycle-1' }] }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-1');
    expect(ok).toBe(true);

    const updateCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycle_daily_entries')
    );
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0]).toContain('entry_date BETWEEN $2 AND $3');
    expect(updateCalls[0][0]).not.toContain('entry_date >= $2');
    // Capped at 2026-08-03 because next cycle starts on 2026-08-04
    expect(updateCalls[0][1]).toEqual(['user-1', '2026-08-01', '2026-08-03']);
  });

  it('clears up to bleedEnd when no next cycle exists', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            start_date: '2026-09-01',
            end_date: null,
            period_length: 5,
            source: 'manual',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // nextRes: none
      .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE cycle_daily_entries
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // prevRes
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cycle-2' }] }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-2');
    expect(ok).toBe(true);

    const updateCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycle_daily_entries')
    );
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0]).toContain('entry_date BETWEEN $2 AND $3');
    // Bleed span: 2026-09-01 + (5 - 1) = 2026-09-05
    expect(updateCalls[0][1]).toEqual(['user-1', '2026-09-01', '2026-09-05']);
  });

  it('returns false and rolls back if cycle not found', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // not found
      .mockResolvedValueOnce({}); // ROLLBACK

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-missing');
    expect(ok).toBe(false);

    const rollbackCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('ROLLBACK')
    );
    expect(rollbackCalls.length).toBe(1);
  });

  it('updates preceding cycle boundary to next cycle when deleting an intermediate cycle', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            start_date: '2026-08-31',
            end_date: '2026-09-27',
            period_length: 5,
            source: 'manual',
          },
        ],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_date: '2026-09-28' }],
      }) // nextRes
      .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE cycle_daily_entries
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'cycle-prev',
            start_date: '2026-08-03',
            end_date: '2026-08-30',
          },
        ],
      }) // prevRes (contiguous abutting cycle)
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cycles (prev)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cycle-mid' }] }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-mid');
    expect(ok).toBe(true);

    const prevUpdateCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycles')
    );
    expect(prevUpdateCalls.length).toBe(1);
    // Prev cycle 2026-08-03 should extend to day before 2026-09-28 -> end_date: 2026-09-27, length: 56
    expect(prevUpdateCalls[0][1]).toEqual([
      '2026-09-27',
      56,
      'cycle-prev',
      'user-1',
    ]);
  });

  it('sets preceding cycle end_date and cycle_length to null when deleting the last cycle', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            start_date: '2026-09-28',
            end_date: null,
            period_length: 5,
            source: 'manual',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // nextRes: none
      .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE cycle_daily_entries
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'cycle-prev',
            start_date: '2026-08-31',
            end_date: '2026-09-27',
          },
        ],
      }) // prevRes
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cycles (prev)
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cycle-last' }] }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-last');
    expect(ok).toBe(true);

    const prevUpdateCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycles')
    );
    expect(prevUpdateCalls.length).toBe(1);
    expect(prevUpdateCalls[0][0]).toContain('end_date = NULL');
    expect(prevUpdateCalls[0][1]).toEqual(['cycle-prev', 'user-1']);
  });

  it('does not alter preceding cycle when it has an explicit earlier gap', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            start_date: '2026-08-31',
            end_date: null,
            period_length: 5,
            source: 'manual',
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // nextRes: none
      .mockResolvedValueOnce({ rowCount: 5 }) // UPDATE cycle_daily_entries
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'cycle-prev',
            start_date: '2026-06-01',
            end_date: '2026-06-25', // earlier gap, not abutting 2026-08-30
          },
        ],
      }) // prevRes
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'cycle-deleted' }] }) // DELETE
      .mockResolvedValueOnce({}); // COMMIT

    const ok = await cycleRepository.deleteCycle('user-1', 'cycle-deleted');
    expect(ok).toBe(true);

    const prevUpdateCalls = mockClient.query.mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycles')
    );
    expect(prevUpdateCalls.length).toBe(0);
  });
});

describe('cycleRepository.createManualCycle', () => {
  let mockClient: MockDbClient;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recalculates preceding cycle length when its end_date is shortened', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // nextRes
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'cycle-new',
            start_date: '2026-01-20',
            end_date: null,
            period_length: null,
            cycle_length: null,
          },
        ],
      }) // INSERT
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'cycle-prev',
            start_date: '2026-01-01',
            end_date: '2026-01-31',
            cycle_length: 30,
          },
        ],
      }) // prevRes
      .mockResolvedValueOnce({ rowCount: 1 }) // UPDATE cycles (prev)
      .mockResolvedValueOnce({}); // COMMIT

    await cycleRepository.createManualCycle('user-1', {
      start_date: '2026-01-20',
    });

    const prevUpdate = mockClient.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycles')
    );
    expect(prevUpdate).toBeDefined();
    // newPrevEnd = 2026-01-19, newPrevLen = 19 (days between 2026-01-01 and 2026-01-20)
    expect(prevUpdate![1]).toEqual(['2026-01-19', 19, 'cycle-prev', 'user-1']);
  });
});

describe('cycleRepository.updateCycle', () => {
  let mockClient: MockDbClient;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('recomputes cycle_length against next cycle when start_date changes without explicit cycle_length', async () => {
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: 'cycle-1',
            start_date: '2026-08-01',
            end_date: '2026-08-30',
            period_length: 5,
            cycle_length: 30,
            source: 'manual',
          },
        ],
      }) // oldRes
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ start_date: '2026-08-31' }],
      }) // nextRes
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'cycle-1',
            start_date: '2026-08-05',
            end_date: '2026-08-30',
            period_length: 5,
            cycle_length: 26,
            source: 'manual',
          },
        ],
      }) // UPDATE cycles
      .mockResolvedValueOnce({ rowCount: 5 }) // clear old daily entries
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert day 1
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert day 2
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert day 3
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert day 4
      .mockResolvedValueOnce({ rowCount: 1 }) // upsert day 5
      .mockResolvedValueOnce({}); // COMMIT

    const updated = await cycleRepository.updateCycle('user-1', 'cycle-1', {
      start_date: '2026-08-05',
    });

    expect(updated).toBeDefined();
    const updateCycleCall = mockClient.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('UPDATE cycles')
    );
    expect(updateCycleCall).toBeDefined();
    // Parameter 6 ($6) is newCycleLength = daysBetween(2026-08-05, 2026-08-31) = 26
    expect(updateCycleCall![1][5]).toBe(26);
  });
});
