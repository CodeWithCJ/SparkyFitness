import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Reports from '@/pages/Reports/Reports';
import {
  setWebFeatureChoices,
  setWebFeatureOn,
} from '@/tests/mocks/webFeatures';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock(
  '@/hooks/Settings/useFeatureChoices',
  () => jest.requireActual('@/tests/mocks/webFeatures').featureChoicesModule
);
jest.mock(
  '@/hooks/useCycle',
  () => jest.requireActual('@/tests/mocks/webFeatures').cycleModule
);
let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: 'user-1',
    isActingOnBehalf: mockActingOnBehalf,
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    formatDateInUserTimezone: () => '2026-11-01',
    loggingLevel: 'ERROR',
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    convertWeight: (value: number) => value,
    convertMeasurement: (value: number) => value,
    weightUnit: 'kg',
    measurementUnit: 'cm',
    showNetCarbs: false,
    nutrientDisplayPreferences: [],
  }),
}));

// Data hooks: everything loaded and empty.
const mockLoaded = () => ({ data: [], isLoading: false });
jest.mock('@/hooks/Settings/useProfile', () => ({
  useProfileQuery: () => ({ data: undefined }),
}));
jest.mock('@/hooks/Foods/useCustomNutrients', () => ({
  useCustomNutrients: () => mockLoaded(),
}));
jest.mock('@/hooks/CheckIn/useMood', () => ({
  useMoodEntries: () => mockLoaded(),
}));
jest.mock('@/hooks/Reports/useReports', () => ({
  useCalorieBalanceRange: () => ({ data: undefined, isLoading: false }),
  useExerciseDashboardData: () => ({ data: undefined, isLoading: false }),
  useRawStressData: () => mockLoaded(),
  useReportsData: () => ({ data: {}, isLoading: false }),
}));
jest.mock('@/hooks/Fasting/useFasting', () => ({
  useFastingDataRange: () => mockLoaded(),
}));
jest.mock('@/hooks/Goals/useGoals', () => ({
  useDailyGoalsRange: () => ({ data: undefined }),
}));
jest.mock('@/pages/Reports/MeasurementChartsGrid', () => ({
  generateReportsMeasurementsDefaultLayouts: () => ({}),
  useMeasurementChartWidgets: () => [],
}));
jest.mock('@/pages/Reports/NutritionChartsGrid', () => ({
  generateReportsNutrientsDefaultLayouts: () => ({}),
  isNutrientWidgetKey: () => false,
  nutrientKeyFromWidgetKey: (key: string) => key,
  useNutritionChartWidgets: () => [],
}));

// Only the Medications report matters here; the other reports are stand-ins.
jest.mock('@/pages/Reports/MedicationReports', () => ({
  __esModule: true,
  default: () => <p>Medication report</p>,
}));
jest.mock('@/components/ui/DateRangeWithPresets', () => ({
  DateRangePickerWithPresets: () => null,
}));
jest.mock('@/pages/Reports/FastingReport', () => ({
  FastingReport: () => null,
}));
jest.mock('@/pages/Symptoms/SymptomsReport', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/ZoomableChart', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/widgets/WidgetGrid', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/ReportsTables', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/ExerciseReportsDashboard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/SleepReport', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/BodyBatteryCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/RespirationCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/GlucoseCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/HeartRateAnalyticsCard', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/StressChart', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/MoodChart', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Reports/OralCareReport', () => ({
  __esModule: true,
  default: () => <p>Oral care report</p>,
}));
jest.mock('@/pages/Reports/CustomCategoryReport', () => ({
  CustomCategoryReport: () => null,
}));
jest.mock('@/pages/Reports/Compare/CompareReport', () => ({
  CompareReport: () => null,
}));
jest.mock('@/utils/reportUtil', () => ({}));

function CurrentSearch() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderReports(tab = 'medications-reports') {
  return render(
    <MemoryRouter initialEntries={[`/reports?tab=${tab}`]}>
      <Reports />
      <CurrentSearch />
    </MemoryRouter>
  );
}

describe('Reports > Medications by address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    setWebFeatureChoices({});
  });

  it('shows the report while medications is on or its choice is loading, not while it is off', () => {
    const { unmount } = renderReports();
    expect(screen.getByText('Medication report')).toBeInTheDocument();
    unmount();

    setWebFeatureChoices(undefined);
    const loading = renderReports();
    expect(screen.getByText('Medication report')).toBeInTheDocument();
    loading.unmount();

    setWebFeatureChoices({ medications: false });
    renderReports();
    expect(screen.queryByText('Medication report')).not.toBeInTheDocument();
  });

  it('says medications is off instead of the report, and keeps the tab', () => {
    setWebFeatureChoices({ medications: false });
    renderReports();
    expect(screen.queryByText('Medication report')).not.toBeInTheDocument();
    expect(screen.getByText('Medications is turned off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Features' })).toHaveAttribute(
      'href',
      '/settings?section=features'
    );
    expect(screen.getByTestId('search')).toHaveTextContent(
      'tab=medications-reports'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(setWebFeatureOn).toHaveBeenCalledWith('medications', true);
  });

  it("shows the report to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ medications: false });
    const owner = renderReports();
    expect(screen.queryByText('Medication report')).not.toBeInTheDocument();
    owner.unmount();

    mockActingOnBehalf = true;
    renderReports();
    expect(screen.getByText('Medication report')).toBeInTheDocument();
  });
});

describe('Reports > Oral care by address', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    setWebFeatureChoices({});
  });

  it('shows the report while oral care is on or its choice is loading, not while it is off', () => {
    const { unmount } = renderReports('oral-care');
    expect(screen.getByText('Oral care report')).toBeInTheDocument();
    unmount();

    setWebFeatureChoices(undefined);
    const loading = renderReports('oral-care');
    expect(screen.getByText('Oral care report')).toBeInTheDocument();
    loading.unmount();

    setWebFeatureChoices({ oralCare: false });
    renderReports('oral-care');
    expect(screen.queryByText('Oral care report')).not.toBeInTheDocument();
  });

  it('says oral care is off instead of the report, and keeps the tab', () => {
    setWebFeatureChoices({ oralCare: false });
    renderReports('oral-care');
    expect(screen.getByText('Oral care is turned off')).toBeInTheDocument();
    expect(screen.getByTestId('search')).toHaveTextContent('tab=oral-care');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(setWebFeatureOn).toHaveBeenCalledWith('oralCare', true);
  });

  it("shows the report to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ oralCare: false });
    mockActingOnBehalf = true;
    renderReports('oral-care');
    expect(screen.getByText('Oral care report')).toBeInTheDocument();
  });
});
