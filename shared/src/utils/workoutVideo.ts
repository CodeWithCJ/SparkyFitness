import type { ExerciseModality } from '../constants/exercise.ts';

export interface WorkoutVideoTiming {
  video_start_seconds?: number | null;
  video_end_seconds?: number | null;
}

interface WorkoutVideoCue {
  exerciseIndex: number;
  start_seconds: number;
  end_seconds: number;
}

export interface WorkoutVideoRange {
  start: number;
  end: number;
}

export type WorkoutVideoSource =
  { kind: 'youtube'; id: string } | { kind: 'file'; url: string };

const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

export function parseWorkoutVideoUrl(value: string): WorkoutVideoSource | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return null;
  }

  if (url.hostname === 'youtu.be' || youtubeHosts.has(url.hostname)) {
    const [, first, second, extra] = url.pathname.split('/');
    const id =
      url.hostname === 'youtu.be' && !second
        ? first
        : first === 'watch'
          ? url.searchParams.get('v')
          : (first === 'embed' || first === 'shorts') && !extra
            ? second
            : null;
    return id && /^[\w-]{11}$/.test(id) ? { kind: 'youtube', id } : null;
  }

  return { kind: 'file', url: url.href };
}

export function hasInvalidWorkoutVideoTiming(
  exercise: WorkoutVideoTiming
): boolean {
  const start = exercise.video_start_seconds;
  const end = exercise.video_end_seconds;
  if (start == null && end == null) return false;
  return (
    start == null ||
    end == null ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end <= start ||
    end > 2_147_483_647
  );
}

export interface WorkoutVideoSetCompletion {
  segmentSeconds: number;
  /** A single timed set records the segment and can be corrected later. */
  useSetDuration: boolean;
}

export function workoutVideoSetCompletion(
  timing: WorkoutVideoTiming,
  modality: ExerciseModality | undefined,
  setCount: number
): WorkoutVideoSetCompletion | undefined {
  const { video_start_seconds: start, video_end_seconds: end } = timing;
  if (start == null || end == null || hasInvalidWorkoutVideoTiming(timing)) {
    return undefined;
  }
  return {
    segmentSeconds: end - start,
    useSetDuration:
      setCount === 1 &&
      (modality === 'duration' || modality === 'duration_distance'),
  };
}

/** All sets logged by the same segment contribute its duration once. */
export function getWorkoutVideoExerciseDurationMinutes<
  TSet extends { duration?: number | null },
>(
  sets: readonly TSet[],
  completionFor: (set: TSet) => WorkoutVideoSetCompletion | undefined
): number | undefined {
  for (const set of sets) {
    const completion = completionFor(set);
    if (completion) {
      const correctedSeconds = completion.useSetDuration ? set.duration : null;
      return (correctedSeconds ?? completion.segmentSeconds) / 60;
    }
  }
  return undefined;
}

export function buildWorkoutVideoTimeline(
  exercises: readonly WorkoutVideoTiming[]
): WorkoutVideoCue[] {
  return exercises
    .flatMap(
      (
        { video_start_seconds: start, video_end_seconds: end },
        exerciseIndex
      ) =>
        start != null && end != null && end > start
          ? [{ exerciseIndex, start_seconds: start, end_seconds: end }]
          : []
    )
    .sort((a, b) => a.start_seconds - b.start_seconds);
}

export function hasOverlappingWorkoutVideoTimings(
  exercises: readonly WorkoutVideoTiming[]
): boolean {
  const timeline = buildWorkoutVideoTimeline(exercises);
  return timeline.some(
    (cue, index) =>
      index > 0 && timeline[index - 1]!.end_seconds > cue.start_seconds
  );
}

export function getWorkoutVideoPosition(
  timeline: readonly WorkoutVideoCue[],
  seconds: number
) {
  const current =
    timeline.find(
      (cue) => seconds >= cue.start_seconds && seconds < cue.end_seconds
    ) ?? null;
  const next = timeline.find((cue) => cue.start_seconds > seconds) ?? null;
  const duration = timeline.at(-1)?.end_seconds ?? 0;
  return {
    current,
    next,
    remainingSeconds: current ? Math.ceil(current.end_seconds - seconds) : 0,
    progress: duration ? Math.min(1, Math.max(0, seconds / duration)) : 0,
  };
}

/** Track played ranges separately from the playhead. Seeking never fills a gap. */
export function advanceWorkoutVideo(
  timeline: readonly WorkoutVideoCue[],
  played: readonly WorkoutVideoRange[],
  range: WorkoutVideoRange
) {
  const ordered = [...played];
  if (
    Number.isFinite(range.start) &&
    Number.isFinite(range.end) &&
    range.end > range.start
  ) {
    ordered.push(range);
  }
  ordered.sort((a, b) => a.start - b.start);
  const merged: WorkoutVideoRange[] = [];
  for (const entry of ordered) {
    const previous = merged.at(-1);
    if (previous && entry.start <= previous.end) {
      previous.end = Math.max(previous.end, entry.end);
    } else {
      merged.push({ ...entry });
    }
  }
  return {
    played: merged,
    completedIndexes: timeline
      .filter((cue) =>
        merged.some(
          (entry) =>
            entry.start <= cue.start_seconds && entry.end >= cue.end_seconds
        )
      )
      .map((cue) => cue.exerciseIndex),
  };
}
