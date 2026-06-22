import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import dashboardLayoutRepository from '../models/dashboardLayoutRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('dashboardLayoutRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
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

  it('returns the row for a user/page when present', async () => {
    const row = {
      user_id: 'user-1',
      page_key: 'diary',
      layout: { lg: [] },
      hidden: [],
    };
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result = await dashboardLayoutRepository.getDashboardLayout(
      'user-1',
      'diary'
    );

    expect(result).toEqual(row);
    expect(mockClient.query).toHaveBeenCalledWith(expect.any(String), [
      'user-1',
      'diary',
    ]);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('returns null when no row exists', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    const result = await dashboardLayoutRepository.getDashboardLayout(
      'user-1',
      'diary'
    );

    expect(result).toBeNull();
  });

  it('upserts via ON CONFLICT and serializes JSON payloads', async () => {
    const layout = { lg: [{ i: 'energy', x: 0, y: 0, w: 3, h: 10 }] };
    const hidden = ['water'];
    const row = { user_id: 'user-1', page_key: 'diary', layout, hidden };
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result = await dashboardLayoutRepository.upsertDashboardLayout(
      'user-1',
      'diary',
      { layout, hidden }
    );

    expect(result).toEqual(row);
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (user_id, page_key)'
    );
    expect(mockClient.query.mock.calls[0][1]).toEqual([
      'user-1',
      'diary',
      JSON.stringify(layout),
      JSON.stringify(hidden),
    ]);
  });

  it('deletes the row for reset', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await dashboardLayoutRepository.deleteDashboardLayout('user-1', 'diary');

    expect(mockClient.query.mock.calls[0][0]).toContain('DELETE FROM');
    expect(mockClient.query.mock.calls[0][1]).toEqual(['user-1', 'diary']);
  });

  it('releases the client when the query fails', async () => {
    mockClient.query.mockRejectedValue(new Error('DB error'));

    await expect(
      dashboardLayoutRepository.getDashboardLayout('user-1', 'diary')
    ).rejects.toThrow('DB error');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
