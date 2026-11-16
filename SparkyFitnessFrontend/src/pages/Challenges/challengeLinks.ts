import { challengeInviteCodeSchema } from '@workspace/shared';

/** The page an invite link opens; the code rides in the fragment. */
export const CHALLENGE_JOIN_PATH = '/challenges/join';

/**
 * The invite link a host shares. The code is in the fragment (after `#`), so
 * it is never sent to the server in a request line or written to proxy logs
 * or browser history entries the server can see.
 */
export function challengeInviteLink(origin: string, code: string): string {
  return `${origin}${CHALLENGE_JOIN_PATH}#${code}`;
}

/**
 * The invite code in what someone pasted: a bare code, or an invite link
 * (code after `#`, or a `code=` parameter). Null when there is none.
 */
export function inviteCodeFrom(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates = [trimmed];
  const hash = trimmed.lastIndexOf('#');
  if (hash >= 0) candidates.push(trimmed.slice(hash + 1));
  const param = /[?&#]code=([^&#\s]+)/.exec(trimmed);
  if (param?.[1]) {
    try {
      candidates.push(decodeURIComponent(param[1]));
    } catch {
      // Bad percent-encoding: not a code.
    }
  }
  for (const candidate of candidates) {
    const parsed = challengeInviteCodeSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** Where an invite opened while signed out waits for the sign-in. */
const PENDING_INVITE_KEY = 'sparky.challenges.pendingInvite';
/** A kept invite is dropped after this long, so it never reaches a later sign-in. */
export const PENDING_INVITE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Keeps the code of an invite link opened while signed out, so the join can
 * resume after sign-in. Session storage stays in this tab (it survives an
 * OIDC round trip) and the code never goes into a query parameter. It is
 * stamped and dropped after PENDING_INVITE_MAX_AGE_MS, and sign-out clears it,
 * so someone else signing in later in the same tab does not get it.
 */
export function rememberPendingInvite(hash: string, now = Date.now()): void {
  const code = inviteCodeFrom(hash);
  if (!code) return;
  try {
    sessionStorage.setItem(
      PENDING_INVITE_KEY,
      JSON.stringify({ code, savedAt: now })
    );
  } catch {
    // Storage blocked: the person opens the link again after signing in.
  }
}

/** Forgets a kept invite (on sign-out). */
export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing kept, or storage blocked.
  }
}

/** The code kept by rememberPendingInvite, if still fresh; removed as it is read. */
export function takePendingInvite(now = Date.now()): string | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (raw === null) return null;
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    const kept = JSON.parse(raw) as { code?: unknown; savedAt?: unknown };
    if (
      typeof kept.code !== 'string' ||
      typeof kept.savedAt !== 'number' ||
      now - kept.savedAt > PENDING_INVITE_MAX_AGE_MS ||
      now < kept.savedAt
    )
      return null;
    return inviteCodeFrom(kept.code);
  } catch {
    return null;
  }
}
