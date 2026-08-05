import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { medicationsSchema, medicationEntriesSchema } from '@workspace/shared';

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
