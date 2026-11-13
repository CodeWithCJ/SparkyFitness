import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

describe('weekly weight goal persistence', () => {
  const query =
    vi.fn<
      (
        sql: string,
        params: unknown[]
      ) => Promise<{ rows: Record<string, unknown>[] }>
    >();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getClient).mockResolvedValue({
      query,
      release: vi.fn(),
    } as unknown as Awaited<ReturnType<typeof getClient>>);
    query.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
  });

  it.each(['update', 'upsert'] as const)(
    'persists a signed weekly rate on %s',
    async (operation) => {
      const preferences = {
        goal_mode: 'weekly' as const,
        goal_mode_weekly_change_kg: -0.501,
      };
      if (operation === 'update') {
        await preferenceRepository.updateUserPreferences('user-1', preferences);
      } else {
        await preferenceRepository.upsertUserPreferences({
          user_id: 'user-1',
          ...preferences,
        });
      }
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('goal_mode_weekly_change_kg');
      expect(params[57]).toBe(-0.501);
      if (operation === 'upsert') {
        expect(sql).toContain('COALESCE($58::double precision, 0)');
      }
    }
  );

  it('preserves all goal settings when an unrelated upsert omits them', async () => {
    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      date_format: 'yyyy-MM-dd',
    });
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'goal_mode = COALESCE($33, user_preferences.goal_mode)'
    );
    expect(sql).toContain(
      'goal_mode_calculation_method = COALESCE($34, user_preferences.goal_mode_calculation_method)'
    );
    expect(sql).toContain(
      'goal_mode_custom_percentage = COALESCE($35, user_preferences.goal_mode_custom_percentage)'
    );
    expect(sql).toContain(
      'goal_mode_weekly_change_kg = COALESCE($58, user_preferences.goal_mode_weekly_change_kg)'
    );
    expect(params[57]).toBeUndefined();
  });

  it.each(['update', 'upsert'] as const)(
    'keeps weekly goals independent from adaptive activity separation on %s',
    async (operation) => {
      const preferences = {
        goal_mode_weekly_change_kg: -0.454,
        adaptive_activity_separate: true,
      };
      if (operation === 'update') {
        await preferenceRepository.updateUserPreferences('user-1', preferences);
      } else {
        await preferenceRepository.upsertUserPreferences({
          user_id: 'user-1',
          ...preferences,
        });
      }
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('adaptive_activity_separate = COALESCE($57,');
      expect(sql).toContain('goal_mode_weekly_change_kg = COALESCE($58,');
      expect(params[56]).toBe(true);
      expect(params[57]).toBe(-0.454);
    }
  );
});
