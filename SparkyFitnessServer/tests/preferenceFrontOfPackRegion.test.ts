import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { FRONT_OF_PACK_REGIONS } from '@workspace/shared';
import type { UserPreferencesMutator } from '@workspace/shared';

vi.mock('../models/preferenceRepository.js');

describe('front-of-pack region preference validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it.each(FRONT_OF_PACK_REGIONS)('accepts %s', async (region) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        front_of_pack_region: region,
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });

  it('rejects an unsupported region on update and upsert', async () => {
    // A client can post any string; the service has to reject it at runtime.
    const unsupported = {
      front_of_pack_region: 'peru',
    } as unknown as UserPreferencesMutator;
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', unsupported)
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preferenceService.upsertUserPreferences('user-1', {
        user_id: 'user-1',
        ...unsupported,
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
