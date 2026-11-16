import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceService from '../services/preferenceService.js';
import preferenceRepository from '../models/preferenceRepository.js';
import {
  BAC_DISPLAY_UNITS,
  BAC_DISTRIBUTION_FORMULAS,
} from '@workspace/shared';

vi.mock('../models/preferenceRepository.js');

describe('blood alcohol preference validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue({
      user_id: 'user-1',
    });
  });

  it.each(BAC_DISTRIBUTION_FORMULAS)(
    'accepts the formula %s',
    async (formula) => {
      await expect(
        preferenceService.updateUserPreferences('user-1', 'user-1', {
          bac_distribution_formula: formula,
        })
      ).resolves.toEqual({ user_id: 'user-1' });
    }
  );

  it.each(BAC_DISPLAY_UNITS)('accepts the display unit %s', async (unit) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        bac_display_unit: unit,
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });

  it.each([0.1, 0.15, 0.25])('accepts the rate %s', async (rate) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        bac_elimination_rate: rate,
      })
    ).resolves.toEqual({ user_id: 'user-1' });
  });

  it.each([
    { bac_distribution_formula: 'guess' },
    { bac_display_unit: 'mg/dl' },
    { bac_elimination_rate: 0.05 },
    { bac_elimination_rate: 0.3 },
    { bac_elimination_rate: '0.15' },
  ])('rejects %o with 400 on update and upsert', async (fields) => {
    await expect(
      preferenceService.updateUserPreferences(
        'user-1',
        'user-1',
        fields as never
      )
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      preferenceService.upsertUserPreferences('user-1', {
        user_id: 'user-1',
        ...fields,
      } as never)
    ).rejects.toMatchObject({ status: 400 });
    expect(preferenceRepository.updateUserPreferences).not.toHaveBeenCalled();
    expect(preferenceRepository.upsertUserPreferences).not.toHaveBeenCalled();
  });

  it('leaves the fields untouched when they are omitted', async () => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        date_format: 'yyyy-MM-dd',
      })
    ).resolves.toEqual({ user_id: 'user-1' });
    const payload = vi.mocked(preferenceRepository.updateUserPreferences).mock
      .calls[0][1];
    expect(payload).not.toHaveProperty('bac_distribution_formula');
    expect(payload).not.toHaveProperty('bac_elimination_rate');
    expect(payload).not.toHaveProperty('bac_display_unit');
  });
});
