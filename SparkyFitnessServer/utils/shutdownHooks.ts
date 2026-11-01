const backgroundWork = new Set<Promise<unknown>>();
let shuttingDown = false;

/**
 * Registers work a route or job starts without awaiting (a 202 reply, a
 * `void` call), so shutdown waits for it before closing the database pools.
 * Returns the same promise; the caller still handles its rejection.
 */
export function trackBackgroundWork<T>(work: Promise<T>): Promise<T> {
  const settled = work.then(
    () => undefined,
    () => undefined
  );
  backgroundWork.add(settled);
  void settled.then(() => backgroundWork.delete(settled));
  return work;
}

/** Resolves once every tracked piece of work, including any started meanwhile, has settled. */
export async function waitForBackgroundWork(): Promise<void> {
  while (backgroundWork.size > 0) {
    await Promise.all(backgroundWork);
  }
}

export function pendingBackgroundWorkCount(): number {
  return backgroundWork.size;
}

/** Set once shutdown begins, so long passes stop before starting more work. */
export function markShuttingDown(): void {
  shuttingDown = true;
}

export function isShuttingDown(): boolean {
  return shuttingDown;
}
