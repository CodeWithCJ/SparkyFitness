import type net from 'node:net';
import { log } from '../config/logging.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import { describeError } from '../utils/errors.js';
import {
  assertOutboundUrlShapeAndLiteralAllowed,
  createGuardedFetch,
  createGuardedLookup,
  resolveFoodProviderNetworkPolicy,
  resolveHostnameForOutboundConnection,
  type AiNetworkPolicy,
} from '../utils/outboundUrlPolicy.js';

interface ProviderRow {
  id: string;
  user_id: string;
  base_url: string;
}

export interface ProviderEndpoint {
  /** The stored URL, with https:// added when it was saved without a scheme. */
  url: string;
  /** Resolves names through the SSRF guard; unset when the owner may use the LAN. */
  lookup?: net.LookupFunction;
}

export interface ProviderFetchEndpoint {
  /** The stored URL, with https:// added when it was saved without a scheme. */
  url: string;
  /**
   * Checks every request against the owner's network policy, and never
   * follows a redirect itself.
   */
  fetch: typeof fetch;
}

// The stored URL and its owner's network policy, or null when the URL is not
// allowed. The policy is the one for the provider's owner, as at save time: an
// admin's own server may be on the LAN, a non-admin's may not unless the
// operator allows it.
async function checkProviderUrl(
  row: ProviderRow,
  label: string,
  onFailure?: (error: unknown) => void
): Promise<{ url: string; policy: AiNetworkPolicy } | null> {
  const stored = row.base_url.trim();
  // A scheme-less URL is accepted when it is saved (and read as https), but
  // any other scheme is not a web service.
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) &&
    !/^https?:\/\//i.test(stored)
  ) {
    log('warn', `${label} ${row.id} is not usable: not an http(s) URL`);
    onFailure?.(new TypeError('not an http(s) URL'));
    return null;
  }
  const url = /^https?:\/\//i.test(stored) ? stored : `https://${stored}`;
  try {
    const isAdmin = await resolveIsAdminByUserId(row.user_id);
    const policy = await resolveFoodProviderNetworkPolicy(isAdmin);
    const parsed = assertOutboundUrlShapeAndLiteralAllowed(url, policy);
    await resolveHostnameForOutboundConnection(parsed.hostname, policy);
    return { url, policy };
  } catch (error) {
    // Only the message: the provider row can carry an API key.
    log('warn', `${label} ${row.id} is not usable: ${describeError(error)}`);
    onFailure?.(error);
    return null;
  }
}

/**
 * The URL of a stored external provider, checked for use, or null when it is
 * not allowed. The URL was checked when it was saved; it is checked again here
 * because the admin's network toggles and DNS can change afterwards, and the
 * connection itself resolves names through the same guard.
 */
export async function resolveProviderEndpoint(
  row: ProviderRow,
  label: string
): Promise<ProviderEndpoint | null> {
  const checked = await checkProviderUrl(row, label);
  if (!checked) return null;
  return {
    url: checked.url,
    lookup: checked.policy.allowPrivateNetwork
      ? undefined
      : createGuardedLookup(checked.policy),
  };
}

/**
 * The same check for a caller that connects with fetch rather than opening its
 * own socket.
 */
export async function resolveProviderFetchEndpoint(
  row: ProviderRow,
  label: string,
  options?: { onFailure?: (error: unknown) => void }
): Promise<ProviderFetchEndpoint | null> {
  const checked = await checkProviderUrl(row, label, options?.onFailure);
  if (!checked) return null;
  return { url: checked.url, fetch: createGuardedFetch(checked.policy) };
}
