import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MagicLinkRequestDialog } from '@/pages/Auth/MagicLinkRequestDialog';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

describe('MagicLinkRequestDialog', () => {
  it('exposes an accessible dialog and submits the requested email', async () => {
    const onClose = jest.fn();
    const onRequest = jest.fn().mockResolvedValue(undefined);

    render(
      <MagicLinkRequestDialog
        onClose={onClose}
        onRequest={onRequest}
        loading={false}
        initialEmail="user@example.com"
      />
    );

    expect(
      screen.getByRole('dialog', { name: 'Email me a sign-in link' })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

    await waitFor(() => {
      expect(onRequest).toHaveBeenCalledWith('user@example.com');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
