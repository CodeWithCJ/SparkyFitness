import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { medicationsSchema, medicationEntriesSchema } from '@workspace/shared';
import { CreateMedicationBodySchema } from '../schemas/medicationSchemas.js';

// These schemas previously used z.string().and(z.object({ __brand })), an
// intersection of a primitive and an object, which no value can satisfy. Every
// parse failed. Nothing exercised them at runtime so it went unnoticed.
describe('medication database schemas parse real rows', () => {
  const base = {
    user_id: uuidv4(),
    created_at: new Date(),
    updated_at: new Date(),
  };

  it('parses a medication row', () => {
    const result = medicationsSchema.safeParse({
      ...base,
      id: uuidv4(),
      name: 'Vitamin D',
      display_name: null,
      type_id: 'capsule',
      route_id: null,
      strength_value: null,
      strength_unit: null,
      dose_amount: 1,
      dose_unit: 'dose',
      rxnorm_rxcui: null,
      ndc: null,
      prescriber: null,
      pharmacy: null,
      rx_number: null,
      reason_text: null,
      effectiveness_rating: null,
      color: null,
      icon: null,
      photo_path: null,
      is_active: true,
      is_quick: false,
      is_glp1: false,
      is_supplement: true,
      nutrients: { custom_nutrients: { 'Vitamin D': 25 } },
      notes: null,
      source: 'manual',
      custom_fields: {},
    });
    expect(result.success).toBe(true);
  });

  it('parses a medication entry row', () => {
    const result = medicationEntriesSchema.safeParse({
      ...base,
      id: uuidv4(),
      medication_id: uuidv4(),
      schedule_id: null,
      status: 'taken',
      taken_at: new Date(),
      scheduled_for: null,
      entry_date: new Date(),
      med_name_snapshot: 'Vitamin D',
      dose_amount_snapshot: 1,
      dose_unit_snapshot: 'dose',
      nutrients_snapshot: { custom_nutrients: { 'Vitamin D': 25 } },
      notes: null,
      source: 'manual',
      custom_fields: {},
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-uuid user_id', () => {
    const result = medicationsSchema.safeParse({ ...base, user_id: 42 });
    expect(result.success).toBe(false);
  });
});

// The micronutrient catalog offers Caffeine against fixedField `caffeine_mg`,
// and the caffeine-kinetics dose query already reads
// nutrients_snapshot->>'caffeine_mg' off a taken supplement. But the create
// body's nutrients object is .strict() and never listed the three columns this
// feature added, so picking Caffeine on a supplement produced a 400 and the
// supplement arm of that query could never have had a single row to read.
describe('supplement nutrients accept the columns food variants carry', () => {
  it.each(['caffeine_mg', 'water_ml', 'alcohol_g'])(
    'accepts %s on a supplement',
    (field) => {
      const result = CreateMedicationBodySchema.safeParse({
        name: 'Pre-Workout',
        dose_amount: 1,
        is_supplement: true,
        nutrients: { [field]: 150 },
      });

      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    }
  );

  it('still rejects a nutrient key that is not a real column', () => {
    const result = CreateMedicationBodySchema.safeParse({
      name: 'Pre-Workout',
      dose_amount: 1,
      is_supplement: true,
      nutrients: { caffeine: 150 },
    });

    expect(result.success).toBe(false);
  });
});
