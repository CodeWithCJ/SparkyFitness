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
