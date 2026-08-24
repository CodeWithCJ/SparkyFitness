import { useAppLocale } from '../localization';
import { usePreferences } from '../hooks/usePreferences';

/**
 * react-native-ui-datepicker uses a dayjs locale string (e.g. "en", "pl") and a
 * numeric first-day-of-week (0 = Sunday ... 6 = Saturday).
 *
 * Note: we intentionally do NOT import 'dayjs/locale/pl' here. dayjs is only a
 * transitive dependency of react-native-ui-datepicker and is not resolvable as a
 * top-level import in the mobile build (it broke Metro bundle resolution). The
 * calendar grid is localized deterministically through the custom Weekday/Month
 * renderers (Intl-based) plus the Intl helpers below, so the grid re-localizes
 * on a runtime language switch without depending on dayjs global-locale state.
 */

/** Maps the SparkyFitness application locale to the dayjs locale expected by the datepicker. */
export function appLocaleToDatepickerLocale(locale: string): string {
  return locale.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export interface CalendarPresentation {
  /** dayjs locale for the datepicker (e.g. "en" | "pl"). */
  locale: string;
  /** 0 = Sunday ... 6 = Saturday. */
  firstDayOfWeek: number;
}

/**
 * Localized full weekday names for the current app locale, indexed by JS
 * getDay() semantics (0 = Sunday ... 6 = Saturday) — matching the datepicker's
 * CalendarWeek.index. Driven by Intl so it reliably follows the app language.
 */
export function getCalendarWeekdayNames(appLocale: string): string[] {
  const base = new Date(2026, 0, 4); // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(appLocale, { weekday: 'long' }).format(
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + i),
    ),
  );
}

/**
 * Localized short weekday names (e.g. "Pn", "Wt", ...) for the current app
 * locale, indexed by JS getDay() semantics (0 = Sunday).
 */
export function getCalendarWeekdayShortNames(appLocale: string): string[] {
  const base = new Date(2026, 0, 4); // a Sunday
  return Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(appLocale, { weekday: 'short' }).format(
      new Date(base.getFullYear(), base.getMonth(), base.getDate() + i),
    ),
  );
}

/**
 * Localized month names for the current app locale, indexed by month (0 = Jan).
 */
export function getCalendarMonthNames(appLocale: string): string[] {
  return Array.from({ length: 12 }, (_, i) =>
    new Intl.DateTimeFormat(appLocale, { month: 'long' }).format(
      new Date(2026, i, 1),
    ),
  );
}

/**
 * Pure presentation resolver combining the active application language and the
 * canonical account first-day-of-week preference. Defaults the week start to
 * Sunday (0) when the preference is unavailable, mirroring the existing
 * web/product behavior.
 */
export function resolveCalendarPresentation(
  appLocale: string,
  firstDayOfWeekPreference?: number,
): CalendarPresentation {
  const fdow = firstDayOfWeekPreference;
  return {
    locale: appLocaleToDatepickerLocale(appLocale),
    firstDayOfWeek:
      typeof fdow === 'number' && fdow >= 0 && fdow <= 6 ? fdow : 0,
  };
}

/**
 * Calendar presentation derives from exactly one reactive app-locale snapshot
 * plus the account-owned first-day-of-week preference. This lets retained
 * bottom-sheet content re-render directly from i18n.languageChanged without
 * resetting the selected or visible month.
 */
export function useCalendarPresentation(): {
  appLocale: 'pl-PL' | 'en-US';
  presentation: CalendarPresentation;
  isLoadingPreferences: boolean;
} {
  const appLocale = useAppLocale();
  const { preferences, isLoading } = usePreferences();
  return {
    appLocale,
    presentation: resolveCalendarPresentation(
      appLocale,
      preferences?.first_day_of_week,
    ),
    isLoadingPreferences: isLoading,
  };
}
