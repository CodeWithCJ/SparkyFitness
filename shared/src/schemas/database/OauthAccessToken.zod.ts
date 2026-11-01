import { z } from 'zod';

export const oauthAccessTokenIdSchema = z.string().uuid();

export const oauthAccessTokenSchema = z
  .object({
    id: oauthAccessTokenIdSchema,
    token: z.string(),
    client_id: z.string(),
    session_id: z.string().uuid().nullable(),
    user_id: z.string().uuid().nullable(),
    reference_id: z.string().nullable(),
    authorization_code_id: z.string().nullable(),
    resources: z.string().nullable(),
    requested_user_info_claims: z.string().nullable(),
    refresh_id: z.string().uuid().nullable(),
    expires_at: z.date(),
    created_at: z.date(),
    revoked: z.date().nullable(),
    confirmation: z.json().nullable(),
    scopes: z.string(),
  })
  .strict();

export const oauthAccessTokenInitializerSchema = z
  .object({
    id: oauthAccessTokenIdSchema.optional(),
    token: z.string(),
    client_id: z.string(),
    session_id: z.string().uuid().nullable().optional(),
    user_id: z.string().uuid().nullable().optional(),
    reference_id: z.string().nullable().optional(),
    authorization_code_id: z.string().nullable().optional(),
    resources: z.string().nullable().optional(),
    requested_user_info_claims: z.string().nullable().optional(),
    refresh_id: z.string().uuid().nullable().optional(),
    expires_at: z.date(),
    created_at: z.date().optional(),
    revoked: z.date().nullable().optional(),
    confirmation: z.json().nullable().optional(),
    scopes: z.string(),
  })
  .strict();

export const oauthAccessTokenMutatorSchema =
  oauthAccessTokenInitializerSchema.partial();

export type OauthAccessToken = z.infer<typeof oauthAccessTokenSchema>;
export type OauthAccessTokenInitializer = z.infer<
  typeof oauthAccessTokenInitializerSchema
>;
export type OauthAccessTokenMutator = z.infer<
  typeof oauthAccessTokenMutatorSchema
>;
