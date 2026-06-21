import { z } from 'zod/v4';

/**
 * Request-body schemas for the admin global external-data-provider routes.
 *
 * These validate the *shape* of the payload. `provider_type` is additionally
 * validated against the `external_provider_types` lookup table at the route
 * layer (the set of valid types is dynamic — new providers are added via
 * migrations — so it cannot be a static enum here).
 */

const optionalNullableString = z.string().trim().nullish();

export const CreateGlobalExternalDataProviderBodySchema = z.object({
  provider_name: z.string().trim().min(1, 'provider_name is required'),
  provider_type: z.string().trim().min(1, 'provider_type is required'),
  app_id: optionalNullableString,
  app_key: optionalNullableString,
  base_url: optionalNullableString,
  is_active: z.boolean().optional(),
});

export type CreateGlobalExternalDataProviderBody = z.infer<
  typeof CreateGlobalExternalDataProviderBodySchema
>;

export const UpdateGlobalExternalDataProviderBodySchema = z.object({
  provider_name: z
    .string()
    .trim()
    .min(1, 'provider_name cannot be empty')
    .optional(),
  provider_type: z
    .string()
    .trim()
    .min(1, 'provider_type cannot be empty')
    .optional(),
  app_id: optionalNullableString,
  app_key: optionalNullableString,
  base_url: optionalNullableString,
  is_active: z.boolean().optional(),
});

export type UpdateGlobalExternalDataProviderBody = z.infer<
  typeof UpdateGlobalExternalDataProviderBodySchema
>;
