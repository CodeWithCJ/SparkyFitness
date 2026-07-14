import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import nutrientDisplayPreferenceService from '../services/nutrientDisplayPreferenceService.js';
import nutrientDisplayPreferenceRepository from '../models/nutrientDisplayPreferenceRepository.js';
import customNutrientService from '../services/customNutrientService.js';

vi.mock('../models/nutrientDisplayPreferenceRepository', () => ({
  default: {
    getNutrientDisplayPreferences: vi.fn(),
    upsertNutrientDisplayPreference: vi.fn(),
    deleteNutrientDisplayPreference: vi.fn(),
    createDefaultNutrientPreferences: vi.fn(),
  },
}));

vi.mock('../services/customNutrientService', () => ({
  default: {
    getCustomNutrients: vi.fn(),
  },
}));

describe('nutrientDisplayPreferenceService.getNutrientDisplayPreferences', () => {
  beforeEach(() => {
    // @ts-expect-error mocked
    customNutrientService.getCustomNutrients.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns a saved diary/mobile row rather than dropping it', async () => {
    const savedDiaryRow = {
      view_group: 'diary',
      platform: 'mobile',
      visible_nutrients: JSON.stringify(['sodium', 'potassium']),
    };
    // @ts-expect-error mocked
    nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences.mockResolvedValue(
      [savedDiaryRow]
    );

    const result =
      await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(
        'user-1'
      );

    const diaryPref = result.find(
      (p) => p.view_group === 'diary' && p.platform === 'mobile'
    );
    expect(diaryPref).toBeDefined();
    expect(diaryPref?.visible_nutrients).toEqual(['sodium', 'potassium']);
  });

  it('synthesizes an empty-array default diary/mobile row when none is saved', async () => {
    // @ts-expect-error mocked
    nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences.mockResolvedValue(
      []
    );

    const result =
      await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(
        'user-1'
      );

    const diaryPref = result.find(
      (p) => p.view_group === 'diary' && p.platform === 'mobile'
    );
    expect(diaryPref).toBeDefined();
    expect(diaryPref?.visible_nutrients).toEqual([]);
  });

  it('does not synthesize a diary/desktop row', async () => {
    // @ts-expect-error mocked
    nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences.mockResolvedValue(
      []
    );

    const result =
      await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(
        'user-1'
      );

    const diaryDesktopPref = result.find(
      (p) => p.view_group === 'diary' && p.platform === 'desktop'
    );
    expect(diaryDesktopPref).toBeUndefined();
  });

  it('still returns the 12 standard view_group x platform rows plus the mobile-only diary row', async () => {
    // @ts-expect-error mocked
    nutrientDisplayPreferenceRepository.getNutrientDisplayPreferences.mockResolvedValue(
      []
    );

    const result =
      await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(
        'user-1'
      );

    expect(result).toHaveLength(13);
  });
});
