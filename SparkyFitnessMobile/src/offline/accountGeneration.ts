/**
 * Counts the times the signed-in account changed in this run of the app.
 *
 * What the phone saves for offline use is keyed by the server configuration,
 * and an account switch on the same server keeps that configuration. A
 * request or a refresh that started before a switch can therefore finish
 * after the cache was cleared and write the previous account's answer under
 * the same key. Such work takes the number when it starts and writes only
 * while it is still the same.
 */
let generation = 0;

export function accountGeneration(): number {
  return generation;
}

/** Called when the signed-in account changes, before the cache is cleared. */
export function bumpAccountGeneration(): void {
  generation += 1;
}
