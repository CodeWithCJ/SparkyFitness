import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';

// Logs every request that reaches it. Used in two places: globally after the
// /api/auth interceptor, and locally on the /mcp chain, which is mounted above
// the global logger so its route-local body parser beats the global 50mb one.
export function requestLogger(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  log(
    'info',
    `Incoming request: ${req.method} ${req.originalUrl} (Path: ${req.path})`
  );
  next();
}
