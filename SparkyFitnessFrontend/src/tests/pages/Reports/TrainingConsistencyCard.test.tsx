import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TrainingConsistency } from '@workspace/shared';
import TrainingConsistencyCard from '@/pages/Reports/TrainingConsistencyCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      options?: string | { count?: number; defaultValue?: string }
    ) => {
      if (typeof options === 'string') return options;
      return (options?.defaultValue ?? _key).replace(
        '{{count}}',
        String(options?.count ?? '')
      );
    },
  }),
}));

const DATA: TrainingConsistency = {
  today: '2026-10-02',
  firstDayOfWeek: 1,
  weeks: [
    { weekStart: '2026-09-21', workoutDays: 2 },
    { weekStart: '2026-09-28', workoutDays: 1 },
  ],
  trainingDays: ['2026-09-22', '2026-09-24', '2026-10-01'],
  weeklyStreak: { current: 2, longest: 5 },
  muscleSets: {
    thisWeek: { Chest: 8 },
    lastWeek: { Chest: 10, Back: 6 },
  },
};

describe('TrainingConsistencyCard', () => {
  it('shows the streaks, this week and a row per muscle trained in either week', () => {
    render(<TrainingConsistencyCard data={DATA} />);

    expect(screen.getByText('Training Consistency')).toBeInTheDocument();
    expect(screen.getByText('2 weeks')).toBeInTheDocument();
    expect(screen.getByText('5 weeks')).toBeInTheDocument();
    expect(screen.getByText('1 days')).toBeInTheDocument();
    expect(screen.getAllByTestId('consistency-week-bar')).toHaveLength(2);
    expect(screen.getByText('Chest')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
    // Most sets this week first.
    const muscles = screen.getAllByRole('row').slice(1);
    expect(muscles[0]).toHaveTextContent('Chest');
    expect(muscles[1]).toHaveTextContent('Back');
  });

  it('says when no sets were logged this week or last', () => {
    render(
      <TrainingConsistencyCard
        data={{ ...DATA, muscleSets: { thisWeek: {}, lastWeek: {} } }}
      />
    );
    expect(
      screen.getByText('No sets logged this week or last.')
    ).toBeInTheDocument();
  });

  it('renders nothing until the data arrives', () => {
    const { container } = render(<TrainingConsistencyCard data={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
