import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';

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
 * Middleware that prevents mutations on demo user credentials, MFA, passkeys,
 * integrations, and account deletion when running in Demo Mode.
 */
export function demoGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDemoMode()) {
    return next();
  }

  // Check if authenticated user or context user matches demo email
  // @ts-expect-error - Express request augmented with user properties by auth middleware
  const userEmail = req.authenticatedUserEmail || req.user?.email || req.email;

  if (userEmail && isDemoEmail(String(userEmail))) {
    log(
      'warn',
      `[DEMO GUARD] Blocked restricted mutation on ${req.method} ${req.originalUrl} for demo user`
    );
    res.status(403).json({
      error:
        'This action is disabled on the demo account to keep the instance available for everyone.',
      code: 'DEMO_ACTION_RESTRICTED',
    });
    return;
  }

  next();
}

/**
 * Middleware that prevents file uploads (multipart requests) for demo users
 * to avoid disk consumption in public demo instances.
 */
export function demoUploadGuard(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isDemoMode()) {
    return next();
  }

  // @ts-expect-error - Express request augmented with user properties by auth middleware
  const userEmail = req.authenticatedUserEmail || req.user?.email || req.email;

  if (userEmail && isDemoEmail(String(userEmail))) {
    const contentType = req.headers['content-type'] || '';
    if (contentType.toLowerCase().includes('multipart/form-data')) {
      log(
        'warn',
        `[DEMO GUARD] Blocked file upload on ${req.method} ${req.originalUrl} for demo user`
      );
      res.status(403).json({
        error:
          'File uploads are disabled on the demo account to prevent storage abuse.',
        code: 'DEMO_UPLOAD_RESTRICTED',
      });
      return;
    }
  }

  next();
}
