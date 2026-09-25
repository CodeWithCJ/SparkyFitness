import { getAgreedIdentitySettings } from './agreedSharedSettings.js';

/** FORCE restores password access when the normal login policy disables it. */
export function isEmailLoginDisabled(): boolean {
  return getAgreedIdentitySettings().enable_email_password_login === false;
}
