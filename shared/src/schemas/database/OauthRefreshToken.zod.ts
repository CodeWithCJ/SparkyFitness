import { z } from 'zod';

export const oauthRefreshTokenIdSchema = z.string().uuid();

export const oauthRefreshTokenSchema = z
  .object({
    id: oauthRefreshTokenIdSchema,
    token: z.string(),
    client_id: z.string(),
    session_id: z.string().uuid().nullable(),
    user_id: z.string().uuid(),
    reference_id: z.string().nullable(),
    authorization_code_id: z.string().nullable(),
    resources: z.string().nullable(),
    requested_user_info_claims: z.string().nullable(),
    expires_at: z.date(),
    created_at: z.date(),
    revoked: z.date().nullable(),
    rotated_at: z.date().nullable(),
    rotation_replay_response: z.string().nullable(),
    rotation_replay_expires_at: z.date().nullable(),
    auth_time: z.date().nullable(),
    confirmation: z.json().nullable(),
    scopes: z.string(),
  })
  .strict();

export const oauthRefreshTokenInitializerSchema = z
  .object({
    id: oauthRefreshTokenIdSchema.optional(),
    token: z.string(),
    client_id: z.string(),
    session_id: z.string().uuid().nullable().optional(),
    user_id: z.string().uuid(),
    reference_id: z.string().nullable().optional(),
    authorization_code_id: z.string().nullable().optional(),
    resources: z.string().nullable().optional(),
    requested_user_info_claims: z.string().nullable().optional(),
    expires_at: z.date(),
    created_at: z.date().optional(),
    revoked: z.date().nullable().optional(),
    rotated_at: z.date().nullable().optional(),
    rotation_replay_response: z.string().nullable().optional(),
    rotation_replay_expires_at: z.date().nullable().optional(),
    auth_time: z.date().nullable().optional(),
    confirmation: z.json().nullable().optional(),
    scopes: z.string(),
  })
  .strict();

export const oauthRefreshTokenMutatorSchema =
  oauthRefreshTokenInitializerSchema.partial();

export type OauthRefreshToken = z.infer<typeof oauthRefreshTokenSchema>;
export type OauthRefreshTokenInitializer = z.infer<
  typeof oauthRefreshTokenInitializerSchema
>;
export type OauthRefreshTokenMutator = z.infer<
  typeof oauthRefreshTokenMutatorSchema
>;
