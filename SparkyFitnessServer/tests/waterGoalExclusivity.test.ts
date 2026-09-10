import { vi, beforeEach, describe, expect, it } from 'vitest';
import nutrientDisplayPreferenceService from '../services/nutrientDisplayPreferenceService.js';
import nutrientDisplayPreferenceRepository from '../models/nutrientDisplayPreferenceRepository.js';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import customNutrientService from '../services/customNutrientService.js';

vi.mock('../models/nutrientDisplayPreferenceRepository.js', () => ({
  default: {
    getNutrientDisplayPreferences: vi.fn(),
    upsertNutrientDisplayPreference: vi.fn(),
    deleteNutrientDisplayPreference: vi.fn(),
    createDefaultNutrientPreferences: vi.fn(),
  },
}));

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi.fn(),
  },
}));

vi.mock('../models/nutrientGoalPreferenceRepository.js', () => ({
  default: {
    getNutrientGoalPreferences: vi.fn(),
    upsertNutrientGoalPreference: vi.fn(),
    deleteNutrientGoalPreference: vi.fn(),
    renameNutrientGoalPreferenceKey: vi.fn(),
  },
}));

const displayRepo = nutrientDisplayPreferenceRepository as any;
const customNutrients = customNutrientService as any;

describe('waterGoalExclusivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    customNutrients.getCustomNutrients.mockResolvedValue([]);
  });

  it('Gate 1: synthesized goal view group never contains water_ml for desktop or mobile', async () => {
    displayRepo.getNutrientDisplayPreferences.mockResolvedValue([]);

    const preferences =
      await nutrientDisplayPreferenceService.getNutrientDisplayPreferences(
        'user-1'
      );

    const desktopGoal = preferences.find(
      (p: any) => p.view_group === 'goal' && p.platform === 'desktop'
    );
    const mobileGoal = preferences.find(
      (p: any) => p.view_group === 'goal' && p.platform === 'mobile'
    );

    expect(desktopGoal).toBeDefined();
    expect(desktopGoal.visible_nutrients).not.toContain('water_ml');

    expect(mobileGoal).toBeDefined();
    expect(mobileGoal.visible_nutrients).not.toContain('water_ml');
  });

  it('Gate 1: resetNutrientDisplayPreference for goal group never contains water_ml', async () => {
    displayRepo.deleteNutrientDisplayPreference.mockResolvedValue(undefined);
    displayRepo.upsertNutrientDisplayPreference.mockResolvedValue({});

    await nutrientDisplayPreferenceService.resetNutrientDisplayPreference(
      'user-1',
      'goal',
      'desktop'
    );

    expect(displayRepo.upsertNutrientDisplayPreference).toHaveBeenCalledWith(
      'user-1',
      'goal',
      'desktop',
      expect.not.arrayContaining(['water_ml'])
    );
  });

  it('Gate 1: addNutrientToSpecificViews respects NON_GOAL_NUTRIENT_KEYS and skips water_ml for goal group', async () => {
    displayRepo.getNutrientDisplayPreferences.mockResolvedValue([]);
    displayRepo.upsertNutrientDisplayPreference.mockResolvedValue({});

    await nutrientDisplayPreferenceService.addNutrientToSpecificViews(
      'user-1',
      'water_ml'
    );

    // Should not have called upsert with group === 'goal'
    const calls = displayRepo.upsertNutrientDisplayPreference.mock.calls;
    const goalCalls = calls.filter((call: any[]) => call[1] === 'goal');
    expect(goalCalls.length).toBe(0);
  });

  it('Gate 4: isKnownNutrientKey and upsertGoalPreference reject water_ml', async () => {
    const isKnown = await nutrientGoalPreferenceService.isKnownNutrientKey(
      'user-1',
      'water_ml'
    );
    expect(isKnown).toBe(false);

    await expect(
      nutrientGoalPreferenceService.upsertGoalPreference(
        'user-1',
        'water_ml',
        'minimum'
      )
    ).rejects.toThrow(/Unknown nutrient key: water_ml/);
  });
});
