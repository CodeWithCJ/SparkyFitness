import type { TFunction } from 'i18next';
import type { FastingPreset, MetabolicStage } from '../constants/fasting';
import type { FastingLog } from '../types/fasting';
import {
  addDays,
  formatDate,
  getTodayDate,
  toLocalDateString,
} from './dateUtils';

export function getFastingPresetDisplayName(
  t: TFunction,
  preset: FastingPreset,
): string {
  switch (preset.id) {
    case '16-8':
      return t('fasting.protocols.sixteenEight.name');
    case '18-6':
      return t('fasting.protocols.eighteenSix.name');
    case '20-4':
      return t('fasting.protocols.twentyFour.name');
    case 'circumadian':
      return t('fasting.protocols.circadian.name');
    case 'custom':
      return t('fasting.protocols.custom.name');
    default:
      return preset.name;
  }
}

export function getFastingPresetDescription(
  t: TFunction,
  preset: FastingPreset,
): string {
  switch (preset.id) {
    case '16-8':
      return t('fasting.protocols.sixteenEight.description');
    case '18-6':
      return t('fasting.protocols.eighteenSix.description');
    case '20-4':
      return t('fasting.protocols.twentyFour.description');
    case 'circumadian':
      return t('fasting.protocols.circadian.description');
    case 'custom':
      return t('fasting.protocols.custom.description');
    default:
      return preset.description;
  }
}

export function getFastingStageName(
  t: TFunction,
  stage: MetabolicStage,
): string {
  switch (stage.key) {
    case 'anabolic':
      return t('fasting.stages.anabolic');
    case 'catabolic':
      return t('fasting.stages.catabolic');
    case 'fat-burning':
      return t('fasting.stages.fatBurning');
    case 'ketosis':
      return t('fasting.stages.ketosis');
    case 'deep-ketosis':
      return t('fasting.stages.deepKetosis');
    default:
      return stage.name;
  }
}

export function getLocalizedProtocolBadge(
  t: TFunction,
  protocol: string | null | undefined,
): string {
  if (!protocol || !protocol.trim()) return t('fasting.protocol.badgeFasting');
  const ratio = protocol.match(/(\d{1,2})\s*:\s*(\d{1,2})/);
  if (ratio) return `${ratio[1]}:${ratio[2]}`;
  switch (protocol.trim()) {
    case 'Circadian Rhythm':
      return t('fasting.protocol.badgeCircadian');
    case 'Custom Fast':
      return t('fasting.protocol.badgeCustom');
    default:
      return protocol.trim();
  }
}

export function formatLocalizedFastingDuration(
  t: TFunction,
  milliseconds: number,
): string {
  const totalMinutes = Math.max(0, Math.floor(milliseconds / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return t('fasting.duration.minutes', { minutes });
  return t('fasting.duration.hoursMinutes', { hours, minutes });
}

export function formatLocalizedFastingDateTime(
  date: Date,
  locale: string,
): string {
  return date.toLocaleString(locale, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatLocalizedFastingTime(
  iso: string,
  locale: string,
): string {
  return new Date(iso).toLocaleTimeString(locale, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function getLocalizedFastingHistoryDayLabel(
  t: TFunction,
  iso: string,
): string {
  const day = toLocalDateString(iso);
  if (day === getTodayDate()) return t('fasting.history.today');
  if (day === addDays(getTodayDate(), -1))
    return t('fasting.history.yesterday');
  return formatDate(day);
}

export function formatLocalizedLastFast(
  t: TFunction,
  log: FastingLog | null | undefined,
): string | null {
  if (!log || log.duration_minutes == null) return null;
  const duration = formatLocalizedFastingDuration(
    t,
    log.duration_minutes * 60000,
  );
  const reference = log.end_time ?? log.start_time;
  if (!reference) return t('fasting.card.lastFast', { duration });
  const day = toLocalDateString(reference);
  if (day === getTodayDate()) {
    return t('fasting.card.lastFastToday', {
      duration,
      date: t('fasting.relativeDate.today'),
    });
  }
  if (day === addDays(getTodayDate(), -1)) {
    return t('fasting.card.lastFastYesterday', {
      duration,
      date: t('fasting.relativeDate.yesterday'),
    });
  }
  return t('fasting.card.lastFastDate', { duration, date: formatDate(day) });
}
