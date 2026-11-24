type Listener = () => void;

const listeners = new Set<Listener>();

/** Runs `listener` whenever the upload queue changes. Returns the unsubscribe. */
export function subscribeOutboxChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells screens showing the upload queue to read it again. */
export function notifyOutboxChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One screen's failure must not stop the others being told.
    }
  }
}

const diaryDayListeners = new Set<Listener>();

/** Runs `listener` whenever a diary day's workouts were saved on the phone. */
export function subscribeDiaryDaySaved(listener: Listener): () => void {
  diaryDayListeners.add(listener);
  return () => {
    diaryDayListeners.delete(listener);
  };
}

/** Tells the offline diary view to read the saved day again. */
export function notifyDiaryDaySaved(): void {
  for (const listener of [...diaryDayListeners]) {
    try {
      listener();
    } catch {
      // One screen's failure must not stop the others being told.
    }
  }
}

const uploadsConfirmedListeners = new Set<Listener>();

/** Runs `listener` whenever an upload run got the server to confirm something. */
export function subscribeUploadsConfirmed(listener: Listener): () => void {
  uploadsConfirmedListeners.add(listener);
  return () => {
    uploadsConfirmedListeners.delete(listener);
  };
}

/** Tells the app the server now has more than it had before this upload run. */
export function notifyUploadsConfirmed(): void {
  for (const listener of [...uploadsConfirmedListeners]) {
    try {
      listener();
    } catch {
      // One listener's failure must not stop the others being told.
    }
  }
}

const accountChangedListeners = new Set<Listener>();

/** Runs `listener` once an account change has cleared the old one's data. */
export function subscribeAccountChanged(listener: Listener): () => void {
  accountChangedListeners.add(listener);
  return () => {
    accountChangedListeners.delete(listener);
  };
}

/**
 * Tells the app the account on the phone changed: the previous one's caches
 * are cleared and the cookie sweep has run (a failed sweep is logged).
 * `queryClient.clear()` does not tell the observers already mounted, so a
 * component that lives outside the screens (no focus to refetch on) renders
 * again on this to read the new account.
 */
export function notifyAccountChanged(): void {
  for (const listener of [...accountChangedListeners]) {
    try {
      listener();
    } catch {
      // One listener's failure must not stop the others being told.
    }
  }
}
