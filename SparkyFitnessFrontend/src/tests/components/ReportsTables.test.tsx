import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReportsTables from '@/pages/Reports/ReportsTables';

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

const renderTable = () =>
  render(
    <ReportsTables
      tabularData={[baseEntry]}
      exerciseEntries={[]}
      measurementData={[]}
      customCategories={[]}
      customMeasurementsData={[]}
      prData={undefined}
      onExportFoodDiary={() => {}}
      onExportBodyMeasurements={() => {}}
      onExportCustomMeasurements={() => {}}
      onExportExerciseEntries={() => {}}
      customNutrients={[]}
    />
  );

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
