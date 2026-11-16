import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Index from '@/pages/Index';

let isActingOnBehalf = false;
let status: { onboardingComplete: boolean; onboardingSkipped: boolean } = {
  onboardingComplete: false,
  onboardingSkipped: false,
};
const useOnboardingStatus = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback }),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'alex' }, loading: false }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ loggingLevel: 'ERROR' }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf }),
}));
jest.mock('@/hooks/Onboarding/useOnboarding', () => ({
  useOnboardingStatus: (enabled: boolean) => useOnboardingStatus(enabled),
}));
jest.mock('@/components/Onboarding/OnBoarding', () => ({
  __esModule: true,
  default: () => <div>Onboarding wizard</div>,
}));
jest.mock('@/layouts/MainLayout', () => ({
  __esModule: true,
  default: ({ onStartOnboarding }: { onStartOnboarding?: () => void }) => (
    <div>
      Main layout
      {onStartOnboarding && (
        <button onClick={onStartOnboarding}>Complete Setup</button>
      )}
    </div>
  ),
}));

const renderIndex = () =>
  render(
    <Index onShowAboutDialog={jest.fn()} onShowNewReleaseDialog={jest.fn()} />
  );

describe('Index onboarding wizard', () => {
  beforeEach(() => {
    isActingOnBehalf = false;
    status = { onboardingComplete: false, onboardingSkipped: false };
    // The answer is what the cache holds, whether or not the query may run:
    // a status read before the app knew it was acting for someone else.
    useOnboardingStatus
      .mockReset()
      .mockImplementation(() => ({ data: status, isLoading: false }));
  });

  it("opens on its own for the person's own unfinished onboarding", () => {
    renderIndex();
    expect(screen.getByText('Onboarding wizard')).toBeInTheDocument();
    expect(useOnboardingStatus).toHaveBeenLastCalledWith(true);
  });

  it("never opens someone else's onboarding while acting for them", () => {
    isActingOnBehalf = true;
    renderIndex();
    expect(screen.queryByText('Onboarding wizard')).not.toBeInTheDocument();
    expect(screen.getByText('Main layout')).toBeInTheDocument();
    expect(useOnboardingStatus).toHaveBeenLastCalledWith(false);
  });

  it('offers Complete Setup after the person skipped their own onboarding', () => {
    status = { onboardingComplete: false, onboardingSkipped: true };
    renderIndex();
    expect(screen.getByText('Main layout')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Complete Setup' })
    ).toBeInTheDocument();
  });

  it("doesn't offer Complete Setup while acting for someone else", () => {
    isActingOnBehalf = true;
    status = { onboardingComplete: false, onboardingSkipped: true };
    renderIndex();
    expect(
      screen.queryByRole('button', { name: 'Complete Setup' })
    ).not.toBeInTheDocument();
  });
});
