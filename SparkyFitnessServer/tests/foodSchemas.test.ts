import { describe, expect, it } from 'vitest';
import {
  PaginationSchema,
  SearchResponseSchema,
} from '../schemas/foodSchemas.js';

const validVariant = {
  serving_size: 100,
  serving_unit: 'g',
  calories: 50,
  protein: 1,
  carbs: 10,
  fat: 0,
  is_default: true,
};

const validFood = {
  name: 'Yam',
  brand: null,
  is_custom: false,
  default_variant: validVariant,
};

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
    }
  });
});
