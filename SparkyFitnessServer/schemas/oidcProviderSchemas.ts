import { z } from 'zod';

export const oidcProviderUpdateSchema = z.object({
  issuer_url: z.string().min(1),
  client_id: z.string().min(1).nullable(),
  client_secret: z.string().nullable().optional(),
  provider_id: z.string().optional(),
  domain: z.string().optional(),
  display_name: z.string().nullable().optional(),
  logo_url: z.string().nullable().optional(),
  auto_register: z.boolean().optional(),
  is_active: z.boolean().optional(),
  redirect_uris: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
  token_endpoint_auth_method: z.string().optional(),
  signing_algorithm: z.string().optional(),
  profile_signing_algorithm: z.string().optional(),
  timeout: z.number().optional(),
  is_env_configured: z.boolean().optional(),
  admin_group: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
});

export type OidcProviderUpdate = z.infer<typeof oidcProviderUpdateSchema>;
