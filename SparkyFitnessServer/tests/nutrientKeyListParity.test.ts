import { describe, expect, it } from 'vitest';
import {
  FOOD_VARIANT_NUTRIENT_FIELDS,
  NON_GOAL_NUTRIENT_KEYS,
} from '@workspace/shared';
import { PREDEFINED_NUTRIENT_KEYS } from '../services/nutrientGoalPreferenceService.js';

describe('nutrientKeyListParity', () => {
  it('PREDEFINED_NUTRIENT_KEYS in nutrientGoalPreferenceService matches FOOD_VARIANT_NUTRIENT_FIELDS without non-goal nutrients', () => {
    const expected = new Set(
      FOOD_VARIANT_NUTRIENT_FIELDS.filter(
        (key) => !(NON_GOAL_NUTRIENT_KEYS as readonly string[]).includes(key)
      )
    );
    const actual = new Set(PREDEFINED_NUTRIENT_KEYS);

    expect(actual).toEqual(expected);
  });

  it('PREDEFINED_NUTRIENT_KEYS does not contain water_ml', () => {
    expect(PREDEFINED_NUTRIENT_KEYS).not.toContain('water_ml');
  });

  it('PREDEFINED_NUTRIENT_KEYS contains caffeine_mg and alcohol_g', () => {
    expect(PREDEFINED_NUTRIENT_KEYS).toContain('caffeine_mg');
    expect(PREDEFINED_NUTRIENT_KEYS).toContain('alcohol_g');
  });
});
