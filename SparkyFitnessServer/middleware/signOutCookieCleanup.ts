import type { ServerResponse } from 'http';

// When Better Auth handles /api/auth/sign-out, its node adapter writes its own
// Set-Cookie headers via res.setHeader, which replaces anything we set earlier.
// This helper wraps res.setHeader so our sparky_active_user_id delete cookie is
// merged into whatever Better Auth writes. Attributes must match those used
// when the cookie was originally set in routes/auth/userProfileRoutes.js
// /switch-context, otherwise some browsers won't honor the delete.
export function applySignOutCookieCleanup(res: ServerResponse): void {
  const clearCookieStr =
    'sparky_active_user_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict' +
    (process.env.NODE_ENV === 'production' ? '; Secure' : '');

  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = function (
    name: string,
    value: number | string | readonly string[]
  ): ServerResponse {
    if (typeof name === 'string' && name.toLowerCase() === 'set-cookie') {
      const arr = (Array.isArray(value) ? [...value] : [value]).filter(
        Boolean
      ) as string[];
      if (!arr.includes(clearCookieStr)) arr.push(clearCookieStr);
      return originalSetHeader(name, arr);
    }
    return originalSetHeader(name, value);
  } as typeof res.setHeader;

  // Initial write in case the downstream handler never touches Set-Cookie.
  res.setHeader('Set-Cookie', [clearCookieStr]);
}
