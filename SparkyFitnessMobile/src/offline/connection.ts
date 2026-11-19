/**
 * What the offline code knows about the server, kept here so the API clients
 * can ask without importing the query client (which imports them).
 */
let knownUnreachable = false;

type Listener = () => void;
const fallbackListeners = new Set<Listener>();

/** Set by the query client whenever its connection check answers. */
export function setServerKnownUnreachable(unreachable: boolean): void {
  knownUnreachable = unreachable;
}

/** True once a connection check has failed and none has passed since. */
export function isServerKnownUnreachable(): boolean {
  return knownUnreachable;
}

/**
 * Runs `listener` when a request failed for connection reasons and saved
 * data was served instead. The query client re-checks the connection then;
 * without this the swallowed error would hide the outage from it.
 */
export function subscribeOfflineFallbackUsed(listener: Listener): () => void {
  fallbackListeners.add(listener);
  return () => {
    fallbackListeners.delete(listener);
  };
}

export function notifyOfflineFallbackUsed(): void {
  for (const listener of [...fallbackListeners]) listener();
}
