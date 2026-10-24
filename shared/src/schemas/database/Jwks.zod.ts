import { z } from 'zod';

export const jwksIdSchema = z.string().uuid();

export const jwksSchema = z
  .object({
    id: jwksIdSchema,
    public_key: z.string(),
    private_key: z.string(),
    created_at: z.date(),
    expires_at: z.date().nullable(),
    alg: z.string().nullable(),
    crv: z.string().nullable(),
  })
  .strict();

export const jwksInitializerSchema = z
  .object({
    id: jwksIdSchema.optional(),
    public_key: z.string(),
    private_key: z.string(),
    created_at: z.date().optional(),
    expires_at: z.date().nullable().optional(),
    alg: z.string().nullable().optional(),
    crv: z.string().nullable().optional(),
  })
  .strict();

export const jwksMutatorSchema = jwksInitializerSchema.partial();

export type Jwks = z.infer<typeof jwksSchema>;
export type JwksInitializer = z.infer<typeof jwksInitializerSchema>;
export type JwksMutator = z.infer<typeof jwksMutatorSchema>;
