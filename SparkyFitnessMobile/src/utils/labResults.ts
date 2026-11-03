import type { LabResultResponse } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';

// The range, unit, status and marker logic is shared with the web app.
export {
  builtinMarkerId,
  customMarkerId,
  labMarkerQueryFromId,
  labPresetName,
  parseLabValue,
  parseRangeBound,
  sameLabUnit,
  dropStalePrefilledRange,
  effectiveLabRange,
  labResultStatus,
  labPlottedResults,
  labHistoryPoints,
  labSexFromGender,
  buildLabMarkers,
  buildLabPickerOptions,
  labPresetDefaults,
} from '@workspace/shared';
export type {
  LabMarkerLabels,
  LabMarker,
  LabFormPrefill,
  LabHistoryPoint,
  LabPickerOption,
} from '@workspace/shared';

/** Decimal places in a number's shortest round-trip form ("5.6" is 1, "4e-7" is 7). */
const decimalPlaces = (value: number): number => {
  const [mantissa = '', exponent = '0'] = String(value).split('e');
  const fraction = mantissa.split('.')[1]?.length ?? 0;
  return Math.min(Math.max(0, fraction - Number(exponent)), 100);
};

/**
 * A lab number in the app locale with exactly the decimals it was entered
 * with: no rounding of small values and no float tail ("5.6" stays "5.6"),
 * whatever the platform's Intl does with a long maximumFractionDigits.
 */
const labNumber = (value: number): string => {
  const digits = decimalPlaces(value);
  return formatLocalizedNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

/** "4 - 5.6 %", "≤ 200 mg/dL", "≥ 40 mg/dL", or null with no range. */
export const formatLabRange = (
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string
): string | null => {
  const suffix = unit ? ` ${unit}` : '';
  if (low != null && high != null)
    return `${labNumber(low)} - ${labNumber(high)}${suffix}`;
  if (high != null) return `≤ ${labNumber(high)}${suffix}`;
  if (low != null) return `≥ ${labNumber(low)}${suffix}`;
  return null;
};

export const formatLabValue = (value: number, unit: string): string =>
  unit ? `${labNumber(value)} ${unit}` : labNumber(value);

/** The value to show for a result: the number with its unit, else the text. */
export const labResultText = (result: LabResultResponse): string =>
  result.value_numeric !== null
    ? formatLabValue(result.value_numeric, result.unit)
    : (result.value_text ?? '');
