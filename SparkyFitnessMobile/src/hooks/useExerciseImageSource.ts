import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
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
