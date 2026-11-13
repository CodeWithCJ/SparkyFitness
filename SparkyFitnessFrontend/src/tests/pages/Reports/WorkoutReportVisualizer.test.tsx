import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutReportVisualizer from '@/pages/Reports/WorkoutReportVisualizer';
import type { WorkoutData } from '@/types/reports';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    convertWeight: (value: number, from: string, to: string) =>
      from === to ? value : from === 'lbs' ? value * 0.453592 : value,
  }),
}));

jest.mock('@/pages/Reports/SetPerformanceAnalysisChart', () => ({
  __esModule: true,
  default: () => null,
}));

// Garmin sends weightValue -1 on steps that have no weight set.
const workoutData = {
  workoutName: 'Mixed',
  sportType: { sportTypeKey: 'strength_training' },
  workoutSegments: [
    {
      workoutSteps: [
        {
          type: 'ExecutableStepDTO',
          exerciseName: 'BENCH_PRESS',
          weightValue: 20,
          weightUnit: { unitKey: 'kilogram' },
          endCondition: { conditionTypeKey: 'reps' },
          endConditionValue: 10,
        },
        {
          type: 'ExecutableStepDTO',
          exerciseName: 'PUSH_UP',
          weightValue: -1,
          weightUnit: { unitKey: 'kilogram' },
          endCondition: { conditionTypeKey: 'reps' },
          endConditionValue: 10,
        },
      ],
    },
  ],
} as unknown as WorkoutData;

describe('WorkoutReportVisualizer "no weight" placeholder', () => {
  it('ignores weightValue -1 in total volume and the steps table', () => {
    render(<WorkoutReportVisualizer workoutData={workoutData} />);

    // 20 kg x 10 reps only; the -1 step must not subtract 10.
    expect(screen.getByText('200 kg')).toBeInTheDocument();
    expect(screen.getAllByText('20 kg').length).toBeGreaterThan(0);
    const pushUpRow = screen.getByText('PUSH_UP').closest('tr') as HTMLElement;
    const weightCell = within(pushUpRow).getAllByRole('cell').at(-1);
    expect(weightCell).toHaveTextContent('N/A');

    // Only the weighted step gets a personal-record card.
    expect(screen.getByText(/PRs - BENCH_PRESS/)).toBeInTheDocument();
    expect(screen.queryByText(/PRs - PUSH_UP/)).not.toBeInTheDocument();
  });
});
