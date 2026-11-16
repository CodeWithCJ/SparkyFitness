import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import {
  bootstrapUserTimezone,
  getFeatureChoices,
  getUserPreferences,
  updateFeatureChoices,
  updateUserPreferences,
  upsertUserPreferences,
} from '../services/preferenceService.js';

vi.mock('../models/preferenceRepository.js');

const OWNER = 'owner-1';
const DELEGATE = 'delegate-1';

const stored = {
  user_id: OWNER,
  time_format: null,
  max_heart_rate: 188,
  resting_heart_rate: 52,
  hr_zone_method: 'custom',
  hr_zone_custom_floors: [100, 120, 140, 160, 180],
};

describe('getUserPreferences heart rate zone fields', () => {
  beforeEach(() => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      stored as never
    );
  });

  it('returns them to the owner', async () => {
    const result = await getUserPreferences(OWNER, OWNER);
    expect(result.max_heart_rate).toBe(188);
    expect(result.hr_zone_custom_floors).toEqual([100, 120, 140, 160, 180]);
  });

  it('leaves them out for a switched delegate', async () => {
    const result = await getUserPreferences(DELEGATE, OWNER);
    expect(result).not.toHaveProperty('max_heart_rate');
    expect(result).not.toHaveProperty('resting_heart_rate');
    expect(result).not.toHaveProperty('hr_zone_method');
    expect(result).not.toHaveProperty('hr_zone_custom_floors');
    expect(result.time_format).toBe('h:mm A');
  });
});

describe('getUserPreferences feature choices', () => {
  it('leaves them out: they are read through GET /features only', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...stored,
      feature_choices: { web: { labResults: false } },
    } as never);
    expect(await getUserPreferences(OWNER, OWNER)).not.toHaveProperty(
      'feature_choices'
    );
    expect(await getUserPreferences(DELEGATE, OWNER)).not.toHaveProperty(
      'feature_choices'
    );
  });

  it('leaves them out of what PUT, POST and bootstrap-timezone return', async () => {
    const row = {
      ...stored,
      timezone: 'Europe/Madrid',
      feature_choices: { web: { labResults: false } },
    };
    vi.mocked(preferenceRepository.updateUserPreferences).mockResolvedValue(
      row as never
    );
    vi.mocked(preferenceRepository.upsertUserPreferences).mockResolvedValue(
      row as never
    );
    vi.mocked(
      preferenceRepository.bootstrapUserTimezoneIfUnset
    ).mockResolvedValue(row as never);

    const updated = await updateUserPreferences(OWNER, OWNER, {});
    const upserted = await upsertUserPreferences(OWNER, {});
    const bootstrapped = await bootstrapUserTimezone(
      OWNER,
      OWNER,
      'Europe/Madrid'
    );
    for (const response of [updated, upserted, bootstrapped]) {
      expect(response).not.toHaveProperty('feature_choices');
      expect(response).toHaveProperty('timezone', 'Europe/Madrid');
    }
  });

  it('has none in the defaults for a person with no preferences row', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      undefined as never
    );
    expect(await getUserPreferences(OWNER, OWNER)).not.toHaveProperty(
      'feature_choices'
    );
  });
});

describe('getFeatureChoices', () => {
  it('reads as the person asking and fills both platforms', async () => {
    vi.mocked(preferenceRepository.getFeatureChoices).mockResolvedValue({
      web: { labResults: false },
    });
    expect(await getFeatureChoices(DELEGATE, OWNER)).toEqual({
      web: { labResults: false },
      mobile: {},
    });
    expect(preferenceRepository.getFeatureChoices).toHaveBeenCalledWith(
      OWNER,
      DELEGATE
    );
  });

  it('answers null when someone acting for the person cannot see the row', async () => {
    // Every account has a row: an empty read for a delegate means their grant
    // does not cover preferences, never that there are no choices.
    vi.mocked(preferenceRepository.getFeatureChoices).mockResolvedValue(null);
    expect(await getFeatureChoices(DELEGATE, OWNER)).toBeNull();
  });

  it('gives empty maps to a person with no preferences row', async () => {
    vi.mocked(preferenceRepository.getFeatureChoices).mockResolvedValue(null);
    expect(await getFeatureChoices(OWNER, OWNER)).toEqual({
      web: {},
      mobile: {},
    });
  });

  it('passes a failed read on instead of answering defaults', async () => {
    vi.mocked(preferenceRepository.getFeatureChoices).mockRejectedValue(
      new Error('database down')
    );
    await expect(getFeatureChoices(OWNER, OWNER)).rejects.toThrow(
      'database down'
    );
  });
});

describe('updateFeatureChoices', () => {
  it('passes the patch to the repository and returns its result', async () => {
    const patch = { mobile: { labResults: false } };
    vi.mocked(preferenceRepository.mergeFeatureChoices).mockResolvedValue({
      status: 'ok',
      choices: { web: {}, mobile: { labResults: false } },
    });
    const result = await updateFeatureChoices(OWNER, patch);
    expect(preferenceRepository.mergeFeatureChoices).toHaveBeenCalledWith(
      OWNER,
      patch
    );
    expect(result).toEqual({
      status: 'ok',
      choices: { web: {}, mobile: { labResults: false } },
    });
  });
});
