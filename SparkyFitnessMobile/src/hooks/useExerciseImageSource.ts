import { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { getActiveServerConfig, proxyHeadersToRecord } from '../services/storage';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

export type GetImageSource = (imagePath: string) => {
  uri: string;
  headers: Record<string, string>;
} | null;

export function useExerciseImageSource() {
  const [config, setConfig] = useState<ServerConfig | null>(null);

  useFocusEffect(
    useCallback(() => {
      getActiveServerConfig().then(setConfig);
    }, []),
  );

  const getImageSource = useCallback<GetImageSource>(
    (imagePath: string) => {
      if (!imagePath) return null;

      // Absolute URLs (external sources) — use directly
      if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return { uri: imagePath, headers: {} };
      }

      if (!config) return null;

      return {
        uri: `${normalizeUrl(config.url)}/api/uploads/exercises/${imagePath}`,
        headers: proxyHeadersToRecord(config.proxyHeaders),
      };
    },
    [config],
  );

  return { getImageSource };
}
