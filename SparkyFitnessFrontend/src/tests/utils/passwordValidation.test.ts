import { getPasswordValidationIssue } from '@/utils/passwordValidation';

describe('getPasswordValidationIssue', () => {
  it.each([
    ['Ab1!', 'tooShort'],
    ['lowercase1!', 'missingUppercase'],
    ['UPPERCASE1!', 'missingLowercase'],
    ['NoNumber!', 'missingNumber'],
    ['NoSpecial1', 'missingSpecialCharacter'],
  ] as const)('classifies %s as %s', (password, expectedIssue) => {
    expect(getPasswordValidationIssue(password)).toBe(expectedIssue);
  });

  it('accepts a password that meets every requirement', () => {
    expect(getPasswordValidationIssue('Najdi1!')).toBeNull();
  });
});
