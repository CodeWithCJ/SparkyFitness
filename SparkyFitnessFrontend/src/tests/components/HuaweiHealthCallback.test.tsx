import { screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithClient } from '../test-utils';
import HuaweiHealthCallback from '@/pages/Integrations/HuaweiHealthCallback';

const mockCompleteAuthorization = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/hooks/Integrations/useHuaweiHealth', () => ({
  useCompleteHuaweiHealthAuthorizationMutation: () => ({
    mutateAsync: mockCompleteAuthorization,
  }),
}));

function renderCallback(entry: string) {
  return renderWithClient(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          path="/huaweihealth/callback"
          element={<HuaweiHealthCallback />}
        />
        <Route path="/settings" element={<div>Settings destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('HuaweiHealthCallback', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does not exchange a callback that is missing state', async () => {
    renderCallback('/huaweihealth/callback?code=authorization-code');

    expect(
      await screen.findByText('The link request is invalid or expired')
    ).toBeInTheDocument();
    expect(mockCompleteAuthorization).not.toHaveBeenCalled();
  });

  it('handles user cancellation without sending provider text to the API', async () => {
    renderCallback(
      `/huaweihealth/callback?error=access_denied&error_description=${encodeURIComponent(
        '<script>provider detail</script>'
      )}`
    );

    expect(
      await screen.findByText('Authorization cancelled')
    ).toBeInTheDocument();
    expect(screen.queryByText(/provider detail/i)).not.toBeInTheDocument();
    expect(mockCompleteAuthorization).not.toHaveBeenCalled();
  });

  it('exchanges a valid code and state and reports success', async () => {
    mockCompleteAuthorization.mockResolvedValue({ connected: true });
    const state = 'a'.repeat(64);

    renderCallback(
      `/huaweihealth/callback?code=authorization-code&state=${state}`
    );

    await waitFor(() =>
      expect(mockCompleteAuthorization).toHaveBeenCalledWith({
        code: 'authorization-code',
        state,
      })
    );
    expect(
      await screen.findByText('Connected — everything is ready')
    ).toBeInTheDocument();
  });
});
