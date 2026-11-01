import { z } from 'zod';

export const oauthResourceIdSchema = z.string().uuid();

export const oauthResourceSchema = z
  .object({
    id: oauthResourceIdSchema,
    identifier: z.string(),
    name: z.string(),
    access_token_ttl: z.number().int().nullable(),
    refresh_token_ttl: z.number().int().nullable(),
    signing_algorithm: z.string().nullable(),
    signing_key_id: z.string().nullable(),
    allowed_scopes: z.string().nullable(),
    custom_claims: z.json().nullable(),
    dpop_bound_access_tokens_required: z.boolean(),
    disabled: z.boolean(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
    policy_version: z.number().int(),
    metadata: z.json().nullable(),
  })
  .strict();

export const oauthResourceInitializerSchema = z
  .object({
    id: oauthResourceIdSchema.optional(),
    identifier: z.string(),
    name: z.string(),
    access_token_ttl: z.number().int().nullable().optional(),
    refresh_token_ttl: z.number().int().nullable().optional(),
    signing_algorithm: z.string().nullable().optional(),
    signing_key_id: z.string().nullable().optional(),
    allowed_scopes: z.string().nullable().optional(),
    custom_claims: z.json().nullable().optional(),
    dpop_bound_access_tokens_required: z.boolean().optional(),
    disabled: z.boolean().optional(),
    created_at: z.date().nullable().optional(),
    updated_at: z.date().nullable().optional(),
    policy_version: z.number().int().optional(),
    metadata: z.json().nullable().optional(),
  })
  .strict();

export const oauthResourceMutatorSchema =
  oauthResourceInitializerSchema.partial();

export type OauthResource = z.infer<typeof oauthResourceSchema>;
export type OauthResourceInitializer = z.infer<
  typeof oauthResourceInitializerSchema
>;
export type OauthResourceMutator = z.infer<typeof oauthResourceMutatorSchema>;
