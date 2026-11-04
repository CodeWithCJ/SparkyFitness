import type { Request, Response, NextFunction } from 'express';
import { log } from '../config/logging.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';
import { isMagicLinkLoginDisabled } from '../utils/magicLinkLogin.js';

// Verify is included so a link sent before the switch was turned off stops
// working too.
const MAGIC_LINK_LOGIN_ROUTES = new Set([
  '/api/auth/sign-in/magic-link',
  '/api/auth/magic-link/verify',
]);

/**
 * Block magic link sign-in when it is off. Reads the admin setting with
 * SPARKY_FITNESS_DISABLE_MAGIC_LINK_LOGIN applied on top, the same value the
 * login page shows.
 */
export async function magicLinkLoginGuard(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!MAGIC_LINK_LOGIN_ROUTES.has(req.path.replace(/\/$/, ''))) return next();
  let disabled: boolean;
  try {
    const settings = await globalSettingsRepository.getGlobalSettings();
    disabled = !settings.enable_magic_link_login;
  } catch (error) {
    log(
      'error',
      '[AUTH] Could not read login settings; applying the environment settings only:',
      error
    );
    disabled = isMagicLinkLoginDisabled();
  }
  if (disabled) {
    return res.status(400).json({
      message: 'Magic link login is not enabled',
      code: 'MAGIC_LINK_LOGIN_DISABLED',
    });
  }
  next();
}
