import type { Response as ExpressResponse } from 'express';

/**
 * Copies a Fetch `Response`'s headers onto an Express response.
 *
 * `Set-Cookie` needs its own path. `Headers.forEach` yields each set-cookie
 * value as a separate entry rather than folding them, and `res.setHeader`
 * replaces the header on every call — so forwarding them through the loop keeps
 * only the last cookie and silently drops the rest.
 *
 * A multi-cookie sign-in response is a supported case, not today's behaviour:
 * the current config disables `session.cookieCache`, so Better Auth emits the
 * session token alone. Turning that cache back on, a `rememberMe: false`
 * sign-in, or any plugin that sets its own cookie would each add a second one,
 * and the loop would drop it silently and leave the session incomplete.
 *
 * Express accepts an array for `set-cookie` and emits one header line per
 * entry, so collect them and set them once.
 */
export function forwardResponseHeaders(
  source: Headers,
  res: ExpressResponse
): void {
  const setCookies = source.getSetCookie();

  source.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') return;
    res.setHeader(key, value);
  });

  if (setCookies.length > 0) {
    res.setHeader('set-cookie', setCookies);
  }
}
