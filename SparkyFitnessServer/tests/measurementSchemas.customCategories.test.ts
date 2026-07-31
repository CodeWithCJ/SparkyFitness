import { describe, expect, it } from 'vitest';
import {
  CreateCustomCategoryBodySchema,
  UpdateCustomCategoryBodySchema,
} from '../schemas/measurementSchemas.js';

describe('CreateCustomCategoryBodySchema', () => {
  const base = {
    name: 'Weight',
    frequency: 'Daily',
    measurement_type: 'kg',
  };

  it('accepts a plain create with no visibility/order fields', () => {
    const result = CreateCustomCategoryBodySchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_visible).toBeUndefined();
      expect(result.data.sort_order).toBeUndefined();
    }
  });

  it('preserves an explicit is_visible=false (no truthy-coalescing bug)', () => {
    const result = CreateCustomCategoryBodySchema.safeParse({
      ...base,
      is_visible: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_visible).toBe(false);
    }
  });

  it('preserves an explicit sort_order=0 (no truthy-coalescing bug)', () => {
    const result = CreateCustomCategoryBodySchema.safeParse({
      ...base,
      sort_order: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sort_order).toBe(0);
    }
  });

  it('coerces a numeric string sort_order and rejects fractions, negatives, and NaN', () => {
    const ok = CreateCustomCategoryBodySchema.safeParse({
      ...base,
      sort_order: '40',
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.sort_order).toBe(40);
    }

    expect(
      CreateCustomCategoryBodySchema.safeParse({ ...base, sort_order: 4.5 })
        .success
    ).toBe(false);
    expect(
      CreateCustomCategoryBodySchema.safeParse({ ...base, sort_order: -1 })
        .success
    ).toBe(false);
    expect(
      CreateCustomCategoryBodySchema.safeParse({ ...base, sort_order: 1000001 })
        .success
    ).toBe(false);
    expect(
      CreateCustomCategoryBodySchema.safeParse({ ...base, sort_order: 'abc' })
        .success
    ).toBe(false);
  });

  it('coerces empty-string is_visible to undefined (treated as default)', () => {
    const result = CreateCustomCategoryBodySchema.safeParse({
      ...base,
      is_visible: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_visible).toBeUndefined();
    }
  });

  it('rejects a non-boolean is_visible', () => {
    expect(
      CreateCustomCategoryBodySchema.safeParse({
        ...base,
        is_visible: 'yes',
      }).success
    ).toBe(false);
  });
});

describe('UpdateCustomCategoryBodySchema', () => {
  it('preserves explicit is_visible=false and sort_order=0 for partial updates', () => {
    const result = UpdateCustomCategoryBodySchema.safeParse({
      is_visible: false,
      sort_order: 0,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_visible).toBe(false);
      expect(result.data.sort_order).toBe(0);
    }
  });

  it('rejects fractional or negative sort_order', () => {
    expect(
      UpdateCustomCategoryBodySchema.safeParse({ sort_order: 1.5 }).success
    ).toBe(false);
    expect(
      UpdateCustomCategoryBodySchema.safeParse({ sort_order: -2 }).success
    ).toBe(false);
  });
});
