import { beforeEach, describe, expect, it, vi } from 'vitest';
import fastingRepository from '../models/fastingRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

const USER = 'user-1';
const START = '2026-11-26T10:00:00.000Z';
const TARGET = '2026-11-27T02:00:00.000Z';
const CLIENT_ID = '33333333-3333-4333-8333-333333333333';

describe('fastingRepository client_id support', () => {
  const mockQuery = vi.fn();
  const mockRelease = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue({
      query: mockQuery,
      release: mockRelease,
    } as never);
  });

  it('inserts client_id when provided to createFastingLog and defaults to null when omitted', async () => {
    const rowWithClient = { id: 'f-1', client_id: CLIENT_ID };
    const rowWithoutClient = { id: 'f-2', client_id: null };
    mockQuery
      .mockResolvedValueOnce({ rows: [rowWithClient] })
      .mockResolvedValueOnce({ rows: [rowWithoutClient] });

    const createdWith = await fastingRepository.createFastingLog(
      USER,
      START,
      TARGET,
      '16:8 Leangains',
      CLIENT_ID
    );
    expect(createdWith).toEqual(rowWithClient);
    expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO fasting_logs');
    expect(mockQuery.mock.calls[0][0]).toContain('client_id');
    expect(mockQuery.mock.calls[0][1]).toEqual([
      USER,
      START,
      TARGET,
      '16:8 Leangains',
      CLIENT_ID,
    ]);

    const createdWithout = await fastingRepository.createFastingLog(
      USER,
      START,
      TARGET,
      '16:8 Leangains'
    );
    expect(createdWithout).toEqual(rowWithoutClient);
    expect(mockQuery.mock.calls[1][1]).toEqual([
      USER,
      START,
      TARGET,
      '16:8 Leangains',
      null,
    ]);
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });

  it('queries fasting_logs by user_id and client_id in findFastingLogByClientId', async () => {
    const row = { id: 'f-1', user_id: USER, client_id: CLIENT_ID };
    mockQuery
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] });

    const found = await fastingRepository.findFastingLogByClientId(
      USER,
      CLIENT_ID
    );
    expect(found).toEqual(row);
    expect(mockQuery.mock.calls[0][0]).toContain(
      'WHERE user_id = $1 AND client_id = $2'
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([USER, CLIENT_ID]);

    const missing = await fastingRepository.findFastingLogByClientId(
      USER,
      CLIENT_ID
    );
    expect(missing).toBeNull();
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });
});
