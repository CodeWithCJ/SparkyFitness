import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthenticationSettings from '@/pages/Admin/AuthenticationSettings';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
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
  } as unknown as ReturnType<typeof useUpdateSettings>);
  render(<AuthenticationSettings />);
  fireEvent.click(screen.getByText('Login Management'));
}

describe('AuthenticationSettings passkey switch', () => {
  afterEach(() => jest.clearAllMocks());

  it('turns passkey login off', () => {
    renderWith({ enable_passkey_login: true });
    const toggle = screen.getByRole('switch', { name: 'Enable Passkey Login' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enable_passkey_login: false }),
      expect.anything()
    );
  });

  it('shows passkey login as on when the server does not report it', () => {
    renderWith({});
    expect(
      screen.getByRole('switch', { name: 'Enable Passkey Login' })
    ).toBeChecked();
  });

  it('locks the switch when the environment manages it', () => {
    renderWith({
      enable_passkey_login: false,
      is_passkey_login_env_configured: true,
    });
    expect(
      screen.getByRole('switch', { name: 'Enable Passkey Login' })
    ).toBeDisabled();
    expect(screen.getAllByText('Managed by Env')).toHaveLength(1);
  });

  it('shows how to force passkey login back on', () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn() } });
    renderWith({ enable_passkey_login: false });
    expect(
      screen.getByText('SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true')
    ).toBeInTheDocument();
    const passkeyFailSafe = screen.getByText(
      'SPARKY_FITNESS_FORCE_PASSKEY_LOGIN=true'
    );
    fireEvent.click(passkeyFailSafe.querySelector('button')!);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'SPARKY_FITNESS_FORCE_PASSKEY_LOGIN=true'
    );
  });
});
