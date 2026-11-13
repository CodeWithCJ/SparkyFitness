import type net from 'node:net';
import { log } from '../config/logging.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import { describeError } from '../utils/errors.js';
import {
  assertOutboundUrlShapeAndLiteralAllowed,
  createGuardedLookup,
  resolveFoodProviderNetworkPolicy,
  resolveHostnameForOutboundConnection,
} from '../utils/outboundUrlPolicy.js';

export interface ProviderEndpoint {
  /** The stored URL, with https:// added when it was saved without a scheme. */
  url: string;
  /** Resolves names through the SSRF guard; unset when the owner may use the LAN. */
  lookup?: net.LookupFunction;
}

/**
 * The URL of a stored external provider, checked for use, or null when it is
 * not allowed. The URL was checked when it was saved; it is checked again here
 * because the admin's network toggles and DNS can change afterwards, and the
 * connection itself resolves names through the same guard. The policy is the
 * one for the provider's owner, as at save time: an admin's own server may be
 * on the LAN, a non-admin's may not unless the operator allows it.
 */
export async function resolveProviderEndpoint(
  row: { id: string; user_id: string; base_url: string },
  label: string
): Promise<ProviderEndpoint | null> {
  const stored = row.base_url.trim();
  // A scheme-less URL is accepted when it is saved (and read as https), but
  // any other scheme is not a web service.
  if (
    /^[a-z][a-z0-9+.-]*:\/\//i.test(stored) &&
    !/^https?:\/\//i.test(stored)
  ) {
    log('warn', `${label} ${row.id} is not usable: not an http(s) URL`);
    return null;
  }
  const url = /^https?:\/\//i.test(stored) ? stored : `https://${stored}`;
  try {
    const isAdmin = await resolveIsAdminByUserId(row.user_id);
    const policy = await resolveFoodProviderNetworkPolicy(isAdmin);
    const parsed = assertOutboundUrlShapeAndLiteralAllowed(url, policy);
    await resolveHostnameForOutboundConnection(parsed.hostname, policy);
    return {
      url,
      lookup: policy.allowPrivateNetwork
        ? undefined
        : createGuardedLookup(policy),
    };
  } catch (error) {
    // Only the message: the provider row can carry an API key.
    log('warn', `${label} ${row.id} is not usable: ${describeError(error)}`);
    return null;
  }
}
