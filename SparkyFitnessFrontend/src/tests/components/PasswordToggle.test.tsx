import { render, screen } from '@testing-library/react';
import PasswordToggle from '@/components/PasswordToggle';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

describe('PasswordToggle', () => {
  it('labels the hidden-password action and positions it at the logical end', () => {
    render(
      <PasswordToggle showPassword={false} passwordToggleHandler={jest.fn()} />
    );

    const button = screen.getByRole('button', { name: 'Show password' });
    expect(button.className).toContain('end-2');
    expect(button.className).not.toContain('right-2');
  });

  it('announces the hide action when the password is visible', () => {
    render(<PasswordToggle showPassword passwordToggleHandler={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy();
  });
});
