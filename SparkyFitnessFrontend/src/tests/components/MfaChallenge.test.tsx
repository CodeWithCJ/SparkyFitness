import { render, screen } from '@testing-library/react';
import MfaChallenge from '@/pages/Auth/MfaChallenge';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

jest.mock('@/lib/auth-client', () => ({
  authClient: {
    twoFactor: {
      verifyTotp: jest.fn(),
      sendOtp: jest.fn(),
      verifyOtp: jest.fn(),
      verifyBackupCode: jest.fn(),
    },
  },
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ signIn: jest.fn() }),
}));

jest.mock('@/hooks/use-toast', () => ({
  toast: jest.fn(),
}));

describe('MfaChallenge', () => {
  it('renders a responsive, clearly labelled verification flow', () => {
    render(
      <MfaChallenge
        userId="user-1"
        email="user@example.com"
        mfaTotpEnabled
        onMfaSuccess={jest.fn()}
        onMfaCancel={jest.fn()}
      />
    );

    const heading = screen.getByRole('heading', { name: "Verify it's you" });
    expect(heading.parentElement?.parentElement?.className).toContain(
      'max-w-md'
    );
    expect(screen.getByRole('button', { name: 'Verify' })).toBeTruthy();
  });
});
