/**
 * Runs an async mapper over items with a cap on how many are in flight.
 *
 * The server has no `p-limit` or equivalent (mobile's `runTasksInBatches` is
 * not importable here), and the food-photo matcher fans out one provider lookup
 * per unmatched ingredient. Nothing throttles OpenFoodFacts server-side, so an
 * unbounded `Promise.all` over a ten-ingredient plate would burst ten requests
 * at a provider that may rate-limit or simply be slow.
 *
 * Results keep input order. A rejected mapper is not caught here — callers that
 * must not fail should resolve to a fallback inside the mapper.
 */
export async function boundedMap<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}
