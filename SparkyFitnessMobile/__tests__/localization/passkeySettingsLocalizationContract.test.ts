import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../..');
const source = fs.readFileSync(
  path.join(mobileRoot, 'src/screens/PasskeySettingsScreen.tsx'),
  'utf8',
);

describe('passkey settings localization contract', () => {
  it('localizes passkey management and recovery copy', () => {
    for (const key of [
      'screens.passkeySettings',
      'passkeys.description',
      'passkeys.emptyTitle',
      'passkeys.registerTitle',
      'passkeys.deleteTitle',
      'passkeys.registrationFailed',
    ]) {
      expect(source).toContain(`mobileT('${key}'`);
    }
  });

  it('formats registration dates in Saudi Arabic with the Gregorian calendar', () => {
    expect(source).toContain('`${MOBILE_LOCALE}-u-ca-gregory`');
  });

  it('does not expose raw English errors or interface copy', () => {
    for (const englishCopy of [
      "text1: 'Error'",
      'Passkey registered successfully!',
      'Registration Failed',
      'Delete Passkey',
      'No Passkeys Registered',
      'Registered:',
      'Add Passkey',
      'Register Passkey',
      'e.g. My iPhone',
    ]) {
      expect(source).not.toContain(englishCopy);
    }
  });
});
