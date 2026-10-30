import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AuthenticationSettings from '@/pages/Admin/AuthenticationSettings';
import { useSettings, useUpdateSettings } from '@/hooks/Admin/useSettings';
import { toast } from '@/hooks/use-toast';

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

describe('AuthenticationSettings MCP OAuth settings', () => {
  afterEach(() => jest.clearAllMocks());

  it('warns that approved applications receive write access', () => {
    renderWith({ mcp_oauth_enabled: false, mcp_oauth_available: true });

    expect(
      screen.getByText(/full MCP access, including tools that can write/i)
    ).toBeInTheDocument();
  });

  it('disables the switch and explains when the public URL is unsupported', () => {
    renderWith({
      mcp_oauth_enabled: false,
      mcp_oauth_available: false,
      mcp_oauth_unavailable_reason: 'Public HTTPS is required.',
    });

    expect(
      screen.getByRole('switch', { name: 'Remote MCP OAuth' })
    ).toBeDisabled();
    expect(screen.getByText('Public HTTPS is required.')).toBeInTheDocument();
  });

  it('saves one trimmed redirect allowlist entry per line', () => {
    renderWith({
      mcp_oauth_allowed_redirect_uris: [
        'https://claude.ai/api/mcp/auth_callback',
      ],
    });
    fireEvent.change(screen.getByLabelText('Allowed OAuth redirect URIs'), {
      target: {
        value:
          'https://claude.com/api/mcp/auth_callback\n\nhttp://localhost:*  ',
      },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save OAuth redirect allowlist' })
    );

    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        mcp_oauth_allowed_redirect_uris: [
          'https://claude.com/api/mcp/auth_callback',
          'http://localhost:*',
        ],
      }),
      expect.anything()
    );
  });
});

describe('AuthenticationSettings release check switch', () => {
  afterEach(() => jest.clearAllMocks());

  it('turns the release check off', () => {
    renderWith({ enable_version_check: true });
    const toggle = screen.getByRole('switch', {
      name: 'Check for New Releases',
    });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enable_version_check: false }),
      expect.anything()
    );
  });

  it('shows the release check as on when the server does not report it', () => {
    renderWith({});
    expect(
      screen.getByRole('switch', { name: 'Check for New Releases' })
    ).toBeChecked();
  });

  it('turns the release check back on', () => {
    renderWith({ enable_version_check: false });
    const toggle = screen.getByRole('switch', {
      name: 'Check for New Releases',
    });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enable_version_check: true }),
      expect.anything()
    );
  });

  const saveCallbacks = () =>
    updateSettings.mock.calls[0][1] as {
      onSuccess: () => void;
      onError: () => void;
    };

  it('confirms a release check change with its own message', () => {
    renderWith({ enable_version_check: true });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Check for New Releases' })
    );
    saveCallbacks().onSuccess();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Release check setting updated successfully.',
      })
    );
  });

  it('reports a failed release check save with its own message', () => {
    renderWith({ enable_version_check: true });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Check for New Releases' })
    );
    saveCallbacks().onError();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Failed to save the release check setting.',
        variant: 'destructive',
      })
    );
  });

  it('keeps the login message for the login switches', () => {
    renderWith({ enable_passkey_login: true });
    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable Passkey Login' })
    );
    saveCallbacks().onSuccess();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Login setting updated successfully.',
      })
    );
  });
});
