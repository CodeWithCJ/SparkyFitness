import { vi, beforeEach, describe, expect, it } from 'vitest';
import nutrientGoalPreferenceService from '../services/nutrientGoalPreferenceService.js';
import nutrientGoalPreferenceRepository from '../models/nutrientGoalPreferenceRepository.js';
import customNutrientService from '../services/customNutrientService.js';

vi.mock('../models/nutrientGoalPreferenceRepository.js', () => ({
  default: {
    getNutrientGoalPreferences: vi.fn(),
    upsertNutrientGoalPreference: vi.fn(),
    deleteNutrientGoalPreference: vi.fn(),
    renameNutrientGoalPreferenceKey: vi.fn(),
  },
}));

vi.mock('../services/customNutrientService.js', () => ({
  default: {
    getCustomNutrients: vi.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const repo = nutrientGoalPreferenceRepository as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const customNutrients = customNutrientService as any;

describe('nutrientGoalPreferenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getEffectiveGoalTypes', () => {
    it('resolves built-in defaults for predefined nutrients with no override', async () => {
      repo.getNutrientGoalPreferences.mockResolvedValue([]);
      customNutrients.getCustomNutrients.mockResolvedValue([]);

      const result =
        await nutrientGoalPreferenceService.getEffectiveGoalTypes('user-1');

      // Known "stay under" nutrients default to maximum...
      expect(result.sodium).toEqual({ goalType: 'maximum' });
      expect(result.cholesterol).toEqual({ goalType: 'maximum' });
      expect(result.saturated_fat).toEqual({ goalType: 'maximum' });
      expect(result.trans_fat).toEqual({ goalType: 'maximum' });
      expect(result.sugars).toEqual({ goalType: 'maximum' });
      // ...everything else defaults to minimum.
      expect(result.protein).toEqual({ goalType: 'minimum' });
      expect(result.calories).toEqual({ goalType: 'minimum' });
      expect(result.potassium).toEqual({ goalType: 'minimum' });
    });

    it('lets a saved override take precedence over the built-in default', async () => {
      repo.getNutrientGoalPreferences.mockResolvedValue([
        {
          nutrient_key: 'protein',
          goal_type: 'maximum',
          target_min: null,
          target_max: null,
        },
        {
          nutrient_key: 'calories',
          goal_type: 'target',
          target_min: 1700,
          target_max: 1900,
        },
      ]);
      customNutrients.getCustomNutrients.mockResolvedValue([]);

      const result =
        await nutrientGoalPreferenceService.getEffectiveGoalTypes('user-1');

      expect(result.protein).toEqual({ goalType: 'maximum' });
      expect(result.calories).toEqual({
        goalType: 'target',
        targetMin: 1700,
        targetMax: 1900,
      });
      // Untouched keys still resolve to their built-in default.
      expect(result.sodium).toEqual({ goalType: 'maximum' });
    });

    it('includes custom nutrient names, defaulting to minimum', async () => {
      repo.getNutrientGoalPreferences.mockResolvedValue([]);
      customNutrients.getCustomNutrients.mockResolvedValue([
        { id: 'cn-1', name: 'Added Sugars' },
        { id: 'cn-2', name: '' },
        { id: 'cn-3' },
      ]);

      const result =
        await nutrientGoalPreferenceService.getEffectiveGoalTypes('user-1');

      expect(result['Added Sugars']).toEqual({ goalType: 'minimum' });
      // Blank/missing names are filtered out rather than producing a '' key.
      expect(Object.keys(result)).not.toContain('');
    });
  });

  describe('upsertGoalPreference', () => {
    it('persists a minimum/maximum preference with a null band', async () => {
      repo.upsertNutrientGoalPreference.mockResolvedValue({
        nutrient_key: 'sodium',
        goal_type: 'maximum',
        target_min: null,
        target_max: null,
      });

      await nutrientGoalPreferenceService.upsertGoalPreference(
        'user-1',
        'sodium',
        'maximum'
      );

      expect(repo.upsertNutrientGoalPreference).toHaveBeenCalledWith(
        'user-1',
        'sodium',
        'maximum',
        null,
        null
      );
    });

    it('persists a valid target band', async () => {
      repo.upsertNutrientGoalPreference.mockResolvedValue({});

      await nutrientGoalPreferenceService.upsertGoalPreference(
        'user-1',
        'calories',
        'target',
        1700,
        1900
      );

      expect(repo.upsertNutrientGoalPreference).toHaveBeenCalledWith(
        'user-1',
        'calories',
        'target',
        1700,
        1900
      );
    });

    it('rejects a target goal missing its band', async () => {
      await expect(
        nutrientGoalPreferenceService.upsertGoalPreference(
          'user-1',
          'calories',
          'target'
        )
      ).rejects.toThrow();
      expect(repo.upsertNutrientGoalPreference).not.toHaveBeenCalled();
    });

    it('rejects a target band where min > max', async () => {
      await expect(
        nutrientGoalPreferenceService.upsertGoalPreference(
          'user-1',
          'calories',
          'target',
          2000,
          1500
        )
      ).rejects.toThrow();
      expect(repo.upsertNutrientGoalPreference).not.toHaveBeenCalled();
    });

    it("accepts a nutrientKey matching one of the user's custom nutrients", async () => {
      customNutrients.getCustomNutrients.mockResolvedValue([
        { id: 'cn-1', name: 'Added Sugars' },
      ]);
      repo.upsertNutrientGoalPreference.mockResolvedValue({});

      await nutrientGoalPreferenceService.upsertGoalPreference(
        'user-1',
        'Added Sugars',
        'maximum'
      );

      expect(repo.upsertNutrientGoalPreference).toHaveBeenCalledWith(
        'user-1',
        'Added Sugars',
        'maximum',
        null,
        null
      );
    });

    it('rejects a nutrientKey that is neither predefined nor a custom nutrient', async () => {
      customNutrients.getCustomNutrients.mockResolvedValue([
        { id: 'cn-1', name: 'Added Sugars' },
      ]);

      await expect(
        nutrientGoalPreferenceService.upsertGoalPreference(
          'user-1',
          'not_a_real_nutrient',
          'minimum'
        )
      ).rejects.toThrow(/Unknown nutrient key/);
      expect(repo.upsertNutrientGoalPreference).not.toHaveBeenCalled();
    });

    it('does not query custom nutrients when the key is already predefined', async () => {
      repo.upsertNutrientGoalPreference.mockResolvedValue({});

      await nutrientGoalPreferenceService.upsertGoalPreference(
        'user-1',
        'sodium',
        'maximum'
      );

      expect(customNutrients.getCustomNutrients).not.toHaveBeenCalled();
    });
  });

  describe('resetGoalPreference', () => {
    it('deletes the override and returns the built-in default', async () => {
      repo.deleteNutrientGoalPreference.mockResolvedValue(undefined);

      const result = await nutrientGoalPreferenceService.resetGoalPreference(
        'user-1',
        'sodium'
      );

      expect(repo.deleteNutrientGoalPreference).toHaveBeenCalledWith(
        'user-1',
        'sodium'
      );
      expect(result).toEqual({ nutrientKey: 'sodium', goalType: 'maximum' });
    });

    it('returns minimum for a nutrient with no built-in maximum default', async () => {
      repo.deleteNutrientGoalPreference.mockResolvedValue(undefined);

      const result = await nutrientGoalPreferenceService.resetGoalPreference(
        'user-1',
        'protein'
      );

      expect(result).toEqual({ nutrientKey: 'protein', goalType: 'minimum' });
    });
  });

  describe('renameGoalPreferenceKey', () => {
    it('delegates to the repository when the key actually changes', async () => {
      await nutrientGoalPreferenceService.renameGoalPreferenceKey(
        'user-1',
        'Sugar',
        'Added Sugars'
      );

      expect(repo.renameNutrientGoalPreferenceKey).toHaveBeenCalledWith(
        'user-1',
        'Sugar',
        'Added Sugars'
      );
    });

    it('is a no-op when the old and new keys are identical', async () => {
      await nutrientGoalPreferenceService.renameGoalPreferenceKey(
        'user-1',
        'Sugar',
        'Sugar'
      );

      expect(repo.renameNutrientGoalPreferenceKey).not.toHaveBeenCalled();
    });
  });
});
