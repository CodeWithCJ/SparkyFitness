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

/**
 * Keeps the code of an invite link opened while signed out, so the join can
 * resume after sign-in. Session storage stays in this tab (it survives an
 * OIDC round trip) and the code never goes into a query parameter.
 */
export function rememberPendingInvite(hash: string): void {
  const code = inviteCodeFrom(hash);
  if (!code) return;
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // Storage blocked: the person opens the link again after signing in.
  }
}

/** The code kept by rememberPendingInvite, removed as it is read. */
export function takePendingInvite(): string | null {
  try {
    const code = sessionStorage.getItem(PENDING_INVITE_KEY);
    if (code !== null) sessionStorage.removeItem(PENDING_INVITE_KEY);
    return code ? inviteCodeFrom(code) : null;
  } catch {
    return null;
  }
}
