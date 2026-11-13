import type { TFunction } from 'i18next';
import { PLATE_WEIGHT_DECIMALS, type BarKind } from '@workspace/shared';

/** A plate or bar weight without trailing zeros or float noise. */
export const formatPlateWeight = (value: number): string =>
  String(Number(value.toFixed(PLATE_WEIGHT_DECIMALS)));

/** The person's name for a bar, else the label for its kind. */
export const barLabel = (
  t: TFunction,
  bar: { name: string | null; kind: BarKind }
): string =>
  bar.name ??
  t(`plates.barKind.${bar.kind}`, {
    defaultValue: {
      barbell: 'Barbell',
      womens: "Women's bar",
      ez: 'EZ bar',
      trap: 'Trap bar',
      other: 'Other bar',
    }[bar.kind],
  });
