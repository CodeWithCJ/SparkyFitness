import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import {
  isMcpOAuthAuthEndpointPath,
  isMcpOAuthRedirectUriAllowed,
} from '../utils/mcpOAuth.js';

const oauthConsentDeletionSchema = z.object({
  id: z.string().uuid(),
});

interface McpOAuthAuthGateDependencies {
  isAuthHandlerMounted: () => boolean;
  isOAuthEnabled: () => Promise<boolean>;
  isOAuthAvailable: () => boolean;
}

interface McpOAuthAuthInterceptorDependencies {
  getSessionUserId: () => Promise<string | null>;
  revokeAuthorization: (userId: string, consentId: string) => Promise<boolean>;
  getAllowedRedirectUris: () => Promise<string[]>;
}

export function getCanonicalRequestPath(
  req: Pick<Request, 'originalUrl'>
): string {
  const pathname = new URL(req.originalUrl, 'http://localhost').pathname;
  const decodedUnreserved = pathname.replace(
    /%([0-9a-f]{2})/gi,
    (encoded, hex: string) => {
      const decoded = String.fromCharCode(Number.parseInt(hex, 16));
      return /^[A-Za-z0-9._~-]$/.test(decoded) ? decoded : encoded;
    }
  );
  return decodedUnreserved.replace(/\/{2,}/g, '/');
}

export function hasCanonicalRequestPath(
  req: Pick<Request, 'originalUrl' | 'path'>
): boolean {
  return getCanonicalRequestPath(req) === req.path;
}

export function createMcpOAuthAuthGate(
  dependencies: McpOAuthAuthGateDependencies
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (
      !req.originalUrl.startsWith('/api/auth') ||
      !dependencies.isAuthHandlerMounted()
    ) {
      return next();
    }

    const canonicalAuthPath = getCanonicalRequestPath(req);
    if (!hasCanonicalRequestPath(req)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const normalizedAuthPath = canonicalAuthPath.replace(/\/+$/, '');
    if (
      isMcpOAuthAuthEndpointPath(normalizedAuthPath) &&
      (!(await dependencies.isOAuthEnabled()) ||
        !dependencies.isOAuthAvailable())
    ) {
      return res.status(404).json({ error: 'not_found' });
    }

    return next();
  };
}

function getRequestBody(body: unknown): Record<string, unknown> | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return null;
  }
  return body as Record<string, unknown>;
}

function sendInvalidRedirectUri(res: Response): true {
  res.status(400).json({
    error: 'invalid_redirect_uri',
    error_description:
      'The requested OAuth redirect URI is not allowed by the server administrator.',
  });
  return true;
}

/**
 * Handles the application-specific security rules that must run before Better
 * Auth's OAuth provider endpoints.
 *
 * Returns true when a response has been sent, or false when Better Auth should
 * continue handling the request (including its standard validation/errors).
 */
export async function interceptMcpOAuthAuthRequest(
  req: Request,
  res: Response,
  dependencies: McpOAuthAuthInterceptorDependencies
): Promise<boolean> {
  const method = req.method.toUpperCase();
  const body = getRequestBody(req.body);
  const normalizedPath = getCanonicalRequestPath(req).replace(/\/+$/, '');

  if (method === 'POST' && normalizedPath === '/api/auth/oauth2/register') {
    if (
      body !== null &&
      Object.prototype.hasOwnProperty.call(body, 'backchannel_logout_uri')
    ) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description:
          'backchannel_logout_uri is not supported for dynamic client registration',
      });
      return true;
    }

    const redirectUris = body?.redirect_uris;
    if (
      !Array.isArray(redirectUris) ||
      !redirectUris.every((uri): uri is string => typeof uri === 'string')
    ) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description:
          'Dynamic client registration requires a JSON redirect_uris array.',
      });
      return true;
    }

    const allowedRedirectUris = await dependencies.getAllowedRedirectUris();
    if (
      !redirectUris.every((uri) =>
        isMcpOAuthRedirectUriAllowed(uri, allowedRedirectUris)
      )
    ) {
      return sendInvalidRedirectUri(res);
    }
  }

  if (
    method !== 'POST' ||
    normalizedPath !== '/api/auth/oauth2/delete-consent'
  ) {
    return false;
  }

  const parsed = oauthConsentDeletionSchema.safeParse(body);
  if (!parsed.success) return false;

  const userId = await dependencies.getSessionUserId();
  if (!userId) return false;

  const revoked = await dependencies.revokeAuthorization(
    userId,
    parsed.data.id
  );
  if (!revoked) return false;

  // Better Auth 1.7 returns an empty JSON response with HTTP 200 here.
  res.status(200).type('application/json').end();
  return true;
}
