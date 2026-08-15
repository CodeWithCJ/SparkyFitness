import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

type ImageSource = { uri: string; headers: Record<string, string> };

export type GetFoodImageSource = (imagePath: string) => ImageSource | null;

/**
 * Resolves stored food/meal image paths to loadable `<Image>` sources.
 *
 * Mirrors `useExerciseImageSource`, with one difference: exercises store bare
 * filenames and the hook supplies the whole directory, whereas food images are
 * stored already server-relative (`/uploads/foods/<id>/...`) and only need the
 * server origin. Bare filenames are still handled for legacy rows, matching
 * web's `resolveFoodImageSrc`.
 *
 * No Authorization header is sent — `/uploads` is served statically and the web
 * app loads the same paths with a plain `<img>`. Proxy headers are still needed
 * so reverse-proxy-authenticated servers let the request through.
 */
export function useFoodImageSource() {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  // Deliberately not useFocusEffect (which the exercise equivalent uses): it
  // requires a navigation context, and this hook backs an app-root provider
  // that sits above the navigator. Re-reading on mount and on foreground
  // return covers the moments the active server can have changed underneath
  // us, without coupling an image URL to the navigation tree.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getActiveServerConfig().then((next) => {
        if (!cancelled) setConfig(next);
      });
    };

    load();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  // Cache resolved sources by image path so the same path yields a
  // referentially-stable object across renders. Without this, each render
  // builds a fresh { uri, headers } literal, which makes <Image>/<SafeImage>
  // treat it as a new source and reload — every food thumbnail in a list
  // flashes whenever the list re-renders.
  const cacheRef = useRef<Map<string, ImageSource>>(new Map());

  // Base URL / proxy headers change with the active server, so drop the cache
  // when config changes.
  useEffect(() => {
    cacheRef.current.clear();
  }, [config]);

  const getImageSource = useCallback<GetFoodImageSource>(
    (imagePath: string) => {
      if (!imagePath) return null;

      const cached = cacheRef.current.get(imagePath);
      if (cached) return cached;

      let source: ImageSource;
      // Absolute URLs (provider images that never localized) — use directly.
      if (
        imagePath.startsWith('http://') ||
        imagePath.startsWith('https://')
      ) {
        source = { uri: imagePath, headers: {} };
      } else if (!config) {
        // Don't cache until config resolves, so the path resolves once ready.
        return null;
      } else {
        const base = normalizeUrl(config.url);
        // The server mounts uploads at both /uploads and /api/uploads; use the
        // /api prefix so a single reverse-proxy rule covers every request.
        const uri = imagePath.startsWith('/uploads/')
          ? `${base}/api${imagePath}`
          : `${base}/api/uploads/foods/${imagePath}`;
        source = {
          uri,
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
