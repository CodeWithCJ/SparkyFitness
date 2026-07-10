import type { TFunction } from 'i18next';

export const formatMinutesToHHMM = (totalMinutes: number): string => {
  const isNegative = totalMinutes < 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = Math.round(absMinutes % 60);

  if (hours === 0) {
    return isNegative ? `-${minutes}m` : `${minutes}m`;
  }

  const formatted = `${hours}h ${minutes}m`;
  return isNegative ? `-${formatted}` : formatted;
};

export const formatLocalizedMinutes = (
  totalMinutes: number,
  t: TFunction
): string => {
  const isNegative = totalMinutes < 0;
  const absMinutes = Math.abs(totalMinutes);
  const hours = Math.floor(absMinutes / 60);
  const minutes = Math.round(absMinutes % 60);

  if (hours === 0) {
    return t('units.minuteValue', {
      value: isNegative ? -minutes : minutes,
    });
  }

  return t('units.hourMinuteValue', {
    hours: isNegative ? -hours : hours,
    minutes,
  });
};

export const formatLocalizedSeconds = (
  totalSeconds: number,
  t: TFunction
): string => formatLocalizedMinutes(Math.round(totalSeconds / 60), t);

export const formatSecondsToHHMM = (totalSeconds: number): string => {
  const isNegative = totalSeconds < 0;
  const absSeconds = Math.abs(totalSeconds);
  const totalMinutes = Math.round(absSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return isNegative ? `-${minutes}m` : `${minutes}m`;
  }

  const formatted = `${hours}h ${minutes}m`;
  return isNegative ? `-${formatted}` : formatted;
};

export const formatSecondsClock = (totalSeconds: number): string => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
