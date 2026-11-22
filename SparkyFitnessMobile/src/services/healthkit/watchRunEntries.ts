import { loadHealthPreference, saveHealthPreference } from './preferences';

const KEY = 'writebackWatchRunEntryIds';
// Enough for months of runs; an older entry's Health copy is long settled.
const MAX_REMEMBERED = 500;

/**
 * Remembers a diary entry made from a walk or run the Apple Watch app
 * recorded. The watch saved that workout to Apple Health itself, so
 * write-back must not save a second one. Matching by time is not enough: the
 * entry reaches the phone, and its write-back runs, before the watch's
 * workout has always synced into the phone's Health, and a watch run's
 * Health workout carries the watch's own run id, not the entry's.
 */
export async function noteWatchRunEntry(entryId: string): Promise<void> {
  try {
    const known = (await loadHealthPreference<string[]>(KEY)) ?? [];
    if (known.includes(entryId)) return;
    await saveHealthPreference(KEY, [...known, entryId].slice(-MAX_REMEMBERED));
  } catch {
    // Best effort: without the note write-back falls back to comparing times.
  }
}

export async function loadWatchRunEntryIds(): Promise<Set<string>> {
  try {
    return new Set((await loadHealthPreference<string[]>(KEY)) ?? []);
  } catch {
    return new Set();
  }
}
