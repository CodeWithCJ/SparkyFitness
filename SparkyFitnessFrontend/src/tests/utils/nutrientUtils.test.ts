import { getNutrientMetadata } from '@/utils/nutrientUtils';
import { CENTRAL_NUTRIENT_CONFIG } from '@/constants/nutrients';

// Phase 3 (#1557): the water-content input on the food form
// (NutrientFormGrid.tsx) and every read-only nutrient grid are entirely
// data-driven off CENTRAL_NUTRIENT_CONFIG + getNutrientMetadata — neither
// needed a code change to gain a water field. These tests pin the metadata
// those components actually read, since that's the real mechanism deciding
// whether "water content" ever renders and with what unit.

describe('CENTRAL_NUTRIENT_CONFIG.water_ml', () => {
  it('is registered with an ml unit', () => {
    expect(CENTRAL_NUTRIENT_CONFIG['water_ml']).toBeDefined();
    expect(CENTRAL_NUTRIENT_CONFIG['water_ml']?.unit).toBe('ml');
  });

  it('has no default goal type override (excluded from the generic goal system)', () => {
    // water_ml deliberately never gets a 'maximum'/'minimum' default via
    // BUILTIN_MAXIMUM_GOAL_NUTRIENTS -- user_goals.water_goal_ml is the one
    // water goal, not a per-nutrient goal preference.
    expect(
      CENTRAL_NUTRIENT_CONFIG['water_ml']?.defaultGoalType
    ).toBeUndefined();
  });
});

describe('getNutrientMetadata("water_ml")', () => {
  it('resolves from CENTRAL_NUTRIENT_CONFIG with the ml unit and a minimum-by-default goal type', () => {
    const meta = getNutrientMetadata('water_ml');
    expect(meta.unit).toBe('ml');
    expect(meta.id).toBe('water_ml');
    // No override supplied and no defaultGoalType set -> falls back to
    // 'minimum', same as every nutrient without an explicit "stay under" tag.
    expect(meta.goalType).toBe('minimum');
  });

  it('is unaffected by an unrelated custom-nutrient list', () => {
    const meta = getNutrientMetadata('water_ml', [
      {
        id: 'cn-1',
        user_id: 'user-1',
        name: 'Magnesium',
        unit: 'mg',
        aliases: [],
        created_at: '2026-09-05T00:00:00.000Z',
        updated_at: '2026-09-05T00:00:00.000Z',
      },
    ]);
    expect(meta.unit).toBe('ml');
  });
});
