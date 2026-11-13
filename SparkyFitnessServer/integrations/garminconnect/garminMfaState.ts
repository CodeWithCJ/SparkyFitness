import { decrypt, encrypt, ENCRYPTION_KEY } from '../../security/encryption.js';
import { ValidationError } from '../../utils/errors.js';

/** A Garmin sign-in waiting for its MFA code, as the Garmin service returns it. */
export type GarminMfaState = Record<string, unknown>;

interface SealedContent {
  userId: string;
  expiresAt: number;
  state: GarminMfaState;
}

const MFA_STATE_TTL_MS = 5 * 60 * 1000;

const EXPIRED_MESSAGE =
  'This Garmin sign-in has expired. Please log in to Garmin again.';

/**
 * Seal a pending Garmin sign-in for the browser to hold until the user enters
 * the MFA code. It carries Garmin session cookies, so it is encrypted; and
 * because nothing is kept server-side, any server instance can finish it.
 */
export async function sealGarminMfaState(
  userId: string,
  state: GarminMfaState,
  now = Date.now()
): Promise<string> {
  const content: SealedContent = {
    userId,
    expiresAt: now + MFA_STATE_TTL_MS,
    state,
  };
  const { encryptedText, iv, tag } = await encrypt(
    JSON.stringify(content),
    ENCRYPTION_KEY
  );
  return `${iv}.${tag}.${encryptedText}`;
}

/** Open a sealed sign-in; it must be unexpired and belong to this user. */
export async function openGarminMfaState(
  userId: string,
  sealed: string,
  now = Date.now()
): Promise<GarminMfaState> {
  let content: SealedContent | null;
  try {
    const [iv, tag, encryptedText] = sealed.split('.');
    const json = await decrypt(encryptedText, iv, tag, ENCRYPTION_KEY);
    content = json ? (JSON.parse(json) as SealedContent) : null;
  } catch {
    content = null;
  }
  if (!content || content.userId !== userId || !(content.expiresAt > now)) {
    throw new ValidationError(EXPIRED_MESSAGE);
  }
  return content.state;
}
