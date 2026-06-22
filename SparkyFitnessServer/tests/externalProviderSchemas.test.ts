import { describe, expect, it } from 'vitest';
import {
  CreateGlobalExternalDataProviderBodySchema,
  UpdateGlobalExternalDataProviderBodySchema,
} from '../schemas/externalProviderSchemas.js';

describe('CreateGlobalExternalDataProviderBodySchema', () => {
  it('accepts a valid payload and trims string fields', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: '  OpenFoodFacts  ',
      provider_type: '  openfoodfacts  ',
      app_id: 'abc',
      base_url: 'https://example.com',
      is_active: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.provider_name).toBe('OpenFoodFacts');
      expect(result.data.provider_type).toBe('openfoodfacts');
      expect(result.data.is_active).toBe(true);
    }
  });

  it('rejects a missing provider_name', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_type: 'openfoodfacts',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.provider_name).toBeDefined();
    }
  });

  it('rejects an empty/whitespace provider_type', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: 'Test',
      provider_type: '   ',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.provider_type).toBeDefined();
    }
  });

  it('rejects a non-boolean is_active', () => {
    const result = CreateGlobalExternalDataProviderBodySchema.safeParse({
      provider_name: 'Test',
      provider_type: 'openfoodfacts',
      is_active: 'yes',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateGlobalExternalDataProviderBodySchema', () => {
  it('accepts a partial payload (all fields optional)', () => {
    const result = UpdateGlobalExternalDataProviderBodySchema.safeParse({
      is_active: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty provider_type when it is provided', () => {
    const result = UpdateGlobalExternalDataProviderBodySchema.safeParse({
      provider_type: '',
    });
    expect(result.success).toBe(false);
  });
});
