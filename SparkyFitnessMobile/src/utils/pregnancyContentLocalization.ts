import type { TFunction } from 'i18next';
import { formatLocalizedNumber } from '../localization';
import { babyWeek } from '@workspace/shared';


/** Controlled pregnancy week range (4–40). closed and bounded. */
export const PREGNANCY_WEEK_MIN = 4;
export const PREGNANCY_WEEK_MAX = 40;

/**
 * Localized baby-development presentation for a given week (4–40). Returns the
 * localized comparison, baby blurb and parent blurb via stable week-keyed
 * translation entries. The canonical numeric/scientific data (length/weight/
 * womb scene) comes from @workspace/shared and is NOT altered here.
 * Returns null for out-of-range weeks.
 */
export function localizeBabyWeek(
  week: number,
  t: TFunction,
): { comparison: string; baby: string; mom: string } | null {
  if (
    !Number.isInteger(week) ||
    week < PREGNANCY_WEEK_MIN ||
    week > PREGNANCY_WEEK_MAX
  ) {
    return null;
  }
  const translate = t;
  const base = `pregnancy.babyDev.w${week}`;
  const canonical = babyWeek(week);
  const fallbackComparison = canonical?.comparison ?? '';
  const fallbackBaby = canonical?.babyBlurb ?? '';
  const fallbackMom = canonical?.momBlurb ?? '';
  return {
    comparison: translate(`${base}.comparison`, {
      defaultValue: fallbackComparison,
    }),
    baby: translate(`${base}.baby`, { defaultValue: fallbackBaby }),
    mom: translate(`${base}.mom`, { defaultValue: fallbackMom }),
  };
}

/**
 * Localized length presentation (app-locale decimal separator):
 * EN "1.6 cm" / PL "1,6 cm".
 */
export function formatBabyLength(cm: number | null | undefined): string {
  if (cm == null || !Number.isFinite(cm)) return '';
  return `${formatLocalizedNumber(cm)} cm`;
}

/**
 * Localized weight presentation (whole grams; app-locale grouping):
 * EN "43 g" / PL "43 g".
 */
export function formatBabyWeight(g: number | null | undefined): string {
  if (g == null || !Number.isFinite(g)) return '';
  return `${formatLocalizedNumber(g)} g`;
}
