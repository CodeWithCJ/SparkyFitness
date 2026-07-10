import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnergyCircle } from '@/pages/Diary/EnergyProgressCircle';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string | number>) => {
      if (key === 'units.kcal') return 'سعرة حرارية';
      if (key === 'exercise.dailyProgress.remaining') return 'متبقي';
      if (key === 'exercise.dailyProgress.remainingEnergy') {
        return `متبقي ${options?.['amount']} ${options?.['unit']}`;
      }
      return key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: jest.fn(),
  },
}));

describe('EnergyCircle', () => {
  it('exposes localized remaining energy as a progress indicator', () => {
    render(<EnergyCircle remaining={500} progress={60} unit="kcal" />);

    expect(
      screen.getByRole('progressbar', {
        name: 'متبقي 500 سعرة حرارية',
      })
    ).toHaveAttribute('aria-valuenow', '60');
    expect(screen.getByText(/سعرة حرارية/)).toBeInTheDocument();
  });

  it('clamps invalid visual progress values to the supported range', () => {
    const { rerender } = render(
      <EnergyCircle remaining={500} progress={-20} unit="kcal" />
    );

    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '0'
    );

    rerender(<EnergyCircle remaining={0} progress={140} unit="kcal" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '100'
    );
  });
});
