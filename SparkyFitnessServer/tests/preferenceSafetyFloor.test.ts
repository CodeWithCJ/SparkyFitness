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

  it.each(['standard', 'clinical_minimum'])(
    'accepts the %s mode',
    async (mode) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          calorie_safety_floor_mode: mode,
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

  // The three-mode design briefly allowed turning clamping off entirely. The
  // clinical minimum is not opt-out, so these must not be revived by accident.
  it.each(['custom', 'disabled'])(
    'rejects the retired %s mode',
    async (mode) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          calorie_safety_floor_mode: mode,
        })
      ).rejects.toMatchObject({ status: 400 });
    }
  );

  it('leaves the mode untouched when the update omits it', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        activity_level: 'light',
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });
});
