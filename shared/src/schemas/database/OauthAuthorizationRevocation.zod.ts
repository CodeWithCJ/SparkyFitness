import { z } from 'zod';

export const oauthAuthorizationRevocationSchema = z
  .object({
    user_id: z.string().uuid(),
    client_id: z.string(),
    revoked_at: z.date(),
  })
  .strict();

export const oauthAuthorizationRevocationInitializerSchema = z
  .object({
    user_id: z.string().uuid(),
    client_id: z.string(),
    revoked_at: z.date().optional(),
  })
  .strict();

export const oauthAuthorizationRevocationMutatorSchema =
  oauthAuthorizationRevocationInitializerSchema.partial();

export type OauthAuthorizationRevocation = z.infer<
  typeof oauthAuthorizationRevocationSchema
>;
export type OauthAuthorizationRevocationInitializer = z.infer<
  typeof oauthAuthorizationRevocationInitializerSchema
>;
export type OauthAuthorizationRevocationMutator = z.infer<
  typeof oauthAuthorizationRevocationMutatorSchema
>;
