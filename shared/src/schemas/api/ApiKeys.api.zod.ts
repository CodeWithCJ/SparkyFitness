import { z } from 'zod';

// Consumed by POST /api/identity/user/generate-api-key (server) and the API key
// settings screen (web). Permissions use Better Auth's api-key format and are
// stored in api_key.permissions. A key with no permissions (every key created
// before scopes existed) has full access.

export const API_KEY_PERMISSION_RESOURCE = 'sparky';

export const apiKeyScopeSchema = z.enum(['read', 'full']);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

export const API_KEY_SCOPE_PERMISSIONS: Record<
  ApiKeyScope,
  Record<string, string[]>
> = {
  read: { [API_KEY_PERMISSION_RESOURCE]: ['read'] },
  full: { [API_KEY_PERMISSION_RESOURCE]: ['read', 'write'] },
};

export const createApiKeyBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  /** Expiration time in seconds; null for a key that never expires. */
  expiresIn: z.number().int().positive().nullable().optional(),
  scope: apiKeyScopeSchema.default('full'),
});
export type CreateApiKeyBody = z.infer<typeof createApiKeyBodySchema>;

/**
 * True when the stored permissions limit the key to reading. null, empty, or
 * a value without a `sparky` entry means full access, so existing keys keep
 * working unchanged. Accepts the JSON string from the database or the parsed
 * object Better Auth returns from /api-key/list.
 */
export function isReadOnlyApiKeyPermissions(permissions: unknown): boolean {
  if (permissions === null || permissions === undefined || permissions === '')
    return false;
  let parsed: unknown = permissions;
  if (typeof permissions === 'string') {
    try {
      parsed = JSON.parse(permissions);
    } catch {
      // Not written by Better Auth; refuse writes rather than guess.
      return true;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return true;
  const actions = (parsed as Record<string, unknown>)[
    API_KEY_PERMISSION_RESOURCE
  ];
  if (actions === undefined) return false;
  return !Array.isArray(actions) || !actions.includes('write');
}
