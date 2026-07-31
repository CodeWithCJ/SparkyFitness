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

describe('measurementRepository custom categories (visibility + ordering)', () => {
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

  it('getCustomCategories selects the visibility/order columns and sorts by sort_order then created_at then id', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await measurementRepository.getCustomCategories('user-1');

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('is_visible');
    expect(text).toContain('sort_order');
    expect(text).toContain('ORDER BY sort_order ASC, created_at ASC, id ASC');
    expect(values).toEqual(['user-1']);
  });

  it('createCustomCategory defaults is_visible=true and sort_order to max+10 when not provided', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cat-1' }] });

    await measurementRepository.createCustomCategory({
      user_id: 'user-1',
      name: 'Weight',
      display_name: null,
      frequency: 'Daily',
      measurement_type: 'kg',
      data_type: 'numeric',
      created_by_user_id: 'user-1',
    });

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('COALESCE($7, true)');
    expect(text).toContain(
      'COALESCE($8, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM custom_categories WHERE user_id = $1))'
    );
    expect(values[6]).toBeUndefined();
    expect(values[7]).toBeUndefined();
  });

  it('createCustomCategory preserves explicit is_visible=false and sort_order=0', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: 'cat-2' }] });

    await measurementRepository.createCustomCategory({
      user_id: 'user-1',
      name: 'Hidden',
      display_name: null,
      frequency: 'Daily',
      measurement_type: 'kg',
      data_type: 'numeric',
      is_visible: false,
      sort_order: 0,
      created_by_user_id: 'user-1',
    });

    const values = mockClient.query.mock.calls[0][1];
    expect(values[6]).toBe(false);
    expect(values[7]).toBe(0);
  });

  it('updateCustomCategory coalesces is_visible and sort_order while preserving explicit false/0', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: 'cat-3', is_visible: false, sort_order: 0 }],
    });

    await measurementRepository.updateCustomCategory(
      'cat-3',
      'user-1',
      'user-1',
      {
        is_visible: false,
        sort_order: 0,
      }
    );

    const [text, values] = mockClient.query.mock.calls[0];
    expect(text).toContain('is_visible = COALESCE($6, is_visible)');
    expect(text).toContain('sort_order = COALESCE($7, sort_order)');
    expect(values[5]).toBe(false);
    expect(values[6]).toBe(0);
    expect(values[7]).toBe('user-1');
    expect(values[8]).toBe('cat-3');
    expect(values[9]).toBe('user-1');
  });

  it('nested category metadata in entry queries includes id, is_visible, and sort_order', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await measurementRepository.getCustomMeasurementEntries(
      'user-1',
      null,
      null,
      null
    );
    await measurementRepository.getCustomMeasurementEntriesByDate(
      'user-1',
      '2026-07-31'
    );

    const queries = mockClient.query.mock.calls.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (call: any[]) => call[0] as string
    );
    for (const query of queries) {
      expect(query).toContain("'id', cc.id");
      expect(query).toContain("'is_visible', cc.is_visible");
      expect(query).toContain("'sort_order', cc.sort_order");
    }
  });
});
