import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const CHUNK_RECOVERY_STORAGE_PREFIX = 'sparkyfitness:chunk-recovery';
const NEVER_RESOLVING_IMPORT = new Promise<never>(() => {});
const STALE_CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
];

export const CHUNK_RECOVERY_TTL_MS = 30_000;
export const chunkRecoveryRuntime = {
  reloadWindowLocation: () => window.location.reload(),
};

// React's lazy component inference needs a permissive component constraint here
// so each wrapped component keeps its own prop type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyComponentModule<T extends ComponentType<any>> = {
  default: T;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LazyImporter<T extends ComponentType<any>> = () => Promise<
  LazyComponentModule<T>
>;

const canUseWindow = () => typeof window !== 'undefined';

const getSessionStorage = (): Storage | null => {
  if (!canUseWindow()) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

const getCurrentUrlKey = () => {
  if (!canUseWindow()) {
    return '';
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
};

const getGuardKey = (urlKey: string) =>
  `${CHUNK_RECOVERY_STORAGE_PREFIX}:${urlKey}`;

const getErrorValue = (error: unknown, key: 'name' | 'message') => {
  if (error instanceof Error) {
    return error[key];
  }

  if (typeof error === 'string') {
    return key === 'message' ? error : '';
  }

  if (
    error &&
    typeof error === 'object' &&
    key in error &&
    typeof (error as Record<string, unknown>)[key] === 'string'
  ) {
    return String((error as Record<string, unknown>)[key]);
  }

  return '';
};

export const isStaleChunkLoadError = (error: unknown) => {
  const name = getErrorValue(error, 'name');
  const message = getErrorValue(error, 'message');

  if (name === 'ChunkLoadError') {
    return true;
  }

  return STALE_CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const hasRecentChunkRecoveryReload = (
  urlKey = getCurrentUrlKey(),
  now = Date.now()
) => {
  const storage = getSessionStorage();

  if (!storage || !urlKey) {
    return false;
  }

  const guardKey = getGuardKey(urlKey);
  const storedAttempt = storage.getItem(guardKey);

  if (!storedAttempt) {
    return false;
  }

  try {
    const parsedAttempt = JSON.parse(storedAttempt) as { timestamp?: number };

    if (typeof parsedAttempt.timestamp !== 'number') {
      storage.removeItem(guardKey);
      return false;
    }

    if (now - parsedAttempt.timestamp <= CHUNK_RECOVERY_TTL_MS) {
      return true;
    }

    storage.removeItem(guardKey);
    return false;
  } catch {
    storage.removeItem(guardKey);
    return false;
  }
};

export const canAttemptChunkRecoveryReload = (
  urlKey = getCurrentUrlKey(),
  now = Date.now()
) => {
  const storage = getSessionStorage();

  if (!storage || !urlKey) {
    return false;
  }

  return !hasRecentChunkRecoveryReload(urlKey, now);
};

export const triggerChunkRecoveryReload = (
  urlKey = getCurrentUrlKey(),
  now = Date.now()
) => {
  const storage = getSessionStorage();

  if (!storage || !urlKey || hasRecentChunkRecoveryReload(urlKey, now)) {
    return false;
  }

  try {
    storage.setItem(getGuardKey(urlKey), JSON.stringify({ timestamp: now }));
  } catch {
    return false;
  }

  chunkRecoveryRuntime.reloadWindowLocation();
  return true;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const lazyWithChunkRecovery = <T extends ComponentType<any>>(
  importer: LazyImporter<T>
): LazyExoticComponent<T> =>
  lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      if (isStaleChunkLoadError(error) && triggerChunkRecoveryReload()) {
        return NEVER_RESOLVING_IMPORT as Promise<LazyComponentModule<T>>;
      }

      throw error;
    }
  });
