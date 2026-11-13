import { z } from 'zod';

export const oauthClientAssertionIdSchema = z.string();

export const oauthClientAssertionSchema = z
  .object({
    id: oauthClientAssertionIdSchema,
    expires_at: z.date(),
  })
  .strict();

export const oauthClientAssertionInitializerSchema = z
  .object({
    id: oauthClientAssertionIdSchema,
    expires_at: z.date(),
  })
  .strict();

export const oauthClientAssertionMutatorSchema =
  oauthClientAssertionInitializerSchema.partial();

export type OauthClientAssertion = z.infer<typeof oauthClientAssertionSchema>;
export type OauthClientAssertionInitializer = z.infer<
  typeof oauthClientAssertionInitializerSchema
>;
export type OauthClientAssertionMutator = z.infer<
  typeof oauthClientAssertionMutatorSchema
>;
