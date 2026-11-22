import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ChallengesSettings } from '@/pages/Admin/ChallengesSettings';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/Admin/useSettings', () => ({
  useSettings: jest.fn(),
  useUpdateSettings: jest.fn(),
}));

const updateSettings = jest.fn();

function renderWith(settings: Record<string, unknown>) {
  jest.mocked(useSettings).mockReturnValue({
    data: {
      enable_email_password_login: true,
      is_oidc_active: false,
      is_mfa_mandatory: false,
      allow_openfoodfacts_contributions: false,
      ...settings,
    },
    isLoading: false,
  } as unknown as ReturnType<typeof useSettings>);
  jest.mocked(useUpdateSettings).mockReturnValue({
    mutate: updateSettings,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateSettings>);
  render(<ChallengesSettings />);
  return screen.getByRole('switch', {
    name: 'Allow challenges and group leaderboards on this server',
  });
}

describe('ChallengesSettings', () => {
  afterEach(() => jest.clearAllMocks());

  it('turns Challenges off for the whole server, keeping the other settings', () => {
    const toggle = renderWith({ enable_challenges: true });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enable_challenges: false,
        enable_email_password_login: true,
      })
    );
  });

  it('shows the switch as on when the server does not report it (the default)', () => {
    expect(renderWith({})).toBeChecked();
  });

  it('turns Challenges back on', () => {
    fireEvent.click(renderWith({ enable_challenges: false }));
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enable_challenges: true })
    );
  });
});
