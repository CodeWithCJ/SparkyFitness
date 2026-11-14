/**
 * Runs async tasks one at a time, in the order they were queued. A stored
 * record changed by read, modify, write must not have two such changes in
 * flight: the later write would drop the earlier one while both report
 * success. A failed task does not stop the ones queued after it.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
