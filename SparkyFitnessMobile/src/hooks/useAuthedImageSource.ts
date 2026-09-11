import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

export type AuthedImageSource = {
  uri: string;
  headers: Record<string, string>;
};

/**
 * Builds `<SafeImage>` sources for images that sit behind authentication.
 *
 * Some image bytes are not public uploads — they are served by owner-checked
 * routes, so a bare URI renders as a broken image and every source has to carry
 * the auth and proxy headers.
 *
 * Each source is memoized by id to keep its object identity stable: a fresh
 * `{uri, headers}` literal per render reads as a new source to expo-image,
 * which reloads the picture mid-scroll and restarts the time-lapse.
 *
 * @param pathPrefix API path the id is appended to, e.g.
 *   `/api/measurements/check-in-photos/file/`. Pass a constant — it keys the
 *   returned callback.
 */
export function useAuthedImageSource(pathPrefix: string) {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Guard against a config read that rejects (storage failure) or resolves
      // after the screen has lost focus, which would otherwise leave an
      // unhandled rejection or apply a stale server's headers.
      let active = true;
      void getActiveServerConfig()
        .then((nextConfig) => {
          if (active) setConfig(nextConfig);
        })
        .catch(() => {
          if (active) setConfig(null);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  const cacheRef = useRef<Map<string, AuthedImageSource>>(new Map());

  // Base URL and proxy/auth headers belong to the active server, so drop the
  // memo when the user switches servers.
  useEffect(() => {
    cacheRef.current.clear();
  }, [config]);

  const getPhotoSource = useCallback(
    (photoId: string): AuthedImageSource | null => {
      if (!photoId || !config) return null;

      // Unlike the exercise and food image sources, these carry the session
      // token, so a plaintext base URL would put it on the wire. Null renders
      // SafeImage's fallback, which every caller here already handles.
      const base = normalizeUrl(config.url);
      if (!__DEV__ && base.toLowerCase().startsWith('http://')) return null;

      const cached = cacheRef.current.get(photoId);
      if (cached) return cached;

      const source: AuthedImageSource = {
        uri: `${base}${pathPrefix}${encodeURIComponent(photoId)}`,
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
        },
      };
      cacheRef.current.set(photoId, source);
      return source;
    },
    [config, pathPrefix]
  );

  return { getPhotoSource, isReady: config !== null };
}
