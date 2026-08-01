import { describe, expect, it } from 'vitest';
import {
  UpsertCheckInBodySchema,
  UpdateCheckInBodySchema,
} from '../schemas/measurementSchemas.js';

// The check-in body schemas are .loose(), so an undeclared field still reaches
// the repository — it just skips coercion on the way. That is how the
// smart-scale columns originally shipped: writes worked, but a bad value
// surfaced as a 500 from the numeric(5,2) column instead of a 400 from the
// route. These assert the three are declared and coerced like their siblings.
const SMART_SCALE_FIELDS = [
  'muscle_mass_kg',
  'bone_mass_kg',
  'body_water_percentage',
] as const;

describe('check-in body schemas cover smart-scale composition', () => {
  it.each(SMART_SCALE_FIELDS)('accepts a numeric %s on upsert', (field) => {
    const result = UpsertCheckInBodySchema.safeParse({
      entry_date: '2026-07-31',
      [field]: 34.2,
    });

    expect(result.success).toBe(true);
    expect(result.data?.[field]).toBe(34.2);
  });

  it.each(SMART_SCALE_FIELDS)(
    'coerces a numeric string %s rather than passing it through raw',
    (field) => {
      const result = UpsertCheckInBodySchema.safeParse({
        entry_date: '2026-07-31',
        [field]: '34.2',
      });

      expect(result.success).toBe(true);
      expect(result.data?.[field]).toBe(34.2);
    }
  );

  it.each(SMART_SCALE_FIELDS)(
    'rejects a non-numeric %s at the route boundary',
    (field) => {
      const result = UpsertCheckInBodySchema.safeParse({
        entry_date: '2026-07-31',
        [field]: 'abc',
      });

      expect(result.success).toBe(false);
    }
  );

  it.each(SMART_SCALE_FIELDS)(
    'allows null for %s so a recorded value can be cleared',
    (field) => {
      const result = UpsertCheckInBodySchema.safeParse({
        entry_date: '2026-07-31',
        [field]: null,
      });

      expect(result.success).toBe(true);
      expect(result.data?.[field]).toBeNull();
    }
  );

  it.each(SMART_SCALE_FIELDS)(
    'declares %s on the update schema too',
    (field) => {
      const result = UpdateCheckInBodySchema.safeParse({ [field]: 'abc' });

      expect(result.success).toBe(false);
    }
  );

  // Coercion alone let a direct API call store a negative mass or a body-water
  // percentage above 100 in the numeric(5,2) column. The other two write paths
  // already bound these, so the route has to as well.
  it.each(SMART_SCALE_FIELDS)('rejects a negative %s', (field) => {
    const result = UpsertCheckInBodySchema.safeParse({
      entry_date: '2026-07-31',
      [field]: -1,
    });

    expect(result.success).toBe(false);
  });

  it.each([
    ['muscle_mass_kg', 1000],
    ['bone_mass_kg', 1000],
    ['body_water_percentage', 101],
  ] as const)('rejects an out-of-range %s of %s', (field, value) => {
    expect(
      UpsertCheckInBodySchema.safeParse({
        entry_date: '2026-07-31',
        [field]: value,
      }).success
    ).toBe(false);
    expect(UpdateCheckInBodySchema.safeParse({ [field]: value }).success).toBe(
      false
    );
  });

  it('still accepts the boundary values', () => {
    const result = UpsertCheckInBodySchema.safeParse({
      entry_date: '2026-07-31',
      muscle_mass_kg: 999.99,
      bone_mass_kg: 0,
      body_water_percentage: 100,
    });

    expect(result.success).toBe(true);
  });
});
