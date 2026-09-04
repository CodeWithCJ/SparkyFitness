import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  getActiveServerConfig,
  proxyHeadersToRecord,
} from '../services/storage';
import { getAuthHeaders } from '../services/api/authService';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

export type CheckInPhotoSource = {
  uri: string;
  headers: Record<string, string>;
};

/**
 * Builds `<SafeImage>` sources for progress photos.
 *
 * These bytes are not public uploads: `/check-in-photos/file/:id` sits behind
 * `authenticate` plus the `checkin` permission, so a bare URI renders as a
 * broken image and every source carries the auth and proxy headers.
 *
 * Each source is memoized by photo id to keep its object identity stable: a
 * fresh `{uri, headers}` literal per render reads as a new source to
 * expo-image, which reloads the picture mid-scroll and restarts the time-lapse.
 */
export function useCheckInPhotoSource() {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      getActiveServerConfig().then(setConfig);
    }, [])
  );

  const cacheRef = useRef<Map<string, CheckInPhotoSource>>(new Map());

  // Base URL and proxy/auth headers belong to the active server, so drop the
  // memo when the user switches servers.
  useEffect(() => {
    cacheRef.current.clear();
  }, [config]);

  const getPhotoSource = useCallback(
    (photoId: string): CheckInPhotoSource | null => {
      if (!photoId || !config) return null;

      // Unlike the exercise and food image sources, these carry the session
      // token, so a plaintext base URL would put it on the wire. Null renders
      // SafeImage's fallback, which every caller here already handles.
      const base = normalizeUrl(config.url);
      if (!__DEV__ && base.toLowerCase().startsWith('http://')) return null;

      const cached = cacheRef.current.get(photoId);
      if (cached) return cached;

      const source: CheckInPhotoSource = {
        uri: `${base}/api/measurements/check-in-photos/file/${encodeURIComponent(photoId)}`,
        headers: {
          ...proxyHeadersToRecord(config.proxyHeaders),
          ...getAuthHeaders(config),
        },
      };
      cacheRef.current.set(photoId, source);
      return source;
    },
    [config]
  );

  return { getPhotoSource, isReady: config !== null };
}
