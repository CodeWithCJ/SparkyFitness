import { beforeEach, describe, expect, it, vi } from 'vitest';
import preferenceRepository from '../models/preferenceRepository.js';
import {
  getUserPreferences,
  updateFeatureChoices,
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
  it('shows the owner’s choices to someone acting on their behalf', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue({
      ...stored,
      feature_choices: { labResults: false },
    } as never);
    const result = await getUserPreferences(DELEGATE, OWNER);
    expect(result.feature_choices).toEqual({ labResults: false });
  });

  it('defaults to no choices when there is no preferences row', async () => {
    vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
      undefined as never
    );
    const result = await getUserPreferences(OWNER, OWNER);
    expect(result.feature_choices).toEqual({});
  });
});

describe('updateFeatureChoices', () => {
  it('passes the patch to the repository and returns its result', async () => {
    vi.mocked(preferenceRepository.mergeFeatureChoices).mockResolvedValue({
      status: 'ok',
      choices: { labResults: false },
    });
    const result = await updateFeatureChoices(OWNER, { labResults: false });
    expect(preferenceRepository.mergeFeatureChoices).toHaveBeenCalledWith(
      OWNER,
      { labResults: false }
    );
    expect(result).toEqual({ status: 'ok', choices: { labResults: false } });
  });
});
