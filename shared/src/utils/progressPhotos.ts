import type {
  CheckInPhotoWithWeight,
  PhotoType,
} from '../schemas/api/CheckInPhotos.api.zod.ts';
import { addDays, compareDays } from './timezone.ts';

/**
 * One calendar day of the progress gallery: the photos taken that day, keyed by
 * angle, plus the day's weight. Built client-side from the flat gallery
 * response so the timeline, the comparison picker and the time-lapse player all
 * work off whole days rather than loose photos.
 */
export interface ProgressPhotoDay {
  entry_date: string;
  weight: number | null;
  photos: Partial<Record<PhotoType, CheckInPhotoWithWeight>>;
}

/**
 * Folds the flat gallery response into one entry per calendar day, newest
 * first. The server already orders by entry_date DESC, so this keeps insertion
 * order rather than re-sorting.
 */
export function groupPhotosByDay(
  photos: CheckInPhotoWithWeight[]
): ProgressPhotoDay[] {
  const days = new Map<string, ProgressPhotoDay>();
  for (const photo of photos) {
    let day = days.get(photo.entry_date);
    if (!day) {
      day = { entry_date: photo.entry_date, weight: photo.weight, photos: {} };
      days.set(photo.entry_date, day);
    }
    // Every row for a day carries the same joined weight, but a day whose first
    // row happened to be null should still pick up a later non-null one.
    if (day.weight == null) day.weight = photo.weight;
    day.photos[photo.photo_type] = photo;
  }
  return [...days.values()];
}

/**
 * The days that have a photo of `angle`, oldest first. The comparison and the
 * time-lapse read left to right as progression, so they want the gallery
 * (which arrives newest first) the other way round. Does not touch `days`.
 */
export function framesForAngle(
  days: ProgressPhotoDay[],
  angle: PhotoType
): ProgressPhotoDay[] {
  return days.filter((day) => day.photos[angle]).reverse();
}

/** How far back the time-lapse reaches. */
export type TimelapseRange = '30d' | '3m' | 'all' | 'custom';

/** A picked time-lapse range: both ends inclusive, as YYYY-MM-DD. */
export interface CustomRange {
  from: string;
  to: string;
}

const TIMELAPSE_PRESET_DAYS: Record<'30d' | '3m', number> = {
  '30d': 30,
  '3m': 92,
};

/**
 * The frames a time-lapse window plays, and whether it was widened to the
 * whole history.
 *
 * Every window is evaluated as absolute day bounds, presets included (a preset
 * is just "N days back from today"), so one filter serves both. A preset with
 * fewer than two frames falls back to everything rather than to an empty
 * player, since someone whose shoots are all older than it would otherwise see
 * nothing. A custom range never widens: its dates were chosen on purpose, and
 * quietly playing more than them would misreport what is in them. A custom
 * range that has not been picked yet plays everything.
 */
export function framesInRange(
  frames: ProgressPhotoDay[],
  range: TimelapseRange,
  today: string,
  custom: CustomRange | null
): { frames: ProgressPhotoDay[]; widened: boolean } {
  if (range === 'all') return { frames, widened: false };
  let bounds: CustomRange;
  if (range === 'custom') {
    if (!custom) return { frames, widened: false };
    bounds = custom;
  } else {
    bounds = { from: addDays(today, -TIMELAPSE_PRESET_DAYS[range]), to: today };
  }
  const { from, to } = bounds;
  const windowed = frames.filter(
    (day) =>
      compareDays(day.entry_date, from) >= 0 &&
      compareDays(day.entry_date, to) <= 0
  );

  if (windowed.length >= 2 || range === 'custom') {
    return { frames: windowed, widened: false };
  }
  return { frames, widened: true };
}

/**
 * A weight change, already in the unit it will be shown in, rounded to one
 * decimal and signed: "+1.2", "-4.3", or "0" for no change. The caller adds
 * the unit label.
 */
export function formatSignedWeightChange(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  // String(-0) is "0", so a change that rounds away shows unsigned.
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
