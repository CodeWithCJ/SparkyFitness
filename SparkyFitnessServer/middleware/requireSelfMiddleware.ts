import type { NextFunction, Request, Response } from 'express';
import { log } from '../config/logging.js';

/**
 * Rejects requests running in a switched / delegated context.
 *
 * `checkPermissionMiddleware` authorizes delegation and `onBehalfOfMiddleware`
 * establishes it; nothing else in the stack expresses "this route may not be
 * used on someone else's behalf at all". Account linking needs exactly that: a
 * family delegate with diary access is authorized to read the owner's diary,
 * never to bind an external identity to the owner's row or to receive an
 * authorization URL carrying the owner's decrypted OAuth client id.
 *
 * Attach per-route, never with `router.use` — sync, disconnect and status are
 * legitimately delegatable and must keep working in a switched context.
 */
export function createRequireSelfActor({
  action = 'an account-linking action',
  message = 'Forbidden: account linking is only available for your own account.',
}: { action?: string; message?: string } = {}) {
  return function requireSelf(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // `||` deliberately mirrors checkPermissionMiddleware.ts so the two agree
    // exactly on who "the caller" is; diverging here would be a subtle bug.
    const actorUserId =
      req.originalUserId || req.authenticatedUserId || req.userId;
    if (!actorUserId || !req.userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (req.userId !== actorUserId) {
      log(
        'warn',
        `Forbidden: user ${actorUserId} attempted ${action} for ${req.userId}.`
      );
      res.status(403).json({ error: message });
      return;
    }
    next();
  };
}

export const requireSelfActor = createRequireSelfActor();

export default requireSelfActor;
