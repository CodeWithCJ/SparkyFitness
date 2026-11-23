import { waterCreditMl } from '../../src/utils/waterCredit';
import type { WaterContainer } from '../../src/types/measurements';

const container = (overrides: Partial<WaterContainer>): WaterContainer => ({
  id: 1,
  name: 'Glass',
  volume: 500,
  unit: 'ml',
  is_primary: false,
  servings_per_container: 2,
  ...overrides,
});

describe('waterCreditMl (the amount one press counts, as the server works it out)', () => {
  it('is the volume per serving for a plain container', () => {
    expect(waterCreditMl(container({}))).toBe(250);
    expect(waterCreditMl(container({ servings_per_container: 0 }))).toBe(500);
  });

  it("uses a linked container's own volume as the override, times the hydration factor", () => {
    expect(
      waterCreditMl(
        container({ linked_food_id: 'f1', hydration_factor: 0.8, volume: 400 })
      )
    ).toBeCloseTo(160); // 400 / 2 * 0.8
  });

  it("uses the linked food's water for the amount one press logs", () => {
    expect(
      waterCreditMl(
        container({
          linked_food_id: 'f1',
          volume: 0,
          hydration_factor: 0.5,
          linked_quantity: 2,
          linked_variant_water_ml: 22,
          linked_variant_serving_size: 250,
        })
      )
    ).toBeCloseTo(0.5 * ((22 * 2) / 250)); // not the whole serving's water
  });

  it('reads the amount as a volume for a food served in millilitres', () => {
    expect(
      waterCreditMl(
        container({
          linked_food_id: 'f1',
          volume: 0,
          linked_quantity: 250,
          linked_variant_serving_unit: 'ml',
        })
      )
    ).toBe(250);
  });

  it('counts nothing when the linked food gives no amount', () => {
    expect(waterCreditMl(container({ linked_food_id: 'f1', volume: 0 }))).toBe(
      0
    );
  });
});
