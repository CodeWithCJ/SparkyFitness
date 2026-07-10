import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/components/ReauthModal.tsx'),
  'utf8',
);

describe('reauthentication localization contract', () => {
  it('uses Arabic copy throughout the expired-session flow', () => {
    for (const key of [
      'reauth.sessionExpired',
      'reauth.server',
      'onboarding.email',
      'onboarding.password',
      'onboarding.signIn',
      'onboarding.signInWithPasskey',
      'common.later',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('normalizes Arabic verification digits before submission', () => {
    expect(source).toContain('normalizeLocalizedDigits(mfaCode.trim())');
  });

  it('does not expose raw English authentication errors', () => {
    for (const englishCopy of [
      'Session Expired',
      'Two-Factor Authentication',
      'No server selected.',
      'Please enter your email.',
      'Could not connect to server.',
      'Invalid verification code.',
      'Sign in with Passkey',
      'Use API Key Instead',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
