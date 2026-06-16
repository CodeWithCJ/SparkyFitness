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

  it('passes the caller-provided max visible date into the guarded query', async () => {
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
        '2026-06-12',
        '2026-06-12'
      );

    expect(result).toEqual(row);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE $2::date <= $3::date'),
      ['user-1', '2026-06-12', '2026-06-12']
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('returns null when the requested date is beyond the visible cutoff', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result =
      await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
        'user-1',
        '2026-06-13',
        '2026-06-12'
      );

    expect(result).toBeNull();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
