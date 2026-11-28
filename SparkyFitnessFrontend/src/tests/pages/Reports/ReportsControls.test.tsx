import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ReportsControls from '@/pages/Reports/ReportsControls';
import { setWebFeatureChoices } from '@/tests/mocks/webFeatures';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/components/ui/DateRangeWithPresets', () => ({
  DateRangePickerWithPresets: () => <div data-testid="date-range" />,
}));
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
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

beforeEach(() => {
  mockActingOnBehalf = false;
  setWebFeatureChoices({});
});

const baseProps = {
  startDate: '2026-10-01',
  endDate: '2026-10-14',
  onStartDateChange: jest.fn(),
  onEndDateChange: jest.fn(),
  activeTab: 'charts',
  onTabChange: jest.fn(),
};

describe('ReportsControls', () => {
  it('hides the date range when showDateRange is false and lists the Compare tab last', () => {
    const { rerender } = render(
      <ReportsControls {...baseProps} showDateRange />
    );
    expect(screen.getByTestId('date-range')).toBeInTheDocument();
    const tabs = screen.getAllByRole('button');
    expect(tabs[tabs.length - 1]).toHaveTextContent('Compare');

    rerender(
      <ReportsControls
        {...baseProps}
        activeTab="compare"
        showDateRange={false}
      />
    );
    expect(screen.queryByTestId('date-range')).not.toBeInTheDocument();
  });

  const medicationsPill = () =>
    screen.queryByRole('button', { name: 'Medications' });
  const controls = () => (
    <ReportsControls
      {...baseProps}
      activeTab="medications-reports"
      showDateRange
    />
  );

  it('shows the Medications pill only while medications is on (or its choice is loading)', () => {
    const { rerender } = render(controls());
    expect(medicationsPill()).toBeInTheDocument();

    setWebFeatureChoices(undefined);
    rerender(controls());
    expect(medicationsPill()).toBeInTheDocument();

    setWebFeatureChoices({ medications: false });
    rerender(controls());
    expect(medicationsPill()).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Symptoms' })
    ).toBeInTheDocument();
  });

  it("shows the Medications pill to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ medications: false });
    const { rerender } = render(controls());
    expect(medicationsPill()).not.toBeInTheDocument();

    mockActingOnBehalf = true;
    rerender(controls());
    expect(medicationsPill()).toBeInTheDocument();
  });

  const oralCarePill = () =>
    screen.queryByRole('button', { name: 'Oral care' });

  it('shows the Oral care pill only while oral care is on (or its choice is loading)', () => {
    const { rerender } = render(controls());
    expect(oralCarePill()).toBeInTheDocument();

    setWebFeatureChoices(undefined);
    rerender(controls());
    expect(oralCarePill()).toBeInTheDocument();

    setWebFeatureChoices({ oralCare: false });
    rerender(controls());
    expect(oralCarePill()).not.toBeInTheDocument();
    expect(medicationsPill()).toBeInTheDocument();
  });

  it("shows the Oral care pill to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ oralCare: false });
    const { rerender } = render(controls());
    expect(oralCarePill()).not.toBeInTheDocument();

    mockActingOnBehalf = true;
    rerender(controls());
    expect(oralCarePill()).toBeInTheDocument();
  });
});
