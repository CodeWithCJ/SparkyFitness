import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { SharedCycleSettings } from '@workspace/shared';
import type { CycleSwitchState } from '@/hooks/Settings/useWebFeatures';
import CyclePage from '@/pages/Cycle/CyclePage';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockCycle: {
  on: boolean;
  state: CycleSwitchState;
  isPending: boolean;
  settings: SharedCycleSettings | null | undefined;
};
const mockSetOn = jest.fn();
const mockReload = jest.fn();
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    needsSetup: false,
    setOn: mockSetOn,
    openSetup: jest.fn(),
    reload: mockReload,
  }),
}));

jest.mock('@/pages/Cycle/CycleOnboarding', () => ({
  __esModule: true,
  default: () => <div>Setup wizard</div>,
}));
jest.mock('@/pages/Cycle/CycleToday', () => ({
  __esModule: true,
  default: () => <div>Cycle today</div>,
}));
jest.mock('@/pages/Cycle/pregnancy/PregnancyToday', () => ({
  __esModule: true,
  default: () => <div>Pregnancy today</div>,
}));
jest.mock('@/pages/Cycle/CycleInsights', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/pages/Cycle/care/CareHub', () => ({
  __esModule: true,
  default: () => null,
}));

const cycleRow = (
  overrides: Partial<SharedCycleSettings> = {}
): SharedCycleSettings => ({
  enabled: true,
  mode: 'standard',
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <CyclePage />
    </MemoryRouter>
  );

describe('CyclePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCycle = { on: false, state: 'ready', isPending: false, settings: null };
  });

  it('shows the setup wizard to someone who never set cycle up', () => {
    renderPage();
    expect(screen.getByText('Setup wizard')).toBeInTheDocument();
  });

  it('shows the hub while cycle is on and set up', () => {
    mockCycle = { ...mockCycle, on: true, settings: cycleRow() };
    renderPage();
    expect(screen.getByText('Cycle today')).toBeInTheDocument();
  });

  it('keeps the wizard while cycle is on but its setup is not finished', () => {
    mockCycle = {
      ...mockCycle,
      on: true,
      settings: cycleRow({ onboarded_at: null }),
    };
    renderPage();
    expect(screen.getByText('Setup wizard')).toBeInTheDocument();
  });

  it('offers to turn cycle back on, without the wizard, once it was set up', () => {
    mockCycle = { ...mockCycle, settings: cycleRow({ enabled: false }) };
    renderPage();
    expect(screen.queryByText('Setup wizard')).not.toBeInTheDocument();
    expect(screen.queryByText('Cycle today')).not.toBeInTheDocument();
    expect(screen.getByText('Cycle is turned off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Features' })).toHaveAttribute(
      'href',
      '/settings?section=features'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(mockSetOn).toHaveBeenCalledWith(true);
  });

  it('never says Cycle on that notice in discreet mode', () => {
    mockCycle = {
      ...mockCycle,
      settings: cycleRow({ enabled: false, discreet_mode: true }),
    };
    const { container } = renderPage();
    expect(screen.getByText('Wellness is turned off')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/cycle/i);
  });

  it('cannot turn cycle on twice while it is turning on', () => {
    mockCycle = {
      ...mockCycle,
      isPending: true,
      settings: cycleRow({ enabled: false }),
    };
    renderPage();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('shows an error with Retry, never the wizard, when the settings could not load', () => {
    mockCycle = { ...mockCycle, state: 'loadFailed', settings: undefined };
    renderPage();
    expect(screen.queryByText('Setup wizard')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });
});
