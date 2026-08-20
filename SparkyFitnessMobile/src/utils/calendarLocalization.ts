import { useTranslation } from 'react-i18next';
import { getAppLocale } from '../localization';
import { usePreferences } from '../hooks/usePreferences';

/**
 * react-native-ui-datepicker uses a dayjs locale string (e.g. "en", "pl") and a
 * numeric first-day-of-week (0 = Sunday ... 6 = Saturday).
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
 * Reactive hook used by calendar UIs. Reads the current app language (so the
 * calendar re-localizes when the language changes) and the canonical account
 * first-day-of-week preference.
 */
export function useCalendarPresentation(): {
  presentation: CalendarPresentation;
  isLoadingPreferences: boolean;
} {
  // Subscribes this component to app-language changes so getAppLocale() (which
  // reads i18n.resolvedLanguage) stays reactive. Callers re-render on changes.
  useTranslation();
  const { preferences, isLoading } = usePreferences();
  return {
    presentation: resolveCalendarPresentation(
      getAppLocale(),
      preferences?.first_day_of_week,
    ),
    isLoadingPreferences: isLoading,
  };
}
