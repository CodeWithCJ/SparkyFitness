import { z } from 'zod';

export const oauthClientIdSchema = z.string().uuid();

export const oauthClientSchema = z
  .object({
    id: oauthClientIdSchema,
    client_id: z.string(),
    client_secret: z.string().nullable(),
    client_discovery_id: z.string().nullable(),
    disabled: z.boolean(),
    skip_consent: z.boolean().nullable(),
    enable_end_session: z.boolean().nullable(),
    subject_type: z.string().nullable(),
    scopes: z.string().nullable(),
    client_credentials_scopes: z.string(),
    user_id: z.string().uuid().nullable(),
    created_at: z.date().nullable(),
    updated_at: z.date().nullable(),
    name: z.string().nullable(),
    uri: z.string().nullable(),
    icon: z.string().nullable(),
    contacts: z.string().nullable(),
    tos: z.string().nullable(),
    policy: z.string().nullable(),
    software_id: z.string().nullable(),
    software_version: z.string().nullable(),
    software_statement: z.string().nullable(),
    redirect_uris: z.string(),
    post_logout_redirect_uris: z.string().nullable(),
    backchannel_logout_uri: z.string().nullable(),
    backchannel_logout_session_required: z.boolean().nullable(),
    token_endpoint_auth_method: z.string().nullable(),
    application_type: z.string().nullable(),
    jwks: z.string().nullable(),
    jwks_uri: z.string().nullable(),
    grant_types: z.string().nullable(),
    response_types: z.string().nullable(),
    require_pkce: z.boolean().nullable(),
    dpop_bound_access_tokens: z.boolean(),
    reference_id: z.string().nullable(),
    metadata: z.json().nullable(),
  })
  .strict();

export const oauthClientInitializerSchema = z
  .object({
    id: oauthClientIdSchema.optional(),
    client_id: z.string(),
    client_secret: z.string().nullable().optional(),
    client_discovery_id: z.string().nullable().optional(),
    disabled: z.boolean().optional(),
    skip_consent: z.boolean().nullable().optional(),
    enable_end_session: z.boolean().nullable().optional(),
    subject_type: z.string().nullable().optional(),
    scopes: z.string().nullable().optional(),
    client_credentials_scopes: z.string().optional(),
    user_id: z.string().uuid().nullable().optional(),
    created_at: z.date().nullable().optional(),
    updated_at: z.date().nullable().optional(),
    name: z.string().nullable().optional(),
    uri: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    contacts: z.string().nullable().optional(),
    tos: z.string().nullable().optional(),
    policy: z.string().nullable().optional(),
    software_id: z.string().nullable().optional(),
    software_version: z.string().nullable().optional(),
    software_statement: z.string().nullable().optional(),
    redirect_uris: z.string(),
    post_logout_redirect_uris: z.string().nullable().optional(),
    backchannel_logout_uri: z.string().nullable().optional(),
    backchannel_logout_session_required: z.boolean().nullable().optional(),
    token_endpoint_auth_method: z.string().nullable().optional(),
    application_type: z.string().nullable().optional(),
    jwks: z.string().nullable().optional(),
    jwks_uri: z.string().nullable().optional(),
    grant_types: z.string().nullable().optional(),
    response_types: z.string().nullable().optional(),
    require_pkce: z.boolean().nullable().optional(),
    dpop_bound_access_tokens: z.boolean().optional(),
    reference_id: z.string().nullable().optional(),
    metadata: z.json().nullable().optional(),
  })
  .strict();

export const oauthClientMutatorSchema = oauthClientInitializerSchema.partial();

export type OauthClient = z.infer<typeof oauthClientSchema>;
export type OauthClientInitializer = z.infer<
  typeof oauthClientInitializerSchema
>;
export type OauthClientMutator = z.infer<typeof oauthClientMutatorSchema>;
