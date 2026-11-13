import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/preferenceRepository.js');

describe('weekly weight goal preference validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it.each([-2, -0.501, 0, 0.25, 2])(
    'accepts a weekly goal of %s kg',
    async (rate) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          goal_mode: 'weekly',
          goal_mode_weekly_change_kg: rate,
        })
      ).resolves.toEqual({ user_id: 'user-1' });
    }
  );

  it.each([
    -2.001,
    2.001,
    NaN,
    Infinity,
    -Infinity,
    0.0001,
    0.5000000001,
    null,
    true,
    '0.5',
  ])(
    'rejects an invalid weekly rate %s instead of rounding or coercing it',
    async (rate) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          goal_mode_weekly_change_kg: rate,
        } as never)
      ).rejects.toMatchObject({ status: 400 });
    }
  );

  it('validates weekly rates on upsert too', async () => {
    await expect(
      preferenceService.upsertUserPreferences('user-1', {
        user_id: 'user-1',
        goal_mode_weekly_change_kg: 3,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('does not inject weekly settings into an unrelated update', async () => {
    await preferenceService.updateUserPreferences('user-1', 'user-1', {
      date_format: 'yyyy-MM-dd',
    });
    expect(
      vi.mocked(preferenceRepository.updateUserPreferences).mock.calls[0][1]
    ).not.toHaveProperty('goal_mode_weekly_change_kg');
  });
});
