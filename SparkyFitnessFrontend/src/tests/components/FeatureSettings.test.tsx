import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { FeatureKey, SharedCycleSettings } from '@workspace/shared';
import type { FeatureChoiceState } from '@/hooks/Settings/useFeatureChoices';
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
let mockFeaturesOff = new Set<FeatureKey>();
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useCycleSwitch: () => ({
    ...mockCycle,
    setOn: mockSetOn,
    openSetup: mockOpenSetup,
    reload: mockReload,
  }),
  useWebFeatures: () => ({
    isEnabled: (key: FeatureKey) => !mockFeaturesOff.has(key),
  }),
}));

let mockChoice: { state: FeatureChoiceState; isPending: boolean };
const mockSetFeatureOn = jest.fn();
const mockReloadChoices = jest.fn();
jest.mock('@/hooks/Settings/useFeatureChoices', () => ({
  useSetWebFeatureChoice: () => ({
    ...mockChoice,
    setFeatureOn: mockSetFeatureOn,
    reload: mockReloadChoices,
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
    mockFeaturesOff = new Set();
    mockChoice = { state: 'ready', isPending: false };
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
    'names nothing while cycle settings are %s, as discreet mode is not known yet',
    (state) => {
      mockCycle = { ...mockCycle, state, settings: undefined };
      const { container } = renderSettings();
      expect(
        screen.queryByRole('switch', { name: /cycle|wellness|pregnan/i })
      ).not.toBeInTheDocument();
      expect(container.textContent).not.toMatch(/cycle|period|fertil|pregnan/i);
    }
  );

  it('lists lab results under Health, on by default, for this website only', () => {
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Lab results' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    // One line per feature switched on this website only.
    expect(
      screen.getAllByText(
        'Only this website. The mobile app has its own switch.'
      )
    ).toHaveLength(3);
  });

  it('lists medications under Health, on by default, for this website only', () => {
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Medications' });
    expect(toggle).toBeChecked();
    expect(toggle).toBeEnabled();
    expect(
      screen.getByText(
        'Medications, supplements and GLP-1 tracking. Supplement nutrients still count in your totals.'
      )
    ).toBeInTheDocument();
  });

  it('turns medications off on this website, and back on', () => {
    const { unmount } = renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'Medications' }));
    expect(mockSetFeatureOn).toHaveBeenCalledWith('medications', false);
    unmount();

    mockFeaturesOff = new Set<FeatureKey>(['medications']);
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Medications' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(mockSetFeatureOn).toHaveBeenLastCalledWith('medications', true);
  });

  it('lists AI coaches under Wellbeing, for this website only, and turns them on', () => {
    mockFeaturesOff = new Set<FeatureKey>(['aiCoaches']);
    renderSettings();
    expect(screen.getByText('Wellbeing')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Coaches' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(mockSetFeatureOn).toHaveBeenCalledWith('aiCoaches', true);
  });

  it('turns lab results off on this website', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('switch', { name: 'Lab results' }));
    expect(mockSetFeatureOn).toHaveBeenCalledWith('labResults', false);
  });

  it('turns lab results back on', () => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderSettings();
    const toggle = screen.getByRole('switch', { name: 'Lab results' });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(mockSetFeatureOn).toHaveBeenCalledWith('labResults', true);
  });

  it.each([
    ['the choices load', { state: 'loading', isPending: false }],
    ['a change is saving', { state: 'ready', isPending: true }],
  ] as const)('cannot switch lab results while %s', (_label, choice) => {
    mockChoice = choice;
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Lab results' })).toBeDisabled();
  });

  it('asks to update the server when it is older than Features, without a retry', () => {
    mockChoice = { state: 'serverTooOld', isPending: false };
    renderSettings();
    // The defaults on an older server are covered in useWebFeatures.test.
    expect(screen.getByRole('switch', { name: 'Lab results' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Medications' })).toBeDisabled();
    expect(
      screen.getAllByText('Update your SparkyFitness server to change this.')
    ).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('offers a retry when the lab results choice could not load', () => {
    mockChoice = { state: 'loadFailed', isPending: false };
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Lab results' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Medications' })).toBeDisabled();
    const retries = screen.getAllByRole('button', { name: 'Retry' });
    expect(retries).toHaveLength(3);
    fireEvent.click(retries[0]!);
    expect(mockReloadChoices).toHaveBeenCalledTimes(1);
  });

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
