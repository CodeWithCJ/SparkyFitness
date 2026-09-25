import type { SharedSettings } from '../services/sharedSettingsService.js';
import {
  getAuthEnvOverrides,
  type AuthEnvOverrides,
} from './authEnvOverrides.js';

let agreed: Partial<SharedSettings> | null = null;

/** Replaces this instance's copy of the agreed settings after a check-in. */
export function setAgreedSharedSettings(
  settings: Partial<SharedSettings> | null
) {
  agreed = settings;
}

/**
 * Identity settings every instance agreed on, as last read by this instance.
 *
 * Request paths read this copy so they never wait on the database; each
 * check-in refreshes it. Until the shared settings service has loaded it,
 * which only happens outside a running server (scripts and unit tests), the
 * process's own environment applies, exactly as before shared settings.
 */
export function getAgreedIdentitySettings(): AuthEnvOverrides {
  return agreed?.identity ?? getAuthEnvOverrides(process.env);
}
