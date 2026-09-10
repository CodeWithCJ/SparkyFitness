import { describe, expect, it } from 'vitest';
import {
  userWaterContainersInitializerSchema,
  userWaterContainersMutatorSchema,
  createWaterContainerBodySchema,
  updateWaterContainerBodySchema,
} from '@workspace/shared';
import {
  CreateWaterContainerBodySchema,
  UpdateWaterContainerBodySchema,
} from '../schemas/waterContainerSchemas.js';

describe('WaterContainerFoodLink Schemas (#2115)', () => {
  const validDbRow = {
    user_id: 'user-1',
    name: 'Coffee Mug',
    volume: 350,
    unit: 'ml' as const,
    is_primary: false,
    servings_per_container: 1,
    created_at: new Date(),
    updated_at: new Date(),
    hydration_factor: 0.9,
    linked_food_id: '11111111-2222-3333-4444-555555555555',
    linked_variant_id: '66666666-7777-8888-9999-000000000000',
    linked_meal_type_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  };

  describe('Database Zod Schemas', () => {
    it('accepts full container row with food links and hydration factor', () => {
      const parsed = userWaterContainersInitializerSchema.safeParse(validDbRow);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.hydration_factor).toBe(0.9);
        expect(parsed.data.linked_food_id).toBe(
          '11111111-2222-3333-4444-555555555555'
        );
      }
    });

    it('accepts nullable link fields and default hydration factor', () => {
      const unlinked = {
        ...validDbRow,
        hydration_factor: 1.0,
        linked_food_id: null,
        linked_variant_id: null,
        linked_meal_type_id: null,
      };
      const parsed = userWaterContainersInitializerSchema.safeParse(unlinked);
      expect(parsed.success).toBe(true);
    });

    it('validates initializer schema with optional link fields', () => {
      const init = {
        user_id: 'user-1',
        name: 'Tea Cup',
        volume: 200,
        unit: 'ml' as const,
        hydration_factor: 0.85,
        linked_food_id: '11111111-2222-3333-4444-555555555555',
      };
      const parsed = userWaterContainersInitializerSchema.safeParse(init);
      expect(parsed.success).toBe(true);
    });

    it('validates mutator schema with link fields', () => {
      const update = {
        hydration_factor: 0.95,
        linked_food_id: null,
      };
      const parsed = userWaterContainersMutatorSchema.safeParse(update);
      expect(parsed.success).toBe(true);
    });
  });

  describe('API and Route Schemas', () => {
    it('accepts create request with valid hydration_factor and food links', () => {
      const body = {
        name: 'Latte Cup',
        volume: 300,
        unit: 'ml' as const,
        servings_per_container: 1,
        hydration_factor: 0.8,
        linked_food_id: '11111111-2222-3333-4444-555555555555',
        linked_variant_id: '66666666-7777-8888-9999-000000000000',
        linked_meal_type_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      };
      expect(createWaterContainerBodySchema.safeParse(body).success).toBe(true);
      expect(CreateWaterContainerBodySchema.safeParse(body).success).toBe(true);
    });

    it('rejects hydration_factor out of range (min: 0, max: 2)', () => {
      const negative = {
        name: 'Latte Cup',
        volume: 300,
        unit: 'ml' as const,
        hydration_factor: -0.1,
      };
      expect(createWaterContainerBodySchema.safeParse(negative).success).toBe(
        false
      );
      expect(CreateWaterContainerBodySchema.safeParse(negative).success).toBe(
        false
      );

      const tooHigh = {
        name: 'Latte Cup',
        volume: 300,
        unit: 'ml' as const,
        hydration_factor: 2.5,
      };
      expect(createWaterContainerBodySchema.safeParse(tooHigh).success).toBe(
        false
      );
      expect(CreateWaterContainerBodySchema.safeParse(tooHigh).success).toBe(
        false
      );
    });

    it('accepts update request unlinking food via null', () => {
      const updateBody = {
        hydration_factor: 1.0,
        linked_food_id: null,
        linked_variant_id: null,
        linked_meal_type_id: null,
      };
      expect(updateWaterContainerBodySchema.safeParse(updateBody).success).toBe(
        true
      );
      expect(UpdateWaterContainerBodySchema.safeParse(updateBody).success).toBe(
        true
      );
    });
  });
});
