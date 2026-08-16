import { describe, expect, it } from 'vitest';
import {
  BarcodeResponseSchema,
  FoodVariantSchema,
  PaginationSchema,
  SearchResponseSchema,
} from '../schemas/foodSchemas.js';

const validVariant = {
  serving_size: 100,
  serving_unit: 'g',
  serving_description: '100 g',
  calories: 50,
  protein: 1,
  carbs: 10,
  fat: 0,
  is_default: true,
};

const packageVariant = {
  ...validVariant,
  serving_size: 1,
  serving_unit: 'package',
  serving_description: '1 package (200 g)',
  calories: 100,
  is_default: false,
};

const metricPackageVariant = {
  ...packageVariant,
  serving_size: 200,
  serving_unit: 'g',
  serving_description: '200 g',
};

const validFood = {
  name: 'Yam',
  brand: null,
  is_custom: false,
  default_variant: validVariant,
  variants: [validVariant, packageVariant, metricPackageVariant],
};

describe('FoodVariantSchema', () => {
  it('accepts an explicitly null provider serving description', () => {
    const result = FoodVariantSchema.safeParse({
      ...validVariant,
      serving_description: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.serving_description).toBeUndefined();
    }
  });
});

describe('PaginationSchema', () => {
  it('accepts numeric pagination fields and keeps them as numbers', () => {
    const result = PaginationSchema.safeParse({
      page: 1,
      pageSize: 20,
      totalCount: 42,
      hasMore: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.totalCount).toBe(42);
    }
  });

  it('coerces string-typed numeric pagination fields to numbers', () => {
    // Open Food Facts' legacy cgi/search.pl endpoint returns page (and at times
    // page_size/count) as strings, which previously threw a ZodError and
    // surfaced as a 500 "Internal response validation failed".
    const result = PaginationSchema.safeParse({
      page: '1',
      pageSize: '20',
      totalCount: '42',
      hasMore: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.totalCount).toBe(42);
      expect(typeof result.data.page).toBe('number');
      expect(typeof result.data.pageSize).toBe('number');
      expect(typeof result.data.totalCount).toBe('number');
    }
  });

  it('rejects a non-integer float string like "1.5" in pagination fields', () => {
    const result = PaginationSchema.safeParse({
      page: '1.5',
      pageSize: 20,
      totalCount: 42,
      hasMore: false,
    });
    expect(result.success).toBe(false);
  });

  it('still rejects a non-boolean hasMore', () => {
    const result = PaginationSchema.safeParse({
      page: 1,
      pageSize: 20,
      totalCount: 42,
      hasMore: 'true',
    });
    expect(result.success).toBe(false);
  });
});

describe('SearchResponseSchema', () => {
  it('validates a search response whose pagination fields arrive as strings', () => {
    const result = SearchResponseSchema.safeParse({
      foods: [validFood],
      pagination: {
        page: '1',
        pageSize: '20',
        totalCount: '1',
        hasMore: false,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pagination.page).toBe(1);
      expect(result.data.pagination.totalCount).toBe(1);
      expect(
        result.data.foods[0]?.variants?.map(
          (variant) => variant.serving_description
        )
      ).toEqual(['100 g', '1 package (200 g)', '200 g']);
    }
  });

  // Regression: the schema once lacked image keys, so z.object() stripped the
  // provider photo out of every search response. That left provider results
  // with no thumbnail and gave the import path no URL to localize.
  it('preserves the provider image URL on a search result', () => {
    const result = SearchResponseSchema.parse({
      foods: [
        {
          ...validFood,
          image_url: 'https://images.openfoodfacts.org/front_en.879.400.jpg',
          image_source_url:
            'https://images.openfoodfacts.org/front_en.879.full.jpg',
        },
      ],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    expect(result.foods[0]?.image_url).toBe(
      'https://images.openfoodfacts.org/front_en.879.400.jpg'
    );
    expect(result.foods[0]?.image_source_url).toBe(
      'https://images.openfoodfacts.org/front_en.879.full.jpg'
    );
  });

  it('preserves a stored images array on a local food', () => {
    const result = SearchResponseSchema.parse({
      foods: [{ ...validFood, images: ['/uploads/foods/abc/1.jpg'] }],
      pagination: { page: 1, pageSize: 20, totalCount: 1, hasMore: false },
    });

    expect(result.foods[0]?.images).toEqual(['/uploads/foods/abc/1.jpg']);
  });
});

describe('BarcodeResponseSchema', () => {
  it('preserves all serving variants and their gram descriptions', () => {
    const result = BarcodeResponseSchema.parse({
      source: 'yazio',
      food: validFood,
    });

    expect(result.food?.variants).toHaveLength(3);
    expect(
      result.food?.variants?.map((variant) => variant.serving_description)
    ).toEqual(['100 g', '1 package (200 g)', '200 g']);
  });
});
