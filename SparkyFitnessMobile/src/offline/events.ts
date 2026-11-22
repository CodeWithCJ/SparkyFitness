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
