import { describe, it, expect } from 'vitest';
import {
  FOOD_PROVIDER_TYPES,
  getFoodProviderMetadata,
} from '@workspace/shared';
import {
  FOOD_PROVIDER_ADAPTERS,
  getFoodProviderAdapter,
} from '../integrations/foodProviders/registry.js';

describe('foodProviderRegistry', () => {
  it('has an adapter registered for every FOOD_PROVIDER_TYPES entry', () => {
    for (const type of FOOD_PROVIDER_TYPES) {
      const adapter = FOOD_PROVIDER_ADAPTERS[type];
      expect(
        adapter,
        `Adapter missing for provider type: ${type}`
      ).toBeDefined();
      expect(typeof adapter.search).toBe('function');
      expect(typeof adapter.getDetails).toBe('function');
    }
  });

  it('has complete metadata for every FOOD_PROVIDER_TYPES entry', () => {
    for (const type of FOOD_PROVIDER_TYPES) {
      const meta = getFoodProviderMetadata(type);
      expect(meta, `Metadata missing for provider type: ${type}`).toBeDefined();
      expect(meta!.id).toBe(type);
      expect(typeof meta!.displayName).toBe('string');
      expect(typeof meta!.shortName).toBe('string');
      expect(meta!.credentials).toBeDefined();
      expect([
        'none',
        'api_key',
        'app_id_and_key',
        'base_url_and_key',
        'custom',
      ]).toContain(meta!.credentials);
    }
  });

  it('getFoodProviderAdapter returns adapter for known types and undefined for unknown', () => {
    expect(getFoodProviderAdapter('openfoodfacts')).toBeDefined();
    expect(getFoodProviderAdapter('unknown_xyz' as any)).toBeUndefined();
    expect(getFoodProviderAdapter(null)).toBeUndefined();
    expect(getFoodProviderAdapter(undefined)).toBeUndefined();
  });
});
