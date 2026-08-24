import { z } from 'zod';

export const INTEGRATION_ACTIONS = [
  'list_providers',
  'list_provider_types',
] as const;

const listProvidersSchema = z
  .object({
    action: z.literal('list_providers'),
  })
  .strict();

const listProviderTypesSchema = z
  .object({
    action: z.literal('list_provider_types'),
  })
  .strict();

export const integrationsSchema = z.discriminatedUnion('action', [
  listProvidersSchema,
  listProviderTypesSchema,
]);

export type IntegrationsInput = z.infer<typeof integrationsSchema>;

export const integrationsInput = z.object({
  action: z.enum(INTEGRATION_ACTIONS).optional(),
});
