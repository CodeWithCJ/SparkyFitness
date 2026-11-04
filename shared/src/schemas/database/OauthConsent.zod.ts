import { z } from 'zod';

export const oauthConsentIdSchema = z.string().uuid();

export const oauthConsentSchema = z
  .object({
    id: oauthConsentIdSchema,
    client_id: z.string(),
    user_id: z.string().uuid().nullable(),
    reference_id: z.string().nullable(),
    resources: z.string().nullable(),
    requested_user_info_claims: z.string().nullable(),
    scopes: z.string(),
    created_at: z.date(),
    updated_at: z.date(),
  })
  .strict();

export const oauthConsentInitializerSchema = z
  .object({
    id: oauthConsentIdSchema.optional(),
    client_id: z.string(),
    user_id: z.string().uuid().nullable().optional(),
    reference_id: z.string().nullable().optional(),
    resources: z.string().nullable().optional(),
    requested_user_info_claims: z.string().nullable().optional(),
    scopes: z.string(),
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
  })
  .strict();

export const oauthConsentMutatorSchema =
  oauthConsentInitializerSchema.partial();

export type OauthConsent = z.infer<typeof oauthConsentSchema>;
export type OauthConsentInitializer = z.infer<
  typeof oauthConsentInitializerSchema
>;
export type OauthConsentMutator = z.infer<typeof oauthConsentMutatorSchema>;
