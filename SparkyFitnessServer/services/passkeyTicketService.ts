import crypto from 'crypto';
import { getSystemClient } from '../db/poolManager.js';
import { log } from '../config/logging.js';

// How long a minted registration ticket stays valid before it must be re-minted.
const TICKET_TTL_SECONDS = 60;

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/**
 * Mints a single-use, short-lived ticket that lets the in-browser passkey
 * registration page obtain the given session WITHOUT the raw session token ever
 * appearing in a URL. Returns the opaque code (shown to the caller once); only
 * its SHA-256 hash is persisted.
 */
export const mintRegistrationTicket = async (
  userId: string,
  sessionToken: string
): Promise<string> => {
  const code = crypto.randomBytes(32).toString('base64url');
  const ticketHash = sha256(code);

  const client = await getSystemClient();
  try {
    await client.query(
      `INSERT INTO passkey_registration_tickets (ticket_hash, user_id, session_token, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
      [ticketHash, userId, sessionToken, String(TICKET_TTL_SECONDS)]
    );
  } finally {
    client.release();
  }

  log('info', `[PasskeyTicket] Minted registration ticket for user ${userId}.`);
  return code;
};

/**
 * Atomically redeems a ticket. Returns the associated session token exactly
 * once; any subsequent (or expired) redemption returns null. The single
 * UPDATE ... WHERE used_at IS NULL RETURNING guarantees single-use even under
 * concurrent requests.
 */
export const redeemRegistrationTicket = async (
  code: string
): Promise<{ sessionToken: string } | null> => {
  if (!code) return null;
  const ticketHash = sha256(code);

  const client = await getSystemClient();
  try {
    const result = await client.query(
      `UPDATE passkey_registration_tickets
          SET used_at = now()
        WHERE ticket_hash = $1
          AND used_at IS NULL
          AND expires_at > now()
      RETURNING session_token`,
      [ticketHash]
    );
    if (result.rowCount === 0) {
      log(
        'warn',
        '[PasskeyTicket] Redemption failed (invalid, used, or expired ticket).'
      );
      return null;
    }
    return { sessionToken: result.rows[0].session_token };
  } finally {
    client.release();
  }
};

/** Removes used/expired ticket rows. Intended for the session-cleanup cron. */
export const deleteExpiredTickets = async (): Promise<number> => {
  const client = await getSystemClient();
  try {
    const result = await client.query(
      `DELETE FROM passkey_registration_tickets
        WHERE expires_at < now() OR used_at IS NOT NULL`
    );
    return result.rowCount ?? 0;
  } finally {
    client.release();
  }
};
