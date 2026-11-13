import type { TFunction } from 'i18next';
import { PLATE_WEIGHT_DECIMALS, type BarKind } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';

/** A plate or bar weight in the app locale, without float noise. */
export const formatPlateWeight = (value: number): string =>
  formatLocalizedNumber(Number(value.toFixed(PLATE_WEIGHT_DECIMALS)), {
    maximumFractionDigits: PLATE_WEIGHT_DECIMALS,
  });

/** The person's name for a bar, else the label for its kind. */
export const barLabel = (
  t: TFunction,
  bar: { name: string | null; kind: BarKind }
): string => {
  if (bar.name) return bar.name;
  switch (bar.kind) {
    case 'barbell':
      return t('plates.barKind.barbell', { defaultValue: 'Barbell' });
    case 'womens':
      return t('plates.barKind.womens', { defaultValue: "Women's bar" });
    case 'ez':
      return t('plates.barKind.ez', { defaultValue: 'EZ bar' });
    case 'trap':
      return t('plates.barKind.trap', { defaultValue: 'Trap bar' });
    case 'other':
      return t('plates.barKind.other', { defaultValue: 'Other bar' });
  }
};
