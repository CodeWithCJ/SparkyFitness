import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PregnancyVitals } from '@/hooks/usePregnancy';
import VitalsCard from '@/pages/Cycle/pregnancy/VitalsCard';
import { setWebFeatureChoices } from '@/tests/mocks/webFeatures';

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
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));
const mockMutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
});
jest.mock('@/hooks/useMedications', () => ({
  useCreateMedicationEntryMutation: () => mockMutation(),
  useDeleteMedicationEntryMutation: () => mockMutation(),
}));
jest.mock('@/hooks/CheckIn/useCheckIn', () => ({
  useSaveCheckInMeasurementsMutation: () => mockMutation(),
  useCreateCustomCategoryMutation: () => mockMutation(),
  useSaveCustomMeasurementMutation: () => mockMutation(),
  useCustomCategories: () => ({ data: [] }),
}));

const vitals: PregnancyVitals = {
  latestWeight: null,
  prePregnancyWeight: null,
  height: null,
  prePregnancyBmi: null,
  weightDelta: null,
  weightGainStatus: null,
  gainRange: null,
  bpValue: null,
  prenatalMedication: {
    id: 'med-1',
    name: 'Prenatal multivitamin',
    entryId: null,
    loggedToday: false,
  },
  supplementMedication: null,
};

function renderCard() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VitalsCard pregnancyId="p-1" vitals={vitals} date="2026-11-22" />
    </QueryClientProvider>
  );
}

describe('VitalsCard prenatal supplements', () => {
  beforeEach(() => {
    mockActingOnBehalf = false;
    setWebFeatureChoices({});
  });

  it('shows them only while medications is on (or its choice is loading)', () => {
    const on = renderCard();
    expect(screen.getByText('Prenatal Supplements')).toBeInTheDocument();
    expect(screen.getByText('Prenatal multivitamin')).toBeInTheDocument();
    on.unmount();

    setWebFeatureChoices(undefined);
    const loading = renderCard();
    expect(screen.getByText('Prenatal Supplements')).toBeInTheDocument();
    loading.unmount();

    setWebFeatureChoices({ medications: false });
    renderCard();
    expect(screen.queryByText('Prenatal Supplements')).not.toBeInTheDocument();
    expect(screen.queryByText('Prenatal multivitamin')).not.toBeInTheDocument();
    expect(screen.getByText('Maternal Weight')).toBeInTheDocument();
  });

  it("shows them to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ medications: false });
    const owner = renderCard();
    expect(screen.queryByText('Prenatal Supplements')).not.toBeInTheDocument();
    owner.unmount();

    mockActingOnBehalf = true;
    renderCard();
    expect(screen.getByText('Prenatal Supplements')).toBeInTheDocument();
  });
});
