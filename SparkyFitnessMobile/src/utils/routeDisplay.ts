import { formatLocalizedNumber } from '../localization';
import { METERS_PER_KM, METERS_PER_MILE } from './gpsRecording';

export type DistanceUnit = 'km' | 'miles';

/** "12.4 km" / "7.7 mi" for a distance in metres. */
export function formatRouteDistance(
  meters: number,
  unit: DistanceUnit
): string {
  const value = meters / (unit === 'miles' ? METERS_PER_MILE : METERS_PER_KM);
  return `${formatLocalizedNumber(value, {
    minimumFractionDigits: value < 10 ? 2 : 1,
    maximumFractionDigits: value < 10 ? 2 : 1,
  })} ${unit === 'miles' ? 'mi' : 'km'}`;
}

/** "120 m" / "394 ft" climb for a height in metres. */
export function formatRouteClimb(meters: number, unit: DistanceUnit): string {
  return unit === 'miles'
    ? `${formatLocalizedNumber(Math.round(meters * 3.28084))} ft`
    : `${formatLocalizedNumber(Math.round(meters))} m`;
}
