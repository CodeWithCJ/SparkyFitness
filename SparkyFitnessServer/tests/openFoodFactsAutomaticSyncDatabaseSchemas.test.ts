import { describe, expect, it } from 'vitest';
import * as sharedSchemas from '@workspace/shared';
import {
  externalDataProvidersInitializerSchema,
  globalSettingsInitializerSchema,
  openfoodfactsSyncQueueInitializerSchema,
  userPreferencesInitializerSchema,
} from '@workspace/shared';

describe('Open Food Facts automatic sync database schemas', () => {
  it('mirrors the system-only shared product-read reservation row', () => {
    const schema = (
      sharedSchemas as typeof sharedSchemas & {
        openfoodfactsProductReadRateLimitInitializerSchema?: {
          parse: (input: unknown) => unknown;
        };
      }
    ).openfoodfactsProductReadRateLimitInitializerSchema;

    expect(
      schema?.parse({
        id: 1,
        next_product_read_at: new Date('2026-09-04T09:00:00.000Z'),
        reservation_token: '00000000-0000-4000-8000-000000000003',
        reservation_expires_at: new Date('2026-09-04T09:01:00.000Z'),
      })
    ).toEqual({
      id: 1,
      next_product_read_at: new Date('2026-09-04T09:00:00.000Z'),
      reservation_token: '00000000-0000-4000-8000-000000000003',
      reservation_expires_at: new Date('2026-09-04T09:01:00.000Z'),
    });
  });

  it('keeps the server-wide consent flag on global settings', () => {
    expect(
      globalSettingsInitializerSchema.parse({
        allow_openfoodfacts_contributions: true,
      })
    ).toEqual({ allow_openfoodfacts_contributions: true });
  });

  it('keeps owner consent, explicit product language, and internal backfill state on user preferences', () => {
    expect(
      userPreferencesInitializerSchema.parse({
        user_id: 'user-1',
        auto_contribute_openfoodfacts: true,
        openfoodfacts_product_language: 'de',
        openfoodfacts_backfill_pending: true,
      })
    ).toMatchObject({
      user_id: 'user-1',
      auto_contribute_openfoodfacts: true,
      openfoodfacts_product_language: 'de',
      openfoodfacts_backfill_pending: true,
    });

    expect(
      userPreferencesInitializerSchema.safeParse({
        user_id: 'user-1',
        openfoodfacts_product_language: 'de-DE',
      }).success
    ).toBe(false);
  });

  it('keeps upload consent out of credential-provider records', () => {
    const parsed = externalDataProvidersInitializerSchema.parse({
      user_id: 'user-1',
      provider_name: 'Open Food Facts',
      provider_type: 'openfoodfacts',
      allow_openfoodfacts_contributions: true,
      auto_contribute_openfoodfacts: true,
    });

    expect(parsed).not.toHaveProperty('allow_openfoodfacts_contributions');
    expect(parsed).not.toHaveProperty('auto_contribute_openfoodfacts');
  });

  it.each(['failed', 'succeeded'] as const)(
    'accepts retained %s queue state with a publication timestamp',
    (status) => {
      const publishedAt = new Date('2026-09-04T08:00:00.000Z');
      expect(
        openfoodfactsSyncQueueInitializerSchema.parse({
          food_id: 'food-1',
          user_id: 'user-1',
          status,
          last_succeeded_at: publishedAt,
        })
      ).toMatchObject({ status, last_succeeded_at: publishedAt });
    }
  );
});
