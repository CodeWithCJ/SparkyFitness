import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { CHART_SCALE_MODES } from '@workspace/shared';

vi.mock('../models/preferenceRepository.js');

describe('chart scale mode preference validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it.each(CHART_SCALE_MODES)('accepts the supported mode %s', async (mode) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        chart_scale_mode: mode,
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });

  it('rejects an unknown mode', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        chart_scale_mode: 'logarithmic',
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects non-string values instead of coercing them', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        chart_scale_mode: 1,
      } as never)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('leaves the field untouched when it is omitted', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        date_format: 'yyyy-MM-dd',
      })
    ).resolves.toEqual({ user_id: 'user-1' });
    expect(
      vi.mocked(preferenceRepository.updateUserPreferences).mock.calls[0][1]
    ).not.toHaveProperty('chart_scale_mode');
  });

  it('validates the upsert path too', async () => {
    await expect(
      preferenceService.upsertUserPreferences('user-1', {
        user_id: 'user-1',
        chart_scale_mode: 'sideways',
      })
    ).rejects.toMatchObject({ status: 400 });
  });
});
