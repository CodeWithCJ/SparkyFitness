import type { TFunction } from 'i18next';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  CalendarHeart,
  Dumbbell,
  FlaskConical,
  Pill,
  Target,
  Utensils,
} from 'lucide-react';
import {
  WEB_HIDEABLE_TAB_IDS,
  type SharedCycleSettings,
  type WebHideableTabId,
} from '@workspace/shared';

/**
 * The owner's module tabs between Diary and Settings, in bar order. Each one
 * the person can hide (Settings > Tabs) is a WEB_HIDEABLE_TAB_IDS id; cycle
 * shows only while `cycle_settings.enabled`. `inPlusMenu` says whether the
 * narrow-screen + menu lists it (Reports is in the bottom bar instead).
 */
interface ModuleTabDefinition {
  id: WebHideableTabId | 'cycle';
  path: string;
  inPlusMenu: boolean;
}

const MODULE_TABS: readonly ModuleTabDefinition[] = [
  { id: 'checkin', path: '/checkin', inPlusMenu: true },
  { id: 'cycle', path: '/cycle', inPlusMenu: true },
  { id: 'medications', path: '/medications', inPlusMenu: true },
  { id: 'labs', path: '/labs', inPlusMenu: true },
  { id: 'reports', path: '/reports', inPlusMenu: false },
  { id: 'foods', path: '/foods', inPlusMenu: true },
  { id: 'exercises', path: '/exercises', inPlusMenu: true },
  { id: 'goals', path: '/goals', inPlusMenu: true },
];

const TAB_ICONS: Record<WebHideableTabId, LucideIcon> = {
  checkin: Activity,
  medications: Pill,
  labs: FlaskConical,
  reports: BarChart3,
  foods: Utensils,
  exercises: Dumbbell,
  goals: Target,
};

type CycleTabSettings = Pick<
  SharedCycleSettings,
  'enabled' | 'mode' | 'discreet_mode'
>;

export function webTabLabel(t: TFunction, id: WebHideableTabId): string {
  switch (id) {
    case 'checkin':
      return t('nav.checkin', 'Check-In');
    case 'medications':
      return t('nav.medications', 'Medications');
    case 'labs':
      return t('nav.labs', 'Lab results');
    case 'reports':
      return t('nav.reports', 'Reports');
    case 'foods':
      return t('nav.foods', 'Foods');
    case 'exercises':
      return t('exercise.title', 'Exercises');
    case 'goals':
      return t('nav.goals', 'Goals');
  }
}

export function webTabIcon(id: WebHideableTabId): LucideIcon {
  return TAB_ICONS[id];
}

/** Discreet mode names cycle Wellness, so a shared screen never says Cycle. */
export function cycleTabLabel(
  t: TFunction,
  settings: CycleTabSettings | null | undefined
): string {
  if (settings?.discreet_mode) return t('nav.wellness', 'Wellness');
  if (settings?.mode === 'pregnant') return t('nav.pregnancy', 'Pregnancy');
  return t('nav.cycle', 'Cycle');
}

export function cycleTabIcon(
  settings: CycleTabSettings | null | undefined
): LucideIcon {
  return settings?.discreet_mode ? Activity : CalendarHeart;
}

export interface VisibleModuleTab {
  id: WebHideableTabId | 'cycle';
  path: string;
  label: string;
  icon: LucideIcon;
  inPlusMenu: boolean;
}

/** The module tabs to show the owner: cycle while it is on, the rest unless hidden. */
export function visibleModuleTabs(
  t: TFunction,
  hidden: ReadonlySet<WebHideableTabId>,
  cycleSettings: CycleTabSettings | null | undefined
): VisibleModuleTab[] {
  return MODULE_TABS.flatMap((tab): VisibleModuleTab[] => {
    if (tab.id === 'cycle') {
      if (!cycleSettings?.enabled) return [];
      return [
        {
          ...tab,
          label: cycleTabLabel(t, cycleSettings),
          icon: cycleTabIcon(cycleSettings),
        },
      ];
    }
    if (hidden.has(tab.id)) return [];
    return [
      { ...tab, label: webTabLabel(t, tab.id), icon: webTabIcon(tab.id) },
    ];
  });
}

/**
 * Known tab ids from a stored `hidden` list, in bar order. Anything else (a
 * newer client's id, a malformed value) is ignored, so every tab shows.
 */
export function knownHiddenWebTabs(value: unknown): WebHideableTabId[] {
  if (!Array.isArray(value)) return [];
  return WEB_HIDEABLE_TAB_IDS.filter((id) => value.includes(id));
}

/** The stored list after showing or hiding one tab, in bar order. */
export function withWebTabHidden(
  current: readonly WebHideableTabId[],
  tab: WebHideableTabId,
  hide: boolean
): WebHideableTabId[] {
  return WEB_HIDEABLE_TAB_IDS.filter((id) =>
    id === tab ? hide : current.includes(id)
  );
}
