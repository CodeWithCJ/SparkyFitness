import { watchEquipmentLabel } from './watchPlates';

/** Width the watch's demo pictures are scaled to, and their JPEG quality. */
export const WATCH_DEMO_IMAGE_WIDTH = 240;
export const WATCH_DEMO_IMAGE_QUALITY = 0.7;

interface DemoSnapshot {
  id?: string | null;
  images?: readonly string[] | null;
  primary_muscles?: readonly string[] | null;
}

export interface WatchDemoFields {
  /** Cache key of the exercise's pictures on the watch (the exercise id). */
  imageKey?: string;
  /** How many pictures follow as files: 1 (a still) or 2 (start and end). */
  imageCount?: number;
  /** Primary muscle, capitalised, for the line under the name. */
  muscle?: string;
}

/** The first two image paths: the start and end positions. */
export function watchDemoImagePaths(
  snapshot: Pick<DemoSnapshot, 'images'> | null | undefined
): string[] {
  return (snapshot?.images ?? []).filter(Boolean).slice(0, 2);
}

/**
 * The optional demo fields of a watch plan exercise. Empty for an exercise
 * with no pictures, and an older watch ignores them.
 */
export function watchDemoFields(
  snapshot: DemoSnapshot | null | undefined
): WatchDemoFields {
  if (!snapshot) return {};
  const muscle = watchEquipmentLabel(snapshot.primary_muscles);
  const paths = watchDemoImagePaths(snapshot);
  return {
    ...(snapshot.id && paths.length > 0
      ? { imageKey: snapshot.id, imageCount: paths.length }
      : {}),
    ...(muscle ? { muscle } : {}),
  };
}
