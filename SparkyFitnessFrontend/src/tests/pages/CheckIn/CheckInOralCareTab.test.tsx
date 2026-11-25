import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import CheckIn from '@/pages/CheckIn/CheckIn';
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
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    convertWeight: (value: number) => value,
    convertMeasurement: (value: number) => value,
  }),
}));
jest.mock('@/hooks/CheckIn/useCheckInLogic', () => ({
  useCheckInLogic: () => ({
    recentMeasurements: [],
    selectedDate: '2026-11-01',
    setSelectedDate: () => {},
    moodCheckins: [],
  }),
}));
jest.mock('@/hooks/CheckIn/useCheckInPhotos', () => ({
  useCheckInPhotoDates: () => [],
}));
jest.mock('@/hooks/Fasting/useFasting', () => ({
  useUpdateFastMutation: () => ({ mutateAsync: jest.fn() }),
}));

// The page's sections, reduced to what this test looks for.
jest.mock('@/components/DayNavigator', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/CheckIn/CheckInForm', () => ({ CheckInForm: () => null }));
jest.mock('@/pages/CheckIn/RecentActivity', () => ({
  RecentActivity: () => null,
}));
jest.mock('@/pages/CheckIn/CheckInTopRow', () => ({
  CheckInTopRow: () => null,
}));
jest.mock('@/pages/CheckIn/CheckInPhotos', () => ({
  CheckInPhotos: () => null,
}));
jest.mock('@/pages/CheckIn/SleepEntrySection', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Symptoms/SymptomsPanel', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Fasting/EditFastDialog', () => ({
  EditFastDialog: () => null,
}));
jest.mock('@/pages/CheckIn/MindfulnessSection', () => ({
  MindfulnessSection: () => null,
}));
jest.mock('@/pages/CheckIn/OralCareSection', () => ({
  OralCareSection: () => <p>Oral care section</p>,
}));

function CurrentSearch() {
  return <p data-testid="search">{useLocation().search}</p>;
}

function renderCheckIn(tab = 'measurements') {
  return render(
    <MemoryRouter initialEntries={[`/checkin?tab=${tab}`]}>
      <CheckIn />
      <CurrentSearch />
    </MemoryRouter>
  );
}

const oralCareTab = () => screen.queryByRole('button', { name: 'Oral care' });

describe('Check-In > Oral care', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    setWebFeatureChoices({});
  });

  it('shows the Oral care tab only while oral care is on (or its choice is loading)', () => {
    const { unmount } = renderCheckIn();
    expect(oralCareTab()).toBeInTheDocument();
    unmount();

    setWebFeatureChoices(undefined);
    const loading = renderCheckIn();
    expect(oralCareTab()).toBeInTheDocument();
    loading.unmount();

    setWebFeatureChoices({ oralCare: false });
    renderCheckIn();
    expect(oralCareTab()).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mindfulness' })
    ).toBeInTheDocument();
  });

  it("shows the Oral care tab to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ oralCare: false });
    mockActingOnBehalf = true;
    renderCheckIn();
    expect(oralCareTab()).toBeInTheDocument();
  });

  it('shows the section by address while oral care is on', () => {
    renderCheckIn('oralCare');
    expect(screen.getByText('Oral care section')).toBeInTheDocument();
  });

  it('says oral care is off instead of the section, and keeps the tab in the address', () => {
    setWebFeatureChoices({ oralCare: false });
    renderCheckIn('oralCare');
    expect(screen.queryByText('Oral care section')).not.toBeInTheDocument();
    expect(screen.getByText('Oral care is turned off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Features' })).toHaveAttribute(
      'href',
      '/settings?section=features'
    );
    expect(screen.getByTestId('search')).toHaveTextContent('tab=oralCare');
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(setWebFeatureOn).toHaveBeenCalledWith('oralCare', true);
  });

  it("shows the section to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ oralCare: false });
    mockActingOnBehalf = true;
    renderCheckIn('oralCare');
    expect(screen.getByText('Oral care section')).toBeInTheDocument();
  });
});
