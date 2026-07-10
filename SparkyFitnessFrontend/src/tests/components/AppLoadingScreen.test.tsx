import { render, screen } from '@testing-library/react';
import { AppLoadingScreen } from '@/components/AppLoadingScreen';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

describe('AppLoadingScreen', () => {
  it('announces localized loading progress', () => {
    render(<AppLoadingScreen messageKey="common.loadingAccount" />);

    expect(
      screen.getByRole('status', { name: '[common.loadingAccount]' })
    ).toBeTruthy();
    expect(screen.getByText('[common.loadingAccount]')).toBeTruthy();
  });
});
