import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SharedCycleSettings } from '@workspace/shared';
import type { CycleSwitchState } from '@/hooks/Settings/useWebFeatures';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import CycleSettings from '@/pages/Settings/CycleSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

let mockSettings: SharedCycleSettings | null = null;
const mockUpsert = jest.fn();
jest.mock('@/hooks/useCycle', () => ({
  useCycleSettings: () => ({ data: mockSettings, isLoading: false }),
  useUpsertCycleSettingsMutation: () => ({ mutateAsync: mockUpsert }),
  useCycleExportMutation: () => ({ mutateAsync: jest.fn() }),
}));

let mockCycle: {
  on: boolean;
  state: CycleSwitchState;
  isPending: boolean;
  needsSetup: boolean;
};
const mockSetOn = jest.fn();
const mockOpenSetup = jest.fn();
const mockReload = jest.fn();
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    settings: mockSettings,
    setOn: mockSetOn,
    openSetup: mockOpenSetup,
    reload: mockReload,
  }),
}));

const cycleRow = (
  overrides: Partial<SharedCycleSettings> = {}
): SharedCycleSettings => ({
  enabled: true,
  mode: 'ttc',
  luteal_phase_length: 14,
  birth_control_method: 'none',
  conditions: [],
  show_fertile_window: true,
  preferred_products: [],
  dismissed_prompts: [],
  terminology: 'default',
  discreet_mode: false,
  onboarded_at: '2026-10-01T00:00:00.000Z',
  ...overrides,
});

function renderSettings() {
  return render(
    <Accordion type="multiple" defaultValue={['cycle-settings']}>
      <AccordionItem value="cycle-settings">
        <CycleSettings />
      </AccordionItem>
    </Accordion>
  );
}

const saveButton = () =>
  screen.queryByRole('button', { name: 'Save Preferences' });
const resetButton = () =>
  screen.queryByRole('button', { name: 'Reset & Re-run Onboarding' });

describe('CycleSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpsert.mockResolvedValue(cycleRow());
    mockSettings = null;
    mockCycle = {
      on: false,
      state: 'ready',
      isPending: false,
      needsSetup: false,
    };
  });

  it('writes nothing for someone who never set cycle up, except through the switch', () => {
    renderSettings();
    expect(saveButton()).not.toBeInTheDocument();
    expect(resetButton()).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable Cycle & Pregnancy Tracking' })
    );
    expect(mockSetOn).toHaveBeenCalledWith(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('keeps Save and Reset away while cycle is turned off', () => {
    mockSettings = cycleRow({ enabled: false });
    renderSettings();
    expect(saveButton()).not.toBeInTheDocument();
    expect(resetButton()).not.toBeInTheDocument();
  });

  it('saves the details without turning cycle on or marking it set up', async () => {
    mockSettings = cycleRow();
    mockCycle = { ...mockCycle, on: true };
    renderSettings();

    fireEvent.click(saveButton()!);

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(1));
    const body = mockUpsert.mock.calls[0][0];
    expect(body).toMatchObject({ mode: 'ttc' });
    expect(body).not.toHaveProperty('enabled');
    expect(body).not.toHaveProperty('mark_onboarded');
  });

  it('offers Reset once cycle is set up', () => {
    mockSettings = cycleRow();
    mockCycle = { ...mockCycle, on: true };
    renderSettings();
    expect(resetButton()).toBeInTheDocument();
  });

  it('offers to finish the setup instead of the details while cycle is on but not set up', () => {
    mockSettings = cycleRow({ onboarded_at: null });
    mockCycle = { ...mockCycle, on: true, needsSetup: true };
    renderSettings();
    expect(saveButton()).not.toBeInTheDocument();
    expect(resetButton()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(mockOpenSetup).toHaveBeenCalledTimes(1);
  });

  it('shows an error with Retry, and nothing to save, when the settings could not load', () => {
    mockSettings = null;
    mockCycle = { ...mockCycle, state: 'loadFailed' };
    renderSettings();
    expect(saveButton()).not.toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Enable Cycle & Pregnancy Tracking' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
