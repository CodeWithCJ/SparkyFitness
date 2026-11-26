import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AboutMeCard } from '@/pages/Settings/Coaches/AboutMeCard';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mutate = jest.fn();
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useUpdateCoachProfile: () => ({ mutate, isPending: false }),
}));

const profile = {
  diet_type: 'vegan',
  tone: 'direct',
  foods_avoid: 'peanuts',
  foods_prefer: 'rice',
  notes: 'Knee pain',
} as never;

beforeEach(() => jest.clearAllMocks());

describe('AboutMeCard', () => {
  it('asks before clearing, and clears nothing on cancel', () => {
    render(<AboutMeCard profile={profile} allergens={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByText('Clear About me?')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mutate).not.toHaveBeenCalled();
  });

  it('clears everything once confirmed', () => {
    render(<AboutMeCard profile={profile} allergens={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    const confirm = screen
      .getAllByRole('button', { name: 'Clear all' })
      .find((b) => b.closest('[role="alertdialog"]'));
    fireEvent.click(confirm!);
    expect(mutate).toHaveBeenCalledWith({
      diet_type: null,
      tone: null,
      foods_avoid: null,
      foods_prefer: null,
      notes: null,
    });
  });
});
