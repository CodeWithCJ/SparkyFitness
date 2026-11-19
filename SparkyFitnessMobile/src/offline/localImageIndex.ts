import { File } from 'expo-file-system';

/** Remote address -> saved file, for one server. Read synchronously. */
let localIndex = new Map<string, string>();
let indexServerConfigId: string | null = null;

/** Replaces the in-memory list of saved pictures for a server. */
export function setLocalImageIndex(
  serverConfigId: string,
  entries: Iterable<[string, string]>
): void {
  localIndex = new Map(entries);
  indexServerConfigId = serverConfigId;
}

/** Forgets the saved pictures of a server. */
export function clearLocalImageIndex(serverConfigId: string): void {
  if (indexServerConfigId === serverConfigId) localIndex = new Map();
}

/**
 * The saved copy of a picture, if this phone has one (#1983). Synchronous,
 * so image code can call it while rendering. A copy the OS cleared from the
 * cache folder is treated as missing and fetched again on the next refresh.
 */
export function localImageUri(
  serverConfigId: string,
  remoteUri: string
): string | null {
  if (serverConfigId !== indexServerConfigId) return null;
  const fileUri = localIndex.get(remoteUri);
  if (fileUri == null) return null;
  try {
    if (new File(fileUri).exists) return fileUri;
  } catch {
    // An unreadable path counts as missing.
  }
  localIndex.delete(remoteUri);
  return null;
}
