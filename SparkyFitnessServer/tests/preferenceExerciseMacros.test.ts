import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userPreferencesMutatorSchema } from '@workspace/shared';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/preferenceRepository.js');

describe('exercise macro preference', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([true, false])(
    'preserves the boolean %s in the shared contract',
    (enabled) => {
      expect(
        userPreferencesMutatorSchema.parse({
          adjust_macros_with_exercise: enabled,
        })
      ).toHaveProperty('adjust_macros_with_exercise', enabled);
    }
  );

  it.each([null, 'false', 0, {}])(
    'rejects invalid value %j before persistence',
    async (value) => {
      const payload = { adjust_macros_with_exercise: value } as never;
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', payload)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        preferenceService.upsertUserPreferences('user-1', payload)
      ).rejects.toMatchObject({ status: 400 });
      expect(preferenceRepository.updateUserPreferences).not.toHaveBeenCalled();
      expect(preferenceRepository.upsertUserPreferences).not.toHaveBeenCalled();
    }
  );
});
