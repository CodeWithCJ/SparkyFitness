import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SymptomsPanel from '@/pages/Symptoms/SymptomsPanel';
import { setWebFeatureChoices } from '@/tests/mocks/webFeatures';

const useMedications = jest.fn();
const hasPermission = jest.fn();
let mockActingOnBehalf = false;

jest.mock('@/hooks/useMedications', () => ({
  useMedications: (...args: unknown[]) => useMedications(...args),
}));

jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    hasPermission,
    isActingOnBehalf: mockActingOnBehalf,
  }),
}));
jest.mock(
  '@/hooks/Settings/useFeatureChoices',
  () => jest.requireActual('@/tests/mocks/webFeatures').featureChoicesModule
);
jest.mock(
  '@/hooks/useCycle',
  () => jest.requireActual('@/tests/mocks/webFeatures').cycleModule
);

// Only the hand-off matters here; the hub has its own tests.
jest.mock('@/pages/Symptoms/SymptomsHub', () => ({
  __esModule: true,
  default: (props: { meds: { id: string }[]; selectedDate: string }) => (
    <div data-testid="hub">
      {props.selectedDate}:{props.meds.map((m) => m.id).join(',')}
    </div>
  ),
}));

beforeEach(() => {
  useMedications.mockReset();
  hasPermission.mockReset();
  mockActingOnBehalf = false;
  setWebFeatureChoices({});
});

describe('SymptomsPanel', () => {
  it('loads medications for someone who may see them', () => {
    hasPermission.mockReturnValue(true);
    useMedications.mockReturnValue({ data: [{ id: 'm1' }] });
    render(
      <SymptomsPanel selectedDate="2026-09-29" onDateChange={jest.fn()} />
    );
    expect(hasPermission).toHaveBeenCalledWith('can_manage_medications');
    expect(useMedications).toHaveBeenCalledWith(
      { activeOnly: true },
      { enabled: true }
    );
    expect(screen.getByTestId('hub')).toHaveTextContent('2026-09-29:m1');
  });

  it('does not request medications for a delegate who has only the symptoms permission', () => {
    hasPermission.mockReturnValue(false);
    useMedications.mockReturnValue({ data: undefined });
    render(
      <SymptomsPanel selectedDate="2026-09-29" onDateChange={jest.fn()} />
    );
    expect(useMedications).toHaveBeenCalledWith(
      { activeOnly: true },
      { enabled: false }
    );
    expect(screen.getByTestId('hub')).toHaveTextContent('2026-09-29:');
  });

  const renderPanel = () =>
    render(
      <SymptomsPanel selectedDate="2026-09-29" onDateChange={jest.fn()} />
    );

  it('offers medications only while medications is on (or its choice is loading)', () => {
    hasPermission.mockReturnValue(true);
    useMedications.mockReturnValue({ data: [{ id: 'm1' }] });
    setWebFeatureChoices(undefined);
    renderPanel().unmount();
    expect(useMedications).toHaveBeenLastCalledWith(
      { activeOnly: true },
      { enabled: true }
    );

    setWebFeatureChoices({ medications: false });
    // Medications another page already loaded stay out too.
    renderPanel();
    expect(useMedications).toHaveBeenLastCalledWith(
      { activeOnly: true },
      { enabled: false }
    );
    expect(screen.getByTestId('hub')).toHaveTextContent(/^2026-09-29:$/);
  });

  it("offers medications to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ medications: false });
    hasPermission.mockReturnValue(true);
    useMedications.mockReturnValue({ data: [{ id: 'm1' }] });
    renderPanel().unmount();
    expect(useMedications).toHaveBeenLastCalledWith(
      { activeOnly: true },
      { enabled: false }
    );

    mockActingOnBehalf = true;
    renderPanel();
    expect(useMedications).toHaveBeenLastCalledWith(
      { activeOnly: true },
      { enabled: true }
    );
    expect(screen.getByTestId('hub')).toHaveTextContent('2026-09-29:m1');
  });
});
