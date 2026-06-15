import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import { getClient } from '../db/poolManager.js';
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));
describe('preferenceRepository bootstrapUserTimezoneIfUnset', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
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

  it('round-trips the show_net_carbs preference through save and load', async () => {
    const row = { user_id: 'user-1', show_net_carbs: true };
    mockClient.query.mockResolvedValueOnce({ rows: [row] });
    mockClient.query.mockResolvedValueOnce({ rows: [row] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      show_net_carbs: true,
    });
    const result = await preferenceRepository.getUserPreferences('user-1');

    expect(result.show_net_carbs).toBe(true);
    expect(mockClient.query.mock.calls[0][0]).toContain('show_net_carbs');
    expect(mockClient.query.mock.calls[0][1]).toContain(true);
    expect(mockClient.query.mock.calls[1]).toEqual([
      'SELECT * FROM user_preferences WHERE user_id = $1',
      ['user-1'],
    ]);
  });

  it('round-trips goal_mode preferences through save and load', async () => {
    const row = {
      user_id: 'user-1',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 15,
    };
    mockClient.query.mockResolvedValueOnce({ rows: [row] });
    mockClient.query.mockResolvedValueOnce({ rows: [row] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      goal_mode: 'recomp',
      goal_mode_calculation_method: 'adaptive',
      goal_mode_custom_percentage: 15,
    });
    const result = await preferenceRepository.getUserPreferences('user-1');

    expect(result.goal_mode).toBe('recomp');
    expect(result.goal_mode_calculation_method).toBe('adaptive');
    expect(result.goal_mode_custom_percentage).toBe(15);
    expect(mockClient.query.mock.calls[0][0]).toContain('goal_mode');
    expect(mockClient.query.mock.calls[0][1]).toContain('recomp');
    expect(mockClient.query.mock.calls[0][1]).toContain('adaptive');
    expect(mockClient.query.mock.calls[0][1]).toContain(15);
  });
});
