// Append a freshly fetched page onto the results already on screen while
// dropping anything whose key is already present. Provider pagination can
// overlap at a page boundary (or repeat an item), which would otherwise produce
// duplicate React keys and repeated rows. Order is preserved: existing items
// stay put and only genuinely new items are appended.
export function dedupeAppend<T>(
  prev: T[],
  incoming: T[],
  keyOf: (item: T) => string
): T[] {
  const seen = new Set(prev.map(keyOf));
  const fresh: T[] = [];
  for (const item of incoming) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key); // also guards duplicates within the incoming page
    fresh.push(item);
  }
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}
