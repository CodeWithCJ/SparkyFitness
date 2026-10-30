import { z } from 'zod';

export const oauthClientResourceIdSchema = z.string().uuid();

export const oauthClientResourceSchema = z
  .object({
    id: oauthClientResourceIdSchema,
    client_id: z.string(),
    resource_id: z.string(),
    metadata: z.json().nullable(),
    created_at: z.date().nullable(),
  })
  .strict();

export const oauthClientResourceInitializerSchema = z
  .object({
    id: oauthClientResourceIdSchema.optional(),
    client_id: z.string(),
    resource_id: z.string(),
    metadata: z.json().nullable().optional(),
    created_at: z.date().nullable().optional(),
  })
  .strict();

export const oauthClientResourceMutatorSchema =
  oauthClientResourceInitializerSchema.partial();

export type OauthClientResource = z.infer<typeof oauthClientResourceSchema>;
export type OauthClientResourceInitializer = z.infer<
  typeof oauthClientResourceInitializerSchema
>;
export type OauthClientResourceMutator = z.infer<
  typeof oauthClientResourceMutatorSchema
>;
