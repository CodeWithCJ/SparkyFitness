import type { TFunction } from 'i18next';
import type { WebHideableTabId } from '@workspace/shared';
import {
  cycleTabLabel,
  knownHiddenWebTabs,
  visibleModuleTabs,
  withWebTabHidden,
} from '@/constants/webTabs';
import { translateForTest } from '@/tests/mocks/reactI18next';

const t = translateForTest as unknown as TFunction;
const none = new Set<WebHideableTabId>();
const cycleOn = {
  enabled: true,
  mode: 'standard',
  discreet_mode: false,
} as const;

const ids = (
  hidden: Set<WebHideableTabId>,
  cycle: Parameters<typeof visibleModuleTabs>[2] = cycleOn
) => visibleModuleTabs(t, hidden, cycle).map((tab) => tab.id);

describe('visibleModuleTabs', () => {
  it('shows every module tab when nothing is hidden, cycle while it is on', () => {
    expect(ids(none)).toEqual([
      'checkin',
      'cycle',
      'medications',
      'labs',
      'reports',
      'foods',
      'exercises',
      'goals',
    ]);
    expect(ids(none, { ...cycleOn, enabled: false })).not.toContain('cycle');
    expect(visibleModuleTabs(t, none, null).map((tab) => tab.id)).not.toContain(
      'cycle'
    );
  });

  it('leaves out the tabs the person hid', () => {
    expect(ids(new Set<WebHideableTabId>(['labs', 'reports']))).toEqual([
      'checkin',
      'cycle',
      'medications',
      'foods',
      'exercises',
      'goals',
    ]);
  });

  it('keeps Reports out of the + menu and the rest in it', () => {
    const plusMenu = visibleModuleTabs(t, none, cycleOn)
      .filter((tab) => tab.inPlusMenu)
      .map((tab) => tab.id);
    expect(plusMenu).not.toContain('reports');
    expect(plusMenu).toContain('labs');
  });

  it('gives each tab its label and path', () => {
    const labs = visibleModuleTabs(t, none, cycleOn).find(
      (tab) => tab.id === 'labs'
    );
    expect(labs).toMatchObject({ path: '/labs', label: 'Lab results' });
  });
});

describe('cycleTabLabel', () => {
  it('never says Cycle in discreet mode', () => {
    expect(cycleTabLabel(t, { ...cycleOn, discreet_mode: true })).toBe(
      'Wellness'
    );
    expect(cycleTabLabel(t, { ...cycleOn, mode: 'pregnant' })).toBe(
      'Pregnancy'
    );
    expect(cycleTabLabel(t, cycleOn)).toBe('Cycle');
  });
});

describe('knownHiddenWebTabs', () => {
  it('keeps known ids in bar order and ignores anything else', () => {
    expect(knownHiddenWebTabs(['goals', 'fasting', 'labs', 3])).toEqual([
      'labs',
      'goals',
    ]);
    expect(knownHiddenWebTabs(null)).toEqual([]);
    expect(knownHiddenWebTabs('labs')).toEqual([]);
  });
});

describe('withWebTabHidden', () => {
  it('adds or removes one tab and keeps bar order', () => {
    expect(withWebTabHidden(['goals'], 'labs', true)).toEqual([
      'labs',
      'goals',
    ]);
    expect(withWebTabHidden(['labs', 'goals'], 'labs', false)).toEqual([
      'goals',
    ]);
    expect(withWebTabHidden(['labs'], 'labs', true)).toEqual(['labs']);
    expect(withWebTabHidden([], 'labs', false)).toEqual([]);
  });
});
