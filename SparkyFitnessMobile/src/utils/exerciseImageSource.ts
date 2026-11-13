import { proxyHeadersToRecord } from '../services/storage';
import { normalizeUrl } from '../services/api/apiClient';
import type { ServerConfig } from '../services/storage';

export type ExerciseImageSource = {
  uri: string;
  headers: Record<string, string>;
};

/**
 * Where an exercise image path lives: absolute URLs as they are, server-rooted
 * paths and bare file names under the active server's uploads. Null for an empty
 * path or when a server-relative path has no config to resolve against.
 */
export function resolveExerciseImageSource(
  imagePath: string,
  config: ServerConfig | null
): ExerciseImageSource | null {
  if (!imagePath) return null;
  // Absolute URLs (external sources) -- use directly
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return { uri: imagePath, headers: {} };
  }
  if (!config) return null;
  if (imagePath.startsWith('/')) {
    // Already server-rooted: the CSV importers persist downloadImage's
    // return value (`/uploads/exercises/...`) verbatim, so appending it to
    // the prefix below yields `/api/uploads/exercises//uploads/...`.
    return {
      uri: `${normalizeUrl(config.url)}/api${imagePath}`,
      headers: proxyHeadersToRecord(config.proxyHeaders),
    };
  }
  return {
    uri: `${normalizeUrl(config.url)}/api/uploads/exercises/${imagePath}`,
    headers: proxyHeadersToRecord(config.proxyHeaders),
  };
}
