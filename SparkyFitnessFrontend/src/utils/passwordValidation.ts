export type PasswordValidationIssue =
  | 'tooShort'
  | 'missingUppercase'
  | 'missingLowercase'
  | 'missingNumber'
  | 'missingSpecialCharacter';

export const PASSWORD_REQUIREMENT_DEFAULTS: Record<
  PasswordValidationIssue,
  string
> = {
  tooShort: 'Use at least 6 characters.',
  missingUppercase: 'Add at least one uppercase letter.',
  missingLowercase: 'Add at least one lowercase letter.',
  missingNumber: 'Add at least one number.',
  missingSpecialCharacter: 'Add at least one special character.',
};

export const getPasswordValidationIssue = (
  password: string
): PasswordValidationIssue | null => {
  if (password.length < 6) return 'tooShort';
  if (!/[A-Z]/.test(password)) return 'missingUppercase';
  if (!/[a-z]/.test(password)) return 'missingLowercase';
  if (!/[0-9]/.test(password)) return 'missingNumber';
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    return 'missingSpecialCharacter';
  }
  return null;
};
