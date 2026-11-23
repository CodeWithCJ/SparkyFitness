import { formatLocalizedNumber } from '../localization';

/** A treadmill percent for display: "+4%", "-2.5%", "0%". */
export function formatTreadmillPercent(percent: number): string {
  return `${formatLocalizedNumber(percent, {
    signDisplay: 'exceptZero',
    maximumFractionDigits: 1,
  })}%`;
}
