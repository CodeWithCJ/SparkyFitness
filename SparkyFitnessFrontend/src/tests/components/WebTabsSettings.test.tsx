import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { FeatureKey, WebHideableTabId } from '@workspace/shared';
import type { WebTabsEditState } from '@/hooks/Settings/useHiddenWebTabs';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { WebTabsSettings } from '@/pages/Settings/WebTabsSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockHidden = new Set<WebHideableTabId>();
let mockEditState: WebTabsEditState = 'ready';
const mockSetTabHidden = jest.fn();
const mockReload = jest.fn();
jest.mock('@/hooks/Settings/useHiddenWebTabs', () => ({
  useHiddenWebTabs: () => ({
    hidden: mockHidden,
    editState: mockEditState,
    reload: mockReload,
  }),
  useSetWebTabHidden: () => ({
    setTabHidden: mockSetTabHidden,
    isPending: false,
  }),
}));

let mockCycleSettings:
  | {
      enabled: boolean;
      mode: string;
      discreet_mode: boolean;
    }
  | null
  | undefined = null;
jest.mock('@/hooks/useCycle', () => ({
  useCycleSettings: () => ({ data: mockCycleSettings }),
}));

let mockFeaturesOff = new Set<FeatureKey>();
jest.mock('@/hooks/Settings/useWebFeatures', () => {
  const isEnabled = (key: FeatureKey) =>
    key === 'cycle'
      ? mockCycleSettings?.enabled === true
      : !mockFeaturesOff.has(key);
  return {
    useWebFeatures: () => ({
      isEnabled,
      // Someone acting for the owner sees every feature's entry points.
      isShown: (key: FeatureKey) =>
        mockEditState === 'actingOnBehalf' || isEnabled(key),
    }),
  };
});

let mockChallengesAvailable = false;
jest.mock('@/hooks/Challenges/useChallenges', () => ({
  useChallengesAvailable: () => ({
    available: mockChallengesAvailable,
    isLoading: false,
  }),
}));

const mockManageFeatures = jest.fn();

function renderSettings() {
  return render(
    <Accordion type="multiple" defaultValue={['web-tabs']}>
      <AccordionItem value="web-tabs">
        <WebTabsSettings onManageFeatures={mockManageFeatures} />
      </AccordionItem>
    </Accordion>
  );
}

const cycleOn = { enabled: true, mode: 'standard', discreet_mode: false };

describe('WebTabsSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHidden = new Set();
    mockEditState = 'ready';
    mockCycleSettings = null;
    mockFeaturesOff = new Set();
    mockChallengesAvailable = false;
  });

  it('leaves out the tab of a feature turned off in Features, and says so once', () => {
    mockCycleSettings = cycleOn;
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderSettings();
    expect(
      screen.queryByRole('switch', { name: 'Lab results' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(screen.getAllByText('Some features are turned off')).toHaveLength(1);
    expect(mockSetTabHidden).not.toHaveBeenCalled();
  });

  it('leaves out the Medications row while medications is off, keeping its choice', () => {
    mockHidden = new Set<WebHideableTabId>(['medications']);
    mockFeaturesOff = new Set<FeatureKey>(['medications']);
    renderSettings();
    expect(
      screen.queryByRole('switch', { name: 'Medications' })
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(6);
    expect(screen.getAllByText('Some features are turned off')).toHaveLength(1);
    expect(mockSetTabHidden).not.toHaveBeenCalled();
  });

  it('opens Features from the line', () => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
    expect(mockManageFeatures).toHaveBeenCalledTimes(1);
  });

  it('says nothing about features while every one is on', () => {
    mockCycleSettings = cycleOn;
    renderSettings();
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Manage' })
    ).not.toBeInTheDocument();
  });

  it('leaves cycle out while it is off, and says some features are off', () => {
    mockCycleSettings = { ...cycleOn, enabled: false };
    renderSettings();
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
    expect(screen.queryByText(/Features, above/)).not.toBeInTheDocument();
    expect(
      screen.getByText('Some features are turned off')
    ).toBeInTheDocument();
  });

  it('does not offer to manage features while acting for someone else', () => {
    mockEditState = 'actingOnBehalf';
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderSettings();
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
  });

  it("lists the Medications row, off limits, to someone acting for the owner, whatever the owner's choice", () => {
    mockEditState = 'actingOnBehalf';
    mockFeaturesOff = new Set<FeatureKey>(['medications']);
    renderSettings();
    expect(screen.getByRole('switch', { name: 'Medications' })).toBeDisabled();
    expect(screen.getAllByRole('switch')).toHaveLength(7);
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
  });

  it('offers Challenges only while the admin switch is on', () => {
    renderSettings();
    expect(screen.queryByLabelText('Challenges')).not.toBeInTheDocument();
    mockChallengesAvailable = true;
    renderSettings();
    expect(screen.getByLabelText('Challenges')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Challenges'));
    expect(mockSetTabHidden).toHaveBeenCalledWith('challenges', true);
  });

  it('shows a switch, on, for each tab that can be hidden', () => {
    renderSettings();
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(7);
    switches.forEach((toggle) => expect(toggle).toBeChecked());
    expect(screen.getByLabelText('Lab results')).toBeInTheDocument();
    expect(screen.queryByLabelText('Diary')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Settings')).not.toBeInTheDocument();
  });

  it('shows a hidden tab as off', () => {
    mockHidden = new Set<WebHideableTabId>(['labs']);
    renderSettings();
    expect(screen.getByLabelText('Lab results')).not.toBeChecked();
    expect(screen.getByLabelText('Goals')).toBeChecked();
  });

  it('hides a tab when its switch is turned off, and shows it when turned on', () => {
    mockHidden = new Set<WebHideableTabId>(['goals']);
    renderSettings();
    fireEvent.click(screen.getByLabelText('Lab results'));
    expect(mockSetTabHidden).toHaveBeenCalledWith('labs', true);
    fireEvent.click(screen.getByLabelText('Goals'));
    expect(mockSetTabHidden).toHaveBeenCalledWith('goals', false);
  });

  it.each<WebTabsEditState>(['loading', 'loadFailed', 'actingOnBehalf'])(
    'keeps every switch off limits while %s',
    (state) => {
      mockEditState = state;
      renderSettings();
      screen
        .getAllByRole('switch')
        .forEach((toggle) => expect(toggle).toBeDisabled());
    }
  );

  it('says why while acting for someone else', () => {
    mockEditState = 'actingOnBehalf';
    renderSettings();
    expect(
      screen.getByText('You can only change the tabs on your own account.')
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry' })
    ).not.toBeInTheDocument();
  });

  it('offers to load the list again when it failed', () => {
    mockEditState = 'loadFailed';
    renderSettings();
    expect(
      screen.getByText('Could not load your tab choices.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('shows cycle with its state and no switch of its own', () => {
    mockCycleSettings = cycleOn;
    renderSettings();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(7);
    expect(
      screen.getByText('Cycle is turned on or off in Features, above.')
    ).toBeInTheDocument();
  });

  it('leaves the cycle row out until cycle settings are known', () => {
    mockCycleSettings = undefined;
    renderSettings();
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
    expect(screen.queryByText(/Features, above/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
  });

  it('calls cycle Wellness in discreet mode', () => {
    mockCycleSettings = { ...cycleOn, discreet_mode: true };
    renderSettings();
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness')).toBeInTheDocument();
  });
});
