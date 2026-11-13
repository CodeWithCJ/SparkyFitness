import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userPreferencesMutatorSchema } from '@workspace/shared';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';

vi.mock('../models/preferenceRepository.js');

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
    user_id: 'user-1',
  });
  vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
    user_id: 'user-1',
  });
});

describe('adaptive activity preference', () => {
  it.each([true, false])(
    'accepts and preserves boolean %s in the contract',
    (enabled) => {
      expect(
        userPreferencesMutatorSchema.parse({
          adaptive_activity_separate: enabled,
        }).adaptive_activity_separate
      ).toBe(enabled);
    }
  );

  it.each([null, 'false', 0, {}])(
    'rejects invalid activity preference %j on update and upsert',
    async (value) => {
      const payload = { adaptive_activity_separate: value } as never;
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', payload)
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        preferenceService.upsertUserPreferences('user-1', payload)
      ).rejects.toMatchObject({ status: 400 });
    }
  );
});
