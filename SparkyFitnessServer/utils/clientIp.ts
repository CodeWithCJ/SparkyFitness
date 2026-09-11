import type { Request } from 'express';

/**
 * Real client IP, for rate limiting and audit logs.
 *
 * `req.ip` alone is unreliable once more than one proxy sits in front of the
 * app. Express resolves it from `X-Forwarded-For` using the `trust proxy` hop
 * count (see SPARKY_FITNESS_TRUSTED_PROXY_HOPS); if the real chain is longer
 * than that count, `req.ip` lands on an internal proxy address that every
 * visitor shares — which would put the whole internet in one rate-limit bucket.
 * `X-Real-IP` is no help either, since docker/nginx.conf overwrites it with its
 * own upstream address.
 *
 * Deployments behind a CDN usually have a better source: a header the edge
 * writes and no downstream hop rewrites (`CF-Connecting-IP` on Cloudflare,
 * `True-Client-IP` on Akamai and others). SPARKY_FITNESS_REAL_IP_HEADER names
 * that header, and it takes precedence when present.
 *
 * Naming a header is only safe when the app cannot be reached except through
 * the proxy that sets it — a request arriving directly could otherwise forge it
 * and slip past every per-IP limit. That is why this is opt-in rather than a
 * built-in list of CDN headers.
 */
export function getClientIp(req: Request): string {
  const headerName = process.env.SPARKY_FITNESS_REAL_IP_HEADER?.trim();
  if (headerName) {
    const value = req.headers[headerName.toLowerCase()];
    const raw = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string' && raw.trim()) {
      // Most such headers carry a single address, but a few CDNs pass a list.
      // The originating client is always the first entry.
      return raw.split(',')[0].trim();
    }
  }
  return req.ip || 'unknown';
}
