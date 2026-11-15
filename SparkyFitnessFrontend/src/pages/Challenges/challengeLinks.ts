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
