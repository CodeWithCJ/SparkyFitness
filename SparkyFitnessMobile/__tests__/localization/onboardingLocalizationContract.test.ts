import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(mobileRoot, relativePath), 'utf8');

const onboardingSource = readSource('src/screens/OnboardingScreen.tsx');
const mfaSource = readSource('src/components/MfaForm.tsx');
const serverUrlSource = readSource('src/utils/serverUrl.ts');

describe('onboarding localization contract', () => {
  it('localizes welcome, connection, sign-in, API key, and recovery', () => {
    for (const key of [
      'onboarding.appName',
      'onboarding.tagline',
      'onboarding.serverUrl',
      'onboarding.connectTitle',
      'onboarding.signIn',
      'onboarding.apiKey',
      'onboarding.connect',
      'onboarding.signInFailed',
    ]) {
      expect(onboardingSource).toContain(`mobileT('${key}'`);
    }
  });

  it('localizes MFA and accepts Arabic verification digits', () => {
    expect(mfaSource).toContain("mobileT('mfa.authenticatorApp')");
    expect(mfaSource).toContain("mobileT('mfa.verify')");
    expect(mfaSource).toContain('INTEGER_INPUT_REGEX.test(text)');
    expect(onboardingSource).toContain(
      'normalizeLocalizedDigits(mfaCode.trim())',
    );
  });

  it('localizes the HTTPS safety explanation', () => {
    expect(serverUrlSource).toContain("mobileT('server.httpsRequired'");
  });

  it('keeps visible onboarding copy free of English literals', () => {
    for (const englishCopy of [
      'Your self-hosted fitness tracker',
      '>Frontend URL<',
      '>Later<',
      'Learn more about SparkyFitness',
      'Connect to SparkyFitness',
      '>Sign In<',
      '>Password<',
      'Or sign in with',
      'Sign in with Passkey',
      '>API Key<',
      'Two-Factor Authentication',
      'Authenticator App',
      'Enter the code from your authenticator app',
      'HTTPS is required',
    ]) {
      expect(`${onboardingSource}\n${mfaSource}\n${serverUrlSource}`).not.toContain(
        englishCopy,
      );
    }
  });
});
