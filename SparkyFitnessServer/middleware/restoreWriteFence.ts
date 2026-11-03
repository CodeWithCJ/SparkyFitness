import type { NextFunction, Request, Response } from 'express';
import {
  restoreInProgress,
  runAsWriteRequest,
} from '../services/restoreLock.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RETRY_AFTER_SECONDS = 30;

/**
 * Refuses writes on every instance while a restore runs: a write accepted
 * then would land in the database the restore is about to replace, or race
 * the uploads swap, and be lost after the client was told it was saved. A 503
 * with Retry-After makes clients try again once the restored data is live.
 */
export async function restoreWriteFence(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!(await restoreInProgress())) return runAsWriteRequest(next);
  res.set('Retry-After', String(RETRY_AFTER_SECONDS));
  return res.status(503).json({
    message: 'A backup is being restored; try again in a moment.',
  });
}
