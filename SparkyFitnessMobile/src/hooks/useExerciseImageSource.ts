import { useState, useCallback, useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { useFocusEffect } from '@react-navigation/native';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../services/storage';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

type ImageSource = { uri: string; headers: Record<string, string> };

export type GetImageSource = (imagePath: string) => ImageSource | null;

export function useExerciseImageSource() {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      getActiveServerConfig().then(setConfig);
    }, []),
  );

  // Cache resolved sources by image path so the same path yields a
  // referentially-stable object across renders. Without this, each render
  // builds a fresh { uri, headers } literal, which makes <Image>/<SafeImage>
  // treat it as a new source and reload — e.g. every exercise thumbnail flashes
  // when the list re-renders after adding an exercise.
  const cacheRef = useRef<Map<string, ImageSource>>(new Map());

  // Base URL / proxy headers change with the active server, so drop the cache
  // when config changes.
  useEffect(() => {
    cacheRef.current.clear();
  }, [config]);

  const getImageSource = useCallback<GetImageSource>(
    (imagePath: string) => {
      if (!imagePath) return null;

      const cached = cacheRef.current.get(imagePath);
      if (cached) return cached;

      let source: ImageSource;
      // Absolute URLs (external sources) — use directly
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        source = { uri: imagePath, headers: {} };
      } else if (imagePath.startsWith('/') && config) {
        // Already server-rooted: the CSV importers persist downloadImage's
        // return value (`/uploads/exercises/...`) verbatim, so appending it to
        // the prefix below yields `/api/uploads/exercises//uploads/...`.
        source = {
          uri: `${normalizeUrl(config.url)}/api${imagePath}`,
          headers: proxyHeadersToRecord(config.proxyHeaders),
        };
      } else if (!config) {
        // Don't cache until config resolves, so the path resolves once ready.
        return null;
      } else {
        source = {
          uri: `${normalizeUrl(config.url)}/api/uploads/exercises/${imagePath}`,
          headers: proxyHeadersToRecord(config.proxyHeaders),
        };
      }

      cacheRef.current.set(imagePath, source);
      return source;
    },
    [config],
  );

  return { getImageSource };
}

// Aspect ratios within this relative tolerance overlay cleanly; beyond it the
// subject visibly re-scales or shifts mid-dissolve.
const PAIR_ASPECT_TOLERANCE = 0.1;

/**
 * Resolves whether two images share roughly one aspect ratio, so callers can
 * reserve the crossfade for frames that overlay cleanly (user uploads are
 * arbitrary). `undefined` while measuring, `false` only on a confirmed
 * mismatch. An unreadable size also stays `undefined`: the image itself
 * likely fails to render too, and a fallback presentation shouldn't switch
 * modes over it. Ignores arrays that are not exactly a pair.
 */
export function useImagePairAspectMatch(
  sources: readonly ImageSource[],
): boolean | undefined {
  const [match, setMatch] = useState<boolean | undefined>(undefined);

  // Reset during render (not in the effect) so a source change never shows
  // the previous pair's verdict for a frame.
  const [prevSources, setPrevSources] = useState(sources);
  if (sources !== prevSources) {
    setPrevSources(sources);
    setMatch(undefined);
  }

  useEffect(() => {
    if (sources.length !== 2) return;

    let cancelled = false;
    // The pair is about to render through expo-image, so measuring through the
    // same pipeline means one download and one disk-cache entry serve both the
    // probe and the render. A failed load leaves its ratio at 0, keeping the
    // verdict undefined per the contract above.
    Promise.allSettled(sources.map(source => Image.loadAsync(source))).then(
      results => {
        const refs = results.map(result =>
          result.status === 'fulfilled' ? result.value : null,
        );
        const [a, b] = refs.map(ref =>
          ref && ref.height > 0 ? ref.width / ref.height : 0,
        );
        if (!cancelled && a > 0 && b > 0) {
          setMatch(Math.abs(a - b) / Math.max(a, b) <= PAIR_ASPECT_TOLERANCE);
        }
        // ImageRefs pin the decoded bitmaps in native memory; only the
        // dimensions are needed here.
        for (const ref of refs) ref?.release();
      },
    );

    return () => {
      cancelled = true;
    };
  }, [sources]);

  return match;
}
