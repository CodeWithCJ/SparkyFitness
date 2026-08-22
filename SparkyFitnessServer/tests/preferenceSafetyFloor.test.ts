import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/preferenceRepository.js');

describe('calorie safety floor preference validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it.each([800, 5000])(
    'accepts inclusive custom floor boundary %s',
    async (value) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          calorie_safety_floor_mode: 'custom',
          calorie_safety_floor_value: value,
        })
      ).resolves.toEqual({ user_id: 'user-1' });
    }
  );

  it('rejects an unknown mode', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        calorie_safety_floor_mode: 'sometimes',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([799, 5001, 1200.5])(
    'rejects invalid custom floor value %s',
    async (value) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          calorie_safety_floor_value: value,
        })
      ).rejects.toMatchObject({ status: 400 });
    }
  );

  it('rejects non-number values instead of coercing them', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        calorie_safety_floor_value: true,
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });
});
