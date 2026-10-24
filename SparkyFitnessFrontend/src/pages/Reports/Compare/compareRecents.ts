import {
  type CompareQuestion,
  knownCompareQuestions,
  withRecentQuestion,
} from '@workspace/shared';

// The last few questions asked, kept in this browser only (as the phone keeps
// them on the device), so the start state can offer them again. They are kept
// per account, so a browser a family shares never offers one person's
// questions to another. The older entry without an account is ignored.
const STORAGE_PREFIX = 'sparky.compareRecentQuestions.v1';

const storageKey = (userId: string) => `${STORAGE_PREFIX}.${userId}`;

/**
 * The account's stored recents this build still knows, since-habit questions
 * included. Without an account there are none.
 */
export function loadRecentQuestions(
  userId: string | undefined
): CompareQuestion[] {
  if (!userId) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    return knownCompareQuestions(JSON.parse(raw) as unknown);
  } catch {
    // Storage blocked or the value is not JSON.
    return [];
  }
}

/**
 * Puts `q` first, keeps the newest five, and returns the new list. Without an
 * account nothing is stored.
 */
export function saveRecentQuestion(
  userId: string | undefined,
  q: CompareQuestion
): CompareQuestion[] {
  const next = withRecentQuestion(loadRecentQuestions(userId), q);
  if (!userId) return next;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Keep the list for this tab only.
  }
  return next;
}
