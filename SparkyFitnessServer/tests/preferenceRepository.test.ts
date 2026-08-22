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

  it('round-trips the active_vision_ai_service_id pointer through save and load', async () => {
    const row = { user_id: 'user-1', active_vision_ai_service_id: 'svc-99' };
    mockClient.query.mockResolvedValueOnce({ rows: [row] });
    mockClient.query.mockResolvedValueOnce({ rows: [row] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      active_vision_ai_service_id: 'svc-99',
    });
    const result = await preferenceRepository.getUserPreferences('user-1');

    expect(result.active_vision_ai_service_id).toBe('svc-99');
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'active_vision_ai_service_id'
    );
    // The 'in'-guard flag ($42) gates the CASE WHEN, and the value ($41)
    // precedes it. Use their stable SQL parameter numbers instead of counting
    // backward from the end, because new preferences are appended over time.
    const params = mockClient.query.mock.calls[0][1];
    expect(params[40]).toBe('svc-99');
    expect(params[41]).toBe(true);
  });

  it('leaves active_vision_ai_service_id untouched when the field is omitted', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      show_net_carbs: true,
    });

    // The guard flag is false, so the CASE WHEN keeps the stored pointer.
    const params = mockClient.query.mock.calls[0][1];
    expect(params[41]).toBe(false);
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

  it('round-trips calorie safety floor preferences through save and load', async () => {
    const row = {
      user_id: 'user-1',
      calorie_safety_floor_mode: 'custom',
      calorie_safety_floor_value: 1200,
    };
    mockClient.query.mockResolvedValueOnce({ rows: [row] });
    mockClient.query.mockResolvedValueOnce({ rows: [row] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      calorie_safety_floor_mode: 'custom',
      calorie_safety_floor_value: 1200,
    });
    const result = await preferenceRepository.getUserPreferences('user-1');

    expect(result.calorie_safety_floor_mode).toBe('custom');
    expect(result.calorie_safety_floor_value).toBe(1200);
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'calorie_safety_floor_mode'
    );
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'calorie_safety_floor_value'
    );
    expect(mockClient.query.mock.calls[0][1]).toContain('custom');
    expect(mockClient.query.mock.calls[0][1]).toContain(1200);
  });

  it('preserves saved safety-floor preferences when a partial upsert omits them', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });

    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      show_net_carbs: true,
    });

    const sql = mockClient.query.mock.calls[0][0] as string;
    expect(sql).toContain(
      'calorie_safety_floor_mode = COALESCE($45, user_preferences.calorie_safety_floor_mode)'
    );
    expect(sql).toContain(
      'calorie_safety_floor_value = COALESCE($46, user_preferences.calorie_safety_floor_value)'
    );
  });
});
