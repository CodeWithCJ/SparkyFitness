import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate', () => {
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

  it('returns the row when data exists on or before the requested date', async () => {
    const row = {
      id: 'measurement-1',
      user_id: 'user-1',
      entry_date: '2026-06-12',
      weight: 80,
    };
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result =
      await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        'user-1',
        '2026-06-12'
      );

    expect(result).toEqual(row);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('selects bmr for the exact date while other fields carry forward', async () => {
    // The one-line fix for issue #2395. Reverting `entry_date = $2` back to `<= $2`
    // for bmr passed the whole suite before this, so the query text is asserted
    // directly: a measured BMR describes the day it was taken, and nothing else.
    mockClient.query.mockResolvedValue({ rows: [{ id: 'm1' }] });

    await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
      'user-1',
      '2026-06-12'
    );

    const sql: string = mockClient.query.mock.calls[0][0];
    const bmrSubselect = sql
      .split('\n')
      .find((line: string) => line.includes(') as bmr'));

    expect(bmrSubselect).toBeDefined();
    expect(bmrSubselect).toContain('entry_date = $2');
    expect(bmrSubselect).not.toContain('entry_date <= $2');

    // Body composition is still carried forward — only bmr changed.
    const weightSubselect = sql
      .split('\n')
      .find((line: string) => line.includes(') as weight'));
    expect(weightSubselect).toContain('entry_date <= $2');
  });

  it('returns null when no data exists', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: null }] });

    const result =
      await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        'user-1',
        '2026-06-13'
      );

    expect(result).toBeNull();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

describe('measurementRepository.getLatestManualCustomEntriesOnOrBeforeDate', () => {
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

  const runQuery = async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await measurementRepository.getLatestManualCustomEntriesOnOrBeforeDate(
      'user-1',
      '2026-05-10'
    );
    return mockClient.query.mock.calls[0][0] as string;
  };

  it('binds the user and the day in order and scopes the client to the user', async () => {
    // A swap of the two parameters would keep every other assertion green while
    // returning another user's rows, so the binding order is asserted directly.
    await runQuery();

    expect(mockClient.query.mock.calls[0][1]).toEqual(['user-1', '2026-05-10']);
    expect(vi.mocked(getClient)).toHaveBeenCalledWith('user-1');
  });

  it('resolves one row per category in a single query', async () => {
    const sql = await runQuery();
    expect(sql).toContain('DISTINCT ON (cm.category_id)');
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('bounds the lookup to on-or-before the requested day', async () => {
    const sql = await runQuery();
    expect(sql).toContain('cm.entry_date <= $2');
    expect(sql).not.toContain('cm.entry_date = $2');
  });

  it('restricts suggestions to manual sources so a sync sample is never offered', async () => {
    const sql = await runQuery();
    expect(sql).toContain("cm.source = 'manual'");
    expect(sql).toContain('cm.value IS NOT NULL');
  });

  it('orders by day then timestamp so the newest manual value wins', async () => {
    const sql = await runQuery();
    expect(sql).toContain(
      'ORDER BY cm.category_id, cm.entry_date DESC, cm.entry_timestamp DESC, cm.id DESC'
    );
  });
});

describe('measurementRepository.upsertStepData', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findQuery = (fragment: string): { text: string; values: any[] } =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((call: any[]) => ({ text: call[0], values: call[1] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .find((call: any) => call.text.includes(fragment));

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

  // Regression: a smaller/partial sync read must not clobber a complete day's
  // total. The web Daily Steps chart showed 13,441 while the mobile check-in
  // showed 4,252 because a later, smaller device/provider read overwrote the
  // full total in check_in_measurements.steps.
  it('updates existing days with a max-wins GREATEST so a smaller read cannot lower the total', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.startsWith('SELECT')) {
        return { rows: [{ id: 'ci-1', steps: 13441 }] };
      }
      return { rows: [{ id: 'ci-1', steps: 13441 }] };
    });

    await measurementRepository.upsertStepData(
      'user-1',
      'acting-1',
      4252,
      '2026-07-07'
    );

    const update = findQuery('UPDATE check_in_measurements');
    expect(update).toBeDefined();
    expect(update.text).toContain('steps = GREATEST($1::integer, steps)');
    expect(update.values).toEqual([4252, 'acting-1', '2026-07-07', 'user-1']);
  });

  it('inserts the incoming value verbatim when no row exists for the day', async () => {
    mockClient.query.mockImplementation(async (text: string) => {
      if (text.startsWith('SELECT')) {
        return { rows: [] };
      }
      return { rows: [{ id: 'ci-2', steps: 4252 }] };
    });

    await measurementRepository.upsertStepData(
      'user-1',
      'acting-1',
      4252,
      '2026-07-07'
    );

    expect(findQuery('UPDATE check_in_measurements')).toBeUndefined();
    const insert = findQuery('INSERT INTO check_in_measurements');
    expect(insert).toBeDefined();
    expect(insert.values).toEqual(['user-1', '2026-07-07', 4252, 'acting-1']);
  });
});

describe('measurementRepository.getLatestWeightHeight', () => {
  it('prefers prior measurements and falls back to the earliest later value for each field', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValue({ rows: [{ weight: '80', height: '180' }] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(client);

    const result = await measurementRepository.getLatestWeightHeight(
      'user-1',
      '2026-08-08'
    );

    expect(result).toEqual({ weightKg: 80, heightCm: 180 });
    const [sql, params] = client.query.mock.calls[0];
    expect(params).toEqual(['user-1', '2026-08-08']);
    for (const field of ['weight', 'height']) {
      expect(sql).toContain(
        `WHERE user_id = $1 AND entry_date <= $2 AND ${field} IS NOT NULL AND ${field} > 0`
      );
      expect(sql).toContain(
        `WHERE user_id = $1 AND entry_date > $2 AND ${field} IS NOT NULL AND ${field} > 0`
      );
    }
    expect(sql).toContain('COALESCE((SELECT weight');
    expect(sql).toContain('COALESCE((SELECT height');
    expect(sql).toContain('ORDER BY entry_date ASC, updated_at DESC LIMIT 1');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
