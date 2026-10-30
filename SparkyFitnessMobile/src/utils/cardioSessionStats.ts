import type { TFunction } from 'i18next';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';

const FEET_PER_METER = 3.28084;

export interface Stat {
  key: string;
  label: string;
  value: string;
}

const minutesText = (t: TFunction, minutes: number) =>
  t('exerciseStatistics.cardio.minutes', {
    count: minutes,
    formattedCount: formatLocalizedNumber(minutes),
    defaultValue: '{{formattedCount}} min',
    defaultValue_one: '{{formattedCount}} min',
    defaultValue_other: '{{formattedCount}} min',
  });

export const bpmText = (t: TFunction, bpm: number) =>
  t('exerciseStatistics.cardio.bpm', {
    defaultValue: '{{value}} bpm',
    value: formatLocalizedNumber(Math.round(bpm)),
  });

export const spmText = (t: TFunction, cadence: number) =>
  t('exerciseStatistics.cardio.spm', {
    defaultValue: '{{value}} spm',
    value: formatLocalizedNumber(Math.round(cadence)),
  });

/**
 * "9° · Light rain" for the air temperature and conditions at the start. The
 * temperature is stored in °C and shown in °F with the miles setting, as
 * elevation is shown in feet; 0° is a real reading, so only null is skipped.
 */
function weatherText(
  t: TFunction,
  session: Pick<
    ExerciseActivityQueryItem,
    'weatherTempCelsius' | 'weatherCondition'
  >,
  distanceUnit: 'km' | 'miles'
): string | null {
  const parts: string[] = [];
  if (session.weatherTempCelsius != null) {
    const fahrenheit = distanceUnit === 'miles';
    const degrees = fahrenheit
      ? session.weatherTempCelsius * 1.8 + 32
      : session.weatherTempCelsius;
    const value = formatLocalizedNumber(Math.round(degrees));
    parts.push(
      fahrenheit
        ? t('exerciseStatistics.cardio.degreesF', {
            defaultValue: '{{value}}°F',
            value,
          })
        : t('exerciseStatistics.cardio.degreesC', {
            defaultValue: '{{value}}°C',
            value,
          })
    );
  }
  if (session.weatherCondition) parts.push(session.weatherCondition);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** A stride stored in centimetres, shown in feet with the miles setting. */
export function strideText(
  t: TFunction,
  strideLengthCm: number,
  distanceUnit: 'km' | 'miles'
): string {
  const feet = distanceUnit === 'miles';
  const value = formatLocalizedNumber(
    feet
      ? Math.round(strideLengthCm * FEET_PER_METER) / 100
      : Math.round(strideLengthCm) / 100,
    { maximumFractionDigits: 2 }
  );
  return feet
    ? t('exerciseStatistics.cardio.feet', {
        defaultValue: '{{value}} ft',
        value,
      })
    : t('exerciseStatistics.cardio.meters', {
        defaultValue: '{{value}} m',
        value,
      });
}

export function sessionStats(
  t: TFunction,
  session: ExerciseActivityQueryItem,
  distanceUnit: 'km' | 'miles'
): Stat[] {
  const stats: Stat[] = [];
  if (session.distanceFormatted != null && session.distanceFormatted > 0) {
    stats.push({
      key: 'distance',
      label: t('exerciseStatistics.cardio.distance', {
        defaultValue: 'Distance',
      }),
      value: `${formatLocalizedNumber(session.distanceFormatted, {
        maximumFractionDigits: 2,
      })} ${
        distanceUnit === 'miles'
          ? t('exerciseStatistics.cardio.unitMi', { defaultValue: 'mi' })
          : t('exerciseStatistics.cardio.unitKm', { defaultValue: 'km' })
      }`,
    });
  }
  if (session.durationMinutes > 0) {
    stats.push({
      key: 'duration',
      label: t('exerciseStatistics.cardio.duration', {
        defaultValue: 'Duration',
      }),
      value: minutesText(t, Math.round(session.durationMinutes)),
    });
  }
  if (session.formattedPace) {
    stats.push({
      key: 'pace',
      label: t('exerciseStatistics.cardio.pace', { defaultValue: 'Pace' }),
      value: session.formattedPace,
    });
  }
  if (session.floorsClimbed != null && session.floorsClimbed > 0) {
    const floors = Math.round(session.floorsClimbed);
    stats.push({
      key: 'floors',
      label: t('exerciseStatistics.cardio.floors', {
        defaultValue: 'Floors climbed',
      }),
      value: t('exerciseStatistics.cardio.floorsCount', {
        count: floors,
        formattedCount: formatLocalizedNumber(floors),
        defaultValue: '{{formattedCount}} floors',
        defaultValue_one: '{{formattedCount}} floor',
        defaultValue_other: '{{formattedCount}} floors',
      }),
    });
  }
  if (session.elevationGainMeters != null && session.elevationGainMeters > 0) {
    // Stored in metres; shown in feet with the miles setting, as distance is.
    const feet = distanceUnit === 'miles';
    const gain = feet
      ? session.elevationGainMeters * FEET_PER_METER
      : session.elevationGainMeters;
    const value = formatLocalizedNumber(Math.round(gain));
    stats.push({
      key: 'elevation',
      label: t('exerciseStatistics.cardio.elevationGain', {
        defaultValue: 'Elevation gain',
      }),
      value: feet
        ? t('exerciseStatistics.cardio.feet', {
            defaultValue: '{{value}} ft',
            value,
          })
        : t('exerciseStatistics.cardio.meters', {
            defaultValue: '{{value}} m',
            value,
          }),
    });
  }
  if (session.avgCadence != null && session.avgCadence > 0) {
    stats.push({
      key: 'cadence',
      label: t('exerciseStatistics.cardio.cadence', {
        defaultValue: 'Avg cadence',
      }),
      value: spmText(t, session.avgCadence),
    });
  }
  if (session.strideLengthCm != null && session.strideLengthCm > 0) {
    stats.push({
      key: 'stride',
      label: t('exerciseStatistics.cardio.strideLength', {
        defaultValue: 'Stride length',
      }),
      value: strideText(t, session.strideLengthCm, distanceUnit),
    });
  }
  const weather = weatherText(t, session, distanceUnit);
  if (weather) {
    stats.push({
      key: 'weather',
      label: t('exerciseStatistics.cardio.weather', {
        defaultValue: 'Weather',
      }),
      value: weather,
    });
  }
  if (session.avgHeartRate != null && session.avgHeartRate > 0) {
    stats.push({
      key: 'hr',
      label: t('exerciseStatistics.cardio.avgHeartRate', {
        defaultValue: 'Avg heart rate',
      }),
      value: bpmText(t, session.avgHeartRate),
    });
  }
  if (session.workoutEffort != null) {
    stats.push({
      key: 'effort',
      label: t('exerciseStatistics.cardio.effort', { defaultValue: 'Effort' }),
      value: t('workoutEffort.value', {
        defaultValue: '{{rating}}/10',
        rating: formatLocalizedNumber(session.workoutEffort),
      }),
    });
  }
  if (session.caloriesBurned > 0) {
    stats.push({
      key: 'calories',
      label: t('exerciseStatistics.cardio.caloriesLabel', {
        defaultValue: 'Calories',
      }),
      value: t('exerciseStatistics.cardio.calories', {
        defaultValue: '{{value}} Cal',
        value: formatLocalizedNumber(Math.round(session.caloriesBurned)),
      }),
    });
  }
  return stats;
}
