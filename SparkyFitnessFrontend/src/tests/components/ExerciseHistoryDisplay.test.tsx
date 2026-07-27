import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseHistoryDisplay from '@/components/ExerciseHistoryDisplay';
import type { ExerciseEntryResponse } from '@workspace/shared';

let mockHistory: unknown[] = [];

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    convertWeight: (value: number) => value,
    distanceUnit: 'km',
    convertDistance: (value: number) => value,
  }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useExerciseHistory: () => ({ data: mockHistory, isLoading: false }),
}));

const makeEntry = (sets: unknown[]) =>
  ({
    id: 'entry-1',
    entry_date: '2026-01-05',
    notes: null,
    sets,
  }) as unknown as ExerciseEntryResponse;

const renderExpanded = () => {
  const view = render(<ExerciseHistoryDisplay exerciseId="exercise-1" />);
  fireEvent.click(screen.getByText('Last {{limit}} Entries'));
  return view;
};

const setChips = (container: HTMLElement) =>
  container.querySelectorAll('span.bg-background');

describe('ExerciseHistoryDisplay set chips', () => {
  it('renders reps and weight together for a strength set', () => {
    mockHistory = [makeEntry([{ reps: 10, weight: 20, duration: null }])];
    renderExpanded();

    expect(screen.getByText('10x20.0kg')).toBeInTheDocument();
  });

  it('renders seconds for a duration-only set instead of a null weight chip', () => {
    mockHistory = [makeEntry([{ reps: null, weight: null, duration: 45 }])];
    renderExpanded();

    expect(screen.getByText('45s')).toBeInTheDocument();
    expect(screen.queryByText(/nullx/)).not.toBeInTheDocument();
  });

  it('renders reps alone when a set has no weight', () => {
    mockHistory = [makeEntry([{ reps: 12, weight: null, duration: null }])];
    renderExpanded();

    expect(screen.getByText('12 reps')).toBeInTheDocument();
  });

  it('renders duration and distance together for a cardio set', () => {
    mockHistory = [
      makeEntry([{ reps: null, weight: null, duration: 1800, distance: 5.2 }]),
    ];
    renderExpanded();

    expect(screen.getByText('1800s \u00b7 5.20km')).toBeInTheDocument();
  });

  it('rounds float-tailed distances from unit conversion', () => {
    mockHistory = [
      makeEntry([
        { reps: null, weight: null, duration: 1800, distance: 4.988966 },
      ]),
    ];
    renderExpanded();

    expect(screen.getByText('1800s \u00b7 4.99km')).toBeInTheDocument();
  });

  it('skips a set with nothing recorded', () => {
    mockHistory = [
      makeEntry([
        { reps: null, weight: null, duration: null },
        { reps: 8, weight: 40, duration: null },
      ]),
    ];
    const { container } = renderExpanded();

    expect(setChips(container)).toHaveLength(1);
    expect(screen.getByText('8x40.0kg')).toBeInTheDocument();
  });
});
