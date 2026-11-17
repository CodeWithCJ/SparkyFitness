import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { format, parseISO } from 'date-fns';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { CardioSessionList } from '@/components/ExerciseCharts/CardioSessionList';
import { useExerciseActivities } from '@/hooks/Reports/useExerciseStats';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: (unit: string) => unit,
  }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue,
  }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ activeUserId: 'user-1' }),
}));
jest.mock('@/hooks/Reports/useExerciseStats', () => ({
  useExerciseActivities: jest.fn(),
}));
jest.mock('@/pages/Reports/ActivityReportVisualizer', () => ({
  __esModule: true,
  default: () => null,
}));

const session = (id: string, name: string): ExerciseActivityQueryItem =>
  ({
    id,
    exerciseName: name,
    entryDate: '2026-08-04',
    distanceFormatted: 5,
    caloriesBurned: 0,
    durationMinutes: 30,
    source: 'garmin',
  }) as unknown as ExerciseActivityQueryItem;

// Two pages for January, one page for February.
const PAGES: Record<string, ExerciseActivityQueryItem[][]> = {
  '2026-01-01': [
    [session('a', 'January run')],
    [session('b', 'Older January run')],
  ],
  '2026-02-01': [
    [session('c', 'February run')],
    [session('d', 'Older February run')],
  ],
};

(useExerciseActivities as jest.Mock).mockImplementation(
  (
    startDate: string,
    _end: string,
    _user: string,
    _units: string,
    page: number
  ) => {
    const pages = PAGES[startDate] ?? [];
    return {
      data: {
        items: pages[page - 1] ?? [],
        page,
        totalPages: pages.length,
      },
      isLoading: false,
    };
  }
);

const renderList = (startDate: string) => (
  <CardioSessionList
    startDate={startDate}
    endDate="2026-12-31"
    unitSystem="metric"
    formatDate={(date, fmt) => format(date, fmt)}
    parseISO={parseISO}
  />
);

describe('CardioSessionList', () => {
  it('drops older pages from the previous date range', () => {
    const { rerender } = render(renderList('2026-01-01'));
    fireEvent.click(screen.getByText('Older sessions'));
    expect(screen.getByText('January run')).toBeInTheDocument();
    expect(screen.getByText('Older January run')).toBeInTheDocument();

    // Same component instance, new range: no remount to clear its state.
    rerender(renderList('2026-02-01'));

    expect(screen.queryByText('January run')).not.toBeInTheDocument();
    expect(screen.queryByText('Older January run')).not.toBeInTheDocument();
    expect(screen.getByText('February run')).toBeInTheDocument();
    expect(screen.queryByText('Older February run')).not.toBeInTheDocument();
  });
});
