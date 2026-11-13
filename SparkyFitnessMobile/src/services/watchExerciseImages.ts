import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import WatchConnectivity from '../../modules/watch-connectivity';
import { addLog } from './LogService';
import { getActiveServerConfig } from './storage';
import { resolveExerciseImageSource } from '../utils/exerciseImageSource';
import {
  WATCH_DEMO_IMAGE_QUALITY,
  WATCH_DEMO_IMAGE_WIDTH,
  watchDemoImagePaths,
} from '../utils/watchExerciseImages';

interface DemoExercise {
  exercise_snapshot?: {
    id?: string | null;
    images?: readonly string[] | null;
  } | null;
}

// `armedAt:key` of every exercise already handed to WatchConnectivity, so a
// plan resend does not download and transfer again. A new arm sends again:
// the watch may have been reinstalled or tidied its cache since.
const sent = new Set<string>();
const inFlight = new Set<string>();
let counter = 0;

/**
 * Sends the demo pictures of a live workout's exercises to the watch as small
 * JPEGs (240 px wide, quality 0.7, about 15 KB each) through
 * a watch message (queued with `transferUserInfo` when the watch is not
 * reachable): delivered over the phone link even when the watch has no
 * network of its own. The watch caches them by exercise
 * id. Best effort: a failed download or transfer is logged and the watch just
 * has no demo page for that exercise.
 */
export async function sendWatchExerciseImages(
  exercises: readonly DemoExercise[],
  armedAt: number
): Promise<void> {
  if (
    !WatchConnectivity?.isSupported() ||
    !WatchConnectivity.sendExerciseImage
  ) {
    addLog(
      'Watch exercise images skipped: native sendExerciseImage unavailable',
      'WARNING'
    );
    return;
  }
  let config: Awaited<ReturnType<typeof getActiveServerConfig>>;
  try {
    config = await getActiveServerConfig();
  } catch (error) {
    addLog(
      `Watch exercise images skipped: server config unavailable: ${String(error)}`,
      'WARNING'
    );
    return;
  }
  for (const exercise of exercises) {
    const key = exercise.exercise_snapshot?.id;
    const paths = watchDemoImagePaths(exercise.exercise_snapshot);
    const marker = `${armedAt}:${key}`;
    if (!key || paths.length === 0 || sent.has(marker) || inFlight.has(marker))
      continue;
    inFlight.add(marker);
    try {
      for (const [index, path] of paths.entries()) {
        const source = resolveExerciseImageSource(path, config);
        if (!source) throw new Error('no image source');
        const jpegUri = await downscaleForWatch(source);
        await WatchConnectivity.sendExerciseImage({
          key,
          index,
          uri: jpegUri,
        });
      }
      sent.add(marker);
    } catch (error) {
      addLog(`Watch exercise image not sent: ${String(error)}`, 'WARNING');
    } finally {
      inFlight.delete(marker);
    }
  }
}

async function downscaleForWatch(source: {
  uri: string;
  headers: Record<string, string>;
}): Promise<string> {
  // A name of its own: two exercises' pictures are both called 0.jpg or 1.jpg.
  const destination = new File(
    Paths.cache,
    `watch-demo-${Date.now()}-${(counter += 1)}.jpg`
  );
  const download = await File.downloadFileAsync(source.uri, destination, {
    headers: source.headers,
    idempotent: true,
  });
  try {
    const context = ImageManipulator.manipulate(download.uri).resize({
      width: WATCH_DEMO_IMAGE_WIDTH,
    });
    const image = await context.renderAsync();
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: WATCH_DEMO_IMAGE_QUALITY,
    });
    return result.uri;
  } finally {
    try {
      download.delete();
    } catch {
      // The cache directory is purged by the OS anyway.
    }
  }
}
