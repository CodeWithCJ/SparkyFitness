/**
 * Main web tabs a person can hide in Settings. The choice is a Customize
 * layout row (`user_dashboard_layouts`) under WEB_TABS_PAGE_KEY, whose
 * `hidden` list holds the ids below; with no row, every tab shows.
 *
 * Web only: the mobile app keeps its own dashboard card, quick action and
 * watch page settings on the device. Diary (home), Settings and Admin always
 * show, and cycle keeps its own switch (`cycle_settings.enabled`), so none of
 * them is listed here. Challenges also needs the admin switch
 * (`enable_challenges`) and the person's own account.
 */
export const WEB_TABS_PAGE_KEY = 'web-tabs';

export const WEB_HIDEABLE_TAB_IDS = [
  'checkin',
  'medications',
  'labs',
  'reports',
  'foods',
  'exercises',
  'goals',
  'challenges',
] as const;

export type WebHideableTabId = (typeof WEB_HIDEABLE_TAB_IDS)[number];

export function isWebHideableTabId(value: unknown): value is WebHideableTabId {
  return (
    typeof value === 'string' &&
    (WEB_HIDEABLE_TAB_IDS as readonly string[]).includes(value)
  );
}
