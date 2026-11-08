import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userPreferencesMutatorSchema } from '@workspace/shared';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/preferenceRepository.js');

describe('calorie cycling preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it('accepts a mode and 7 whole weekday percentages', async () => {
    const payload = {
      calorie_cycling_mode: 'training_rest',
      calorie_cycling_offsets: [0, 15, 0, 15, 0, 15, 0],
    } as const;
    expect(userPreferencesMutatorSchema.parse(payload)).toMatchObject(payload);

    await preferenceService.updateUserPreferences('user-1', 'user-1', {
      ...payload,
      calorie_cycling_offsets: [...payload.calorie_cycling_offsets],
    });
    expect(preferenceRepository.updateUserPreferences).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ calorie_cycling_mode: 'training_rest' })
    );
  });

  it.each([
    [{ calorie_cycling_mode: 'weekly' }],
    [{ calorie_cycling_mode: null }],
    [{ calorie_cycling_offsets: [0, 10, 0] }],
    [{ calorie_cycling_offsets: [0, 41, 0, 0, 0, 0, 0] }],
    [{ calorie_cycling_offsets: [0, 1.5, 0, 0, 0, 0, 0] }],
    [{ calorie_cycling_offsets: '0,10,0,0,0,0,0' }],
    [{ calorie_cycling_offsets: null }],
  ])('rejects %j before persistence', async (value) => {
    const payload = value as never;
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', payload)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preferenceService.upsertUserPreferences('user-1', payload)
    ).rejects.toMatchObject({ status: 400 });
    expect(preferenceRepository.updateUserPreferences).not.toHaveBeenCalled();
    expect(preferenceRepository.upsertUserPreferences).not.toHaveBeenCalled();
  });
});
