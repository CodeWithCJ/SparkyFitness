import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';

/**
 * Marker written into `profiles.bio` when the demo sandbox is seeded. It is the
 * only thing that authorizes the destructive seed/reset/purge paths, so every
 * check against it must fail closed: a normally-created profile is inserted
 * with a NULL bio, and "no marker" must never be read as "safe to wipe".
 */
export const DEMO_ACCOUNT_MARKER = 'SparkyFitness Demo Account';

export function isDemoMode(): boolean {
  return process.env.SPARKY_FITNESS_DEMO_MODE === 'true';
}

export function getDemoEmail(): string {
  return (
    process.env.SPARKY_FITNESS_DEMO_EMAIL?.toLowerCase().trim() ||
    'demo@sparkyfitness.com'
  );
}

export function isDemoEmail(email?: string | null): boolean {
  if (!isDemoMode() || !email) return false;
  return email.toLowerCase().trim() === getDemoEmail();
}

/**
 * Email of the *authenticated* identity, deliberately not the on-behalf-of
 * context, so switching user context can never shed the demo restrictions.
 * `authMiddleware` sets `req.user` from the Better Auth session.
 */
function getRequestUserEmail(req: Request): string | null {
  const email = req.user?.email;
  return typeof email === 'string' ? email : null;
}

/** True when this request is authenticated as the demo sandbox account. */
export function isDemoRequest(req: Request): boolean {
  return isDemoMode() && isDemoEmail(getRequestUserEmail(req));
}

function denyDemo(
  req: Request,
  res: Response,
  error: string,
  code: string
): void {
  log(
    'warn',
    `[DEMO GUARD] Blocked ${req.method} ${req.originalUrl} for demo user`
  );
  res.status(403).json({ error, code });
}

const RESTRICTED_MESSAGE =
  'This action is disabled on the demo account to keep the instance available for everyone.';

/**
 * Paths a demo visitor must never reach on any method. These spend the
 * operator's money (LLM calls), reach third-party accounts, or expose
 * privileged surfaces.
 */
const DEMO_BLOCKED_PREFIXES = [
  '/api/chat', // AI chat — bills the operator's LLM provider
  '/api/ai', // AI unit conversion — same
  '/mcp', // MCP tool surface, including AI-backed tools
  '/api/mcp',
  '/api/admin', // privileged surface (defense in depth behind the role check)
  '/api/integrations', // Garmin/Fitbit/Oura/Strava/Polar/Hevy/Google OAuth binding
  '/api/withings',
  '/api/external-providers', // provider config accepts operator-supplied base URLs
];

/**
 * Namespaces where reads are fine but writes are not. `/api/identity` is the
 * whole account-management cluster: credentials, MFA, passkeys, API keys,
 * family sharing, and the profile row that carries the demo marker.
 */
const DEMO_READONLY_PREFIXES = ['/api/identity'];

/**
 * Endpoints that ingest a file, image, or bulk document *without* multipart —
 * base64 in a JSON body, or a pasted CSV/JSON payload — so the content-type
 * check below never sees them. Matched as patterns because several sit behind a
 * dynamic `:id` segment.
 */
const DEMO_BLOCKED_PATH_PATTERNS = [
  // import-from-csv, import-history-csv, import-fit, import-json
  /\/import(-|\/|$)/i,
  /\/scan-label$/i, // base64 label image -> LLM
  /\/estimate-food-photo$/i, // base64 meal photo -> LLM
  /\/openfoodfacts\//i, // publishes product data and photos to a public database
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function matchesPrefix(path: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => path === prefix || path.startsWith(prefix + '/')
  );
}

function isMultipart(req: Request): boolean {
  const contentType = req.headers['content-type'] || '';
  return contentType.toLowerCase().includes('multipart/form-data');
}

/**
 * Single global deny-list for the demo account, mounted once ahead of the route
 * table rather than sprinkled per route — an allowlist that has to be
 * remembered on every new route family is the thing that eventually leaks.
 *
 * Blocks, for the demo account only:
 *  - every prefix in DEMO_BLOCKED_PREFIXES, on any method
 *  - mutations under DEMO_READONLY_PREFIXES
 *  - every multipart upload, on any route, so no visitor can fill the disk
 */
export function demoRestrictionGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDemoRequest(req)) {
    return next();
  }

  // Express rewrites req.path relative to the mount point, so inside
  // app.use('/mcp', ...) a request for /mcp/tools arrives as '/tools'. Prefixes
  // are absolute, so rebuild the full path or the mounted copy matches nothing.
  const fullPath = (req.baseUrl || '') + req.path;

  if (matchesPrefix(fullPath, DEMO_BLOCKED_PREFIXES)) {
    return denyDemo(req, res, RESTRICTED_MESSAGE, 'DEMO_ACTION_RESTRICTED');
  }

  if (DEMO_BLOCKED_PATH_PATTERNS.some((pattern) => pattern.test(fullPath))) {
    return denyDemo(
      req,
      res,
      'Imports and photo analysis are disabled on the demo account.',
      'DEMO_UPLOAD_RESTRICTED'
    );
  }

  if (
    MUTATING_METHODS.has(req.method) &&
    matchesPrefix(fullPath, DEMO_READONLY_PREFIXES)
  ) {
    return denyDemo(req, res, RESTRICTED_MESSAGE, 'DEMO_ACTION_RESTRICTED');
  }

  if (isMultipart(req)) {
    return denyDemo(
      req,
      res,
      'File uploads are disabled on the demo account to prevent storage abuse.',
      'DEMO_UPLOAD_RESTRICTED'
    );
  }

  next();
}

/**
 * Per-route guard for sensitive mutations. Redundant with
 * `demoRestrictionGuard` on the routes that already carry it, and kept as
 * defense in depth so a future re-mount of a route family cannot silently
 * unguard it.
 */
export function demoGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDemoRequest(req)) {
    return next();
  }
  denyDemo(req, res, RESTRICTED_MESSAGE, 'DEMO_ACTION_RESTRICTED');
}

/**
 * Per-route guard that blocks multipart uploads for demo users. Also redundant
 * with `demoRestrictionGuard`, kept for the same reason.
 */
export function demoUploadGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDemoRequest(req) || !isMultipart(req)) {
    return next();
  }
  denyDemo(
    req,
    res,
    'File uploads are disabled on the demo account to prevent storage abuse.',
    'DEMO_UPLOAD_RESTRICTED'
  );
}
