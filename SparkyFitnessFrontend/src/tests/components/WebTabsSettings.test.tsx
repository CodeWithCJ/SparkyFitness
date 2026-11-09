import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { WebHideableTabId } from '@workspace/shared';
import { Accordion, AccordionItem } from '@/components/ui/accordion';
import { WebTabsSettings } from '@/pages/Settings/WebTabsSettings';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockHidden = new Set<WebHideableTabId>();
const mockSetTabHidden = jest.fn();
jest.mock('@/hooks/Settings/useHiddenWebTabs', () => ({
  useHiddenWebTabs: () => ({ hidden: mockHidden, isLoading: false }),
  useSetWebTabHidden: () => ({
    setTabHidden: mockSetTabHidden,
    isPending: false,
  }),
}));

let mockCycleSettings: {
  enabled: boolean;
  mode: string;
  discreet_mode: boolean;
} | null = null;
jest.mock('@/hooks/useCycle', () => ({
  useCycleSettings: () => ({ data: mockCycleSettings }),
}));

function renderSettings() {
  return render(
    <Accordion type="multiple" defaultValue={['web-tabs']}>
      <AccordionItem value="web-tabs">
        <WebTabsSettings />
      </AccordionItem>
    </Accordion>
  );
}

describe('WebTabsSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHidden = new Set();
    mockCycleSettings = null;
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

  it('shows cycle with its state and no switch of its own', () => {
    mockCycleSettings = {
      enabled: true,
      mode: 'standard',
      discreet_mode: false,
    };
    renderSettings();
    expect(screen.getByText('Cycle')).toBeInTheDocument();
    expect(screen.getByText('On')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(7);
  });

  it('calls cycle Wellness in discreet mode', () => {
    mockCycleSettings = {
      enabled: false,
      mode: 'standard',
      discreet_mode: true,
    };
    renderSettings();
    expect(screen.queryByText('Cycle')).not.toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });
});
