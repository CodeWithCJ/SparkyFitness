import { getActiveServerConfigId } from '../services/storage';
import { accountGeneration, savedCopyReadable } from './accountGeneration';
import { serverMayBeDown } from '../utils/serverErrors';
import {
  isServerKnownUnreachable,
  notifyOfflineFallbackUsed,
} from './connection';
import { getOfflineDb } from './db';
import type { OfflineDb } from './types';

interface OfflineFallbackOptions<T> {
  /** The normal request to the server. */
  fetch: () => Promise<T>;
  /** Keeps a successful answer for later. Failures here are ignored. */
  store?: (db: OfflineDb, serverConfigId: string, value: T) => Promise<void>;
  /** The saved answer, or null when there is none. */
  read: (db: OfflineDb, serverConfigId: string) => Promise<T | null>;
}

async function readSaved<T>(
  read: OfflineFallbackOptions<T>['read']
): Promise<T | null> {
  try {
    // Not while an account change is clearing the saved copy, nor after a
    // clean-up that failed: that copy may be the previous account's.
    if (!(await savedCopyReadable())) return null;
    const serverConfigId = await getActiveServerConfigId();
    if (!serverConfigId) return null;
    return await read(await getOfflineDb(), serverConfigId);
  } catch {
    // The offline file being unreadable must never turn into a new error;
    // the caller reports the request's own failure instead.
    return null;
  }
}

/**
 * Asks the server, and when it cannot be reached answers from what the phone
 * saved earlier. A request the server answered with an error (a 4xx) is
 * never replaced by saved data: that is a real answer.
 *
 * While the connection check already says the server is away, saved data is
 * returned at once instead of waiting for each request to time out. The
 * connection check itself notices when the server is back.
 */
export async function withOfflineFallback<T>({
  fetch,
  store,
  read,
}: OfflineFallbackOptions<T>): Promise<T> {
  if (isServerKnownUnreachable()) {
    const saved = await readSaved(read);
    if (saved !== null) {
      // No request was made, so nothing else would notice the server coming
      // back; the (throttled) connection re-check does.
      notifyOfflineFallbackUsed();
      return saved;
    }
  }
  // The answer belongs to the account that asked; if the account changed
  // while the request was out, it is returned but not saved.
  const generation = accountGeneration();
  let value: T;
  try {
    value = await fetch();
  } catch (error) {
    if (!serverMayBeDown(error)) throw error;
    const saved = await readSaved(read);
    if (saved === null) throw error;
    notifyOfflineFallbackUsed();
    return saved;
  }
  if (store && accountGeneration() === generation) {
    try {
      const serverConfigId = await getActiveServerConfigId();
      if (serverConfigId && accountGeneration() === generation) {
        await store(await getOfflineDb(), serverConfigId, value);
      }
    } catch {
      // Saving for later is a bonus; the request itself succeeded.
    }
  }
  return value;
}
