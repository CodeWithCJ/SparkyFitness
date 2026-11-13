import { z } from 'zod';

export const rateLimitIdSchema = z.string().or(z.number());

export const rateLimitSchema = z.object({
  id: z.string(),
  key: z.string(),
  count: z.number(),
  last_request: z.number(),
});

export const rateLimitInitializerSchema = z.object({
  id: z.string(),
  key: z.string(),
  count: z.number(),
  last_request: z.number(),
});

export const rateLimitMutatorSchema = rateLimitInitializerSchema.partial();

export type RateLimit = z.infer<typeof rateLimitSchema>;
export type RateLimitInitializer = z.infer<typeof rateLimitInitializerSchema>;
export type RateLimitMutator = z.infer<typeof rateLimitMutatorSchema>;
