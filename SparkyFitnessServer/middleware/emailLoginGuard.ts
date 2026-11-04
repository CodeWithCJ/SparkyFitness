import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { isEmailLoginDisabled } from '../utils/emailLogin.js';

// Ends at "email" so only the password routes match, not longer paths under it.
function isPasswordRoute(path: string): boolean {
  return /^\/api\/auth\/sign-(in|up)\/email(\/|$)/.test(path);
}

/**
 * Block public password routes when password login is off, without blocking
 * internal demo sign-in. Reads the same effective setting the login page shows
 * (the admin toggle, with the environment overrides applied on top).
 */
export async function emailLoginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!isPasswordRoute(req.path)) return next();
  let disabled: boolean;
  try {
    const settings = await globalSettingsRepository.getGlobalSettings();
    disabled = !settings.enable_email_password_login;
  } catch (error) {
    log(
      'error',
      '[AUTH] Could not read login settings; applying the environment settings only:',
      error
    );
    disabled = isEmailLoginDisabled();
  }
  if (disabled) {
    return res.status(400).json({
      message: 'Email and password is not enabled',
      code: 'EMAIL_PASSWORD_DISABLED',
    });
  }
  next();
}
