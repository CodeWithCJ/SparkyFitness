import type { TFunction } from 'i18next';
import type { FeatureKey, WebHideableTabId } from '@workspace/shared';
import {
  cycleTabLabel,
  knownHiddenWebTabs,
  visibleModuleTabs,
  withWebTabHidden,
} from '@/constants/webTabs';
import { translateForTest } from '@/tests/mocks/reactI18next';

const t = translateForTest as unknown as TFunction;
const none = new Set<WebHideableTabId>();
const cycleSettings = { mode: 'standard', discreet_mode: false } as const;
const allOn = () => true;

const ids = (
  hidden: Set<WebHideableTabId>,
  isFeatureOn: (key: FeatureKey) => boolean = allOn
) =>
  visibleModuleTabs(t, hidden, isFeatureOn, cycleSettings).map((tab) => tab.id);

describe('visibleModuleTabs', () => {
  it('shows every module tab when nothing is hidden and every feature is on', () => {
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
  });

  it('shows the cycle tab only while the cycle feature is on', () => {
    const asked: FeatureKey[] = [];
    const cycleOff = (key: FeatureKey) => {
      asked.push(key);
      return key !== 'cycle';
    };
    expect(ids(none, cycleOff)).not.toContain('cycle');
    expect(ids(none, cycleOff)).toContain('checkin');
    expect(asked).toContain('cycle');
  });

  it('names the cycle tab from its settings, also before they load', () => {
    const cycleTab = (settings: Parameters<typeof visibleModuleTabs>[3]) =>
      visibleModuleTabs(t, none, allOn, settings).find(
        (tab) => tab.id === 'cycle'
      )?.label;
    expect(cycleTab({ ...cycleSettings, discreet_mode: true })).toBe(
      'Wellness'
    );
    expect(cycleTab(null)).toBe('Cycle');
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
    const plusMenu = visibleModuleTabs(t, none, allOn, cycleSettings)
      .filter((tab) => tab.inPlusMenu)
      .map((tab) => tab.id);
    expect(plusMenu).not.toContain('reports');
    expect(plusMenu).toContain('labs');
  });

  it('gives each tab its label and path', () => {
    const labs = visibleModuleTabs(t, none, allOn, cycleSettings).find(
      (tab) => tab.id === 'labs'
    );
    expect(labs).toMatchObject({ path: '/labs', label: 'Lab results' });
  });
});

describe('cycleTabLabel', () => {
  it('never says Cycle in discreet mode', () => {
    expect(cycleTabLabel(t, { ...cycleSettings, discreet_mode: true })).toBe(
      'Wellness'
    );
    expect(cycleTabLabel(t, { ...cycleSettings, mode: 'pregnant' })).toBe(
      'Pregnancy'
    );
    expect(cycleTabLabel(t, cycleSettings)).toBe('Cycle');
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
