import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import { getClient } from '../db/poolManager.js';
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));
describe('preferenceRepository bootstrapUserTimezoneIfUnset', () => {
  let mockClient;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('uses a null-only upsert and returns the resulting row', async () => {
    const row = { user_id: 'user-1', timezone: 'America/Chicago' };
    mockClient.query.mockResolvedValue({ rows: [row] });
    const result = await preferenceRepository.bootstrapUserTimezoneIfUnset(
      'user-1',
      'America/Chicago'
    );
    expect(result).toEqual(row);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_preferences.timezone IS NULL'),
      ['user-1', 'America/Chicago']
    );
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (user_id) DO UPDATE SET'
    );
  });
  it('always releases the client when the query succeeds', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ timezone: 'America/Chicago' }],
    });
    await preferenceRepository.bootstrapUserTimezoneIfUnset(
      'user-1',
      'America/Chicago'
    );
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
  it('always releases the client when the query fails', async () => {
    mockClient.query.mockRejectedValue(new Error('DB error'));
    await expect(
      preferenceRepository.bootstrapUserTimezoneIfUnset(
        'user-1',
        'America/Chicago'
      )
    ).rejects.toThrow('DB error');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});
