import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ResetOnboarding } from '@/pages/Goals/ResetOnboarding';

let isActingOnBehalf = false;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useResetOnboarding: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));

describe('ResetOnboarding', () => {
  beforeEach(() => {
    isActingOnBehalf = false;
  });

  it('lets people reset their own onboarding', () => {
    render(<ResetOnboarding />);
    expect(
      screen.getByRole('button', { name: 'Reset Onboarding' })
    ).toBeInTheDocument();
  });

  it("isn't offered while acting for someone else", () => {
    isActingOnBehalf = true;
    const { container } = render(<ResetOnboarding />);
    expect(container).toBeEmptyDOMElement();
  });
});
