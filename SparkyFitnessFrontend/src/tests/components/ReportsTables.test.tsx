import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReportsTables, {
  type TableFilterValue,
} from '@/pages/Reports/ReportsTables';
import type { DailyExerciseEntry } from '@/types/reports';
import type {
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
} from '@workspace/shared';

let mockShowNetCarbs = false;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue?: string) => defaultValue ?? _key,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    loggingLevel: 'ERROR',
    dateFormat: 'MMM dd, yyyy',
    formatDateInUserTimezone: () => 'May 15, 2026',
    nutrientDisplayPreferences: [
      {
        view_group: 'report_tabular',
        platform: 'desktop',
        visible_nutrients: ['carbs'],
      },
    ],
    weightUnit: 'lbs',
    measurementUnit: 'in',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
    showNetCarbs: mockShowNetCarbs,
  }),
}));

jest.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
}));

const baseEntry = {
  entry_date: '2026-05-15',
  meal_type: 'breakfast',
  quantity: 1,
  unit: 'g',
  food_name: 'Test Food',
  carbs: 30,
  dietary_fiber: 8,
  calories: 0,
  protein: 0,
  fat: 0,
};

const durationOnlyExerciseEntry = {
  id: 'entry-1',
  entry_date: '2026-05-15',
  duration_minutes: 3,
  calories_burned: 20,
  exercises: { id: 'exercise-1', name: 'Plank' },
  sets: [
    {
      id: 'set-1',
      set_number: 1,
      set_type: 'Working Set',
      reps: null,
      weight: null,
      duration: 45,
    },
  ],
} as unknown as DailyExerciseEntry;

const renderTable = (
  exerciseEntries: DailyExerciseEntry[] = [],
  initialTable: TableFilterValue = 'all'
) => {
  const Wrapper = () => {
    const [selectedTable, setSelectedTable] =
      useState<TableFilterValue>(initialTable);
    return (
      <ReportsTables
        tabularData={[baseEntry]}
        exerciseEntries={exerciseEntries}
        measurementData={[]}
        customCategories={[]}
        customMeasurementsData={[]}
        prData={undefined}
        selectedTable={selectedTable}
        onSelectedTableChange={setSelectedTable}
        onExportFoodDiary={() => {}}
        onExportBodyMeasurements={() => {}}
        onExportCustomMeasurements={() => {}}
        onExportExerciseEntries={() => {}}
        customNutrients={[]}
      />
    );
  };
  return render(<Wrapper />);
};

describe('ReportsTables net carbs', () => {
  beforeEach(() => {
    mockShowNetCarbs = false;
  });

  it('renders the Carbohydrates column with total carbs by default', () => {
    renderTable();
    expect(screen.getByText('Carbohydrates (g)')).toBeInTheDocument();
    const cells = screen.getAllByRole('cell');
    const carbsCell = cells.find((c) => within(c).queryByText('30.0') !== null);
    expect(carbsCell).toBeDefined();
  });

  it('renders the Net Carbs column and subtracts fiber when enabled', () => {
    mockShowNetCarbs = true;
    renderTable();
    expect(screen.getByText('Net Carbs (g)')).toBeInTheDocument();
    expect(screen.queryByText('Carbohydrates (g)')).not.toBeInTheDocument();
    const cells = screen.getAllByRole('cell');
    const netCell = cells.find((c) => within(c).queryByText('22.0') !== null);
    expect(netCell).toBeDefined();
  });
});

describe('ReportsTables duration-only exercise sets', () => {
  it('renders a dash for the rep range instead of a bogus 0 - 0', () => {
    renderTable([durationOnlyExerciseEntry]);

    const cells = screen.getAllByRole('cell');
    expect(cells.some((c) => c.textContent === '-')).toBe(true);
    expect(cells.some((c) => c.textContent?.includes('0 - 0'))).toBe(false);
    expect(cells.some((c) => c.textContent?.includes('NaN'))).toBe(false);
  });

  it('renders dashes for avg weight and tonnage instead of a bogus 0 lbs', () => {
    renderTable([durationOnlyExerciseEntry]);

    const cells = screen.getAllByRole('cell');
    expect(cells.some((c) => c.textContent?.includes('lbs'))).toBe(false);
    // Rep range, avg weight, and tonnage all fall back to the dash.
    expect(
      cells.filter((c) => c.textContent === '-').length
    ).toBeGreaterThanOrEqual(3);
  });
});

describe('ReportsTables table type filter', () => {
  it('renders all tables by default', () => {
    renderTable();
    expect(screen.getByText('Food Diary Table')).toBeInTheDocument();
    expect(screen.getByText('Exercise Entries Table')).toBeInTheDocument();
    expect(screen.getByText('Body Measurements Table')).toBeInTheDocument();
  });

  it('shows only the selected table when a filter is chosen', async () => {
    renderTable();

    fireEvent.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', {
      name: /body measurements/i,
    });
    fireEvent.click(option);

    expect(
      screen.getAllByText('Body Measurements Table').length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Food Diary Table')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Exercise Entries Table')
    ).not.toBeInTheDocument();
  });

  it('shows only the selected custom category when filtered', async () => {
    const customCategory = {
      id: 'cat-hr',
      name: 'Heart Rate',
      display_name: 'Heart Rate',
      measurement_type: 'bpm',
    } as unknown as CustomCategoriesResponse;
    const customMeasurement = {
      category_id: 'cat-hr',
      entry_date: '2026-05-15',
      entry_timestamp: null,
      value: '72',
      notes: null,
    } as unknown as CustomMeasurementsResponse;

    const Wrapper = () => {
      const [selectedTable, setSelectedTable] =
        useState<TableFilterValue>('all');
      return (
        <ReportsTables
          tabularData={[baseEntry]}
          exerciseEntries={[]}
          measurementData={[]}
          customCategories={[customCategory]}
          customMeasurementsData={[customMeasurement]}
          prData={undefined}
          selectedTable={selectedTable}
          onSelectedTableChange={setSelectedTable}
          onExportFoodDiary={() => {}}
          onExportBodyMeasurements={() => {}}
          onExportCustomMeasurements={() => {}}
          onExportExerciseEntries={() => {}}
          customNutrients={[]}
        />
      );
    };
    render(<Wrapper />);

    expect(screen.getByText('Food Diary Table')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    const option = await screen.findByRole('option', {
      name: /heart rate/i,
    });
    fireEvent.click(option);

    expect(screen.queryByText('Food Diary Table')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Exercise Entries Table')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Body Measurements Table')
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByText('Heart Rate (bpm)').length
    ).toBeGreaterThanOrEqual(1);
  });
});
