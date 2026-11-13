import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { SharedCycleSettings } from '@workspace/shared';
import type { CycleSwitchState } from '@/hooks/Settings/useWebFeatures';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { FeatureSettings } from '@/pages/Settings/FeatureSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

type CycleTabFields = Pick<SharedCycleSettings, 'mode' | 'discreet_mode'>;
let mockCycle: {
  on: boolean;
  state: CycleSwitchState;
  isPending: boolean;
  needsSetup: boolean;
  settings: CycleTabFields | null | undefined;
};
const mockSetOn = jest.fn();
const mockOpenSetup = jest.fn();
const mockReload = jest.fn();
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    setOn: mockSetOn,
    openSetup: mockOpenSetup,
    reload: mockReload,
  }),
}));

function renderSettings() {
  return render(
    <Accordion type="multiple" defaultValue={['features']}>
      <AccordionItem value="features">
        <FeatureSettings />
      </AccordionItem>
    </Accordion>
  );
}

describe('FeatureSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    mockCycle = {
      on: false,
      state: 'ready',
      isPending: false,
      needsSetup: false,
      settings: null,
    };
  });

  it('lists cycle under Health, with a switch that applies to both apps', () => {
    renderSettings();
    expect(screen.getByText('Health')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Cycle' });
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText('One switch for the website and the mobile app.')
    ).toBeInTheDocument();
  });

  it('turns cycle on', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'Cycle' }));
    expect(mockSetOn).toHaveBeenCalledWith(true);
  });

  it('turns cycle off', () => {
    mockCycle = {
      ...mockCycle,
      on: true,
      settings: { mode: 'standard', discreet_mode: false },
    };
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Cycle' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(mockSetOn).toHaveBeenCalledWith(false);
  });

  it.each(['loading', 'loadFailed'] as const)(
    'cannot be switched while %s',
    (state) => {
      mockCycle = { ...mockCycle, state };
      renderSettings();
      expect(screen.getByRole('switch', { name: 'Cycle' })).toBeDisabled();
    }
  );

  it('cannot be switched while a change is saving', () => {
    mockCycle = { ...mockCycle, isPending: true };
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Cycle' })).toBeDisabled();
  });

  it('offers a retry when the setting could not load', () => {
    mockCycle = { ...mockCycle, state: 'loadFailed' };
    renderSettings();
    expect(
      screen.getByText('Could not load this setting.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('offers to finish the setup while cycle is on but not set up', () => {
    mockCycle = { ...mockCycle, on: true, needsSetup: true };
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Set up' }));
    expect(mockOpenSetup).toHaveBeenCalledTimes(1);
  });

  it('never says Cycle in discreet mode', () => {
    mockCycle = {
      ...mockCycle,
      on: true,
      settings: { mode: 'standard', discreet_mode: true },
    };
    const { container } = renderSettings();
    expect(screen.getByRole('switch', { name: 'Wellness' })).toBeChecked();
    expect(container.textContent).not.toMatch(/cycle|period|fertil|pregnan/i);
  });

  it('shows a note instead of the switches while acting for someone else', () => {
    mockActingOnBehalf = true;
    renderSettings();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(
      screen.getByText('Only the account owner can turn features on or off.')
    ).toBeInTheDocument();
  });
});
