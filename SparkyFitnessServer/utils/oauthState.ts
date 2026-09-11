import crypto from 'crypto';
import { log } from '../config/logging.js';

/**
 * Server-issued, single-use OAuth `state` nonces for external provider linking.
 *
 * The rule this module exists to enforce: a provider callback must never be
 * allowed to name the user whose row it writes. The owner is recovered from
 * server-side flow state (the nonce we issued) and from nothing else.
 *
 * The value is `"<64 hex chars>.<epochMs>"`. The timestamp is carried inside
 * the existing `external_data_providers.oauth_state` TEXT column so expiry
 * needs no new column, and therefore no migration, no RLS change and no schema
 * backup cycle. Every character is URL-safe unencoded, so it survives a
 * round-trip through a provider redirect and `URLSearchParams` untouched.
 */

/** How long an issued state remains claimable. Deliberately not configurable. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const NONCE_BYTES = 32;
const OAUTH_STATE_PATTERN = /^([0-9a-f]{64})\.([0-9]{1,15})$/;

/** Providers whose linking flow uses a server-issued nonce. */
export type OAuthStateProviderType = 'withings' | 'polar';

/**
 * The slice of a `pg` client this module needs. Structural on purpose: it keeps
 * the helper trivially mockable with the repo's existing `{ query: vi.fn() }`
 * test stub, without importing `PoolClient` generics into every call site.
 */
export interface OAuthStateQueryClient {
  query(
    text: string,
    values?: readonly unknown[]
  ): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/** The provider row that held the nonce, plus its encrypted client credentials. */
export interface OAuthStateCredentialRow {
  id: string;
  user_id: string;
  encrypted_app_id: string | null;
  app_id_iv: string | null;
  app_id_tag: string | null;
  encrypted_app_key: string | null;
  app_key_iv: string | null;
  app_key_tag: string | null;
}

/** The credential columns returned when a fresh state is issued. */
export interface IssuedOAuthState {
  state: string;
  id: string;
  encrypted_app_id: string | null;
  app_id_iv: string | null;
  app_id_tag: string | null;
}

export type OAuthStateFailure =
  /** Absent, empty, or not a string. */
  | 'missing'
  /** Present but not `<64 hex>.<digits>` — includes every legacy format. */
  | 'malformed'
  /** No row held this state: forged, already consumed, or cross-user. */
  | 'unknown'
  /** Claimed, but issued longer ago than the TTL. */
  | 'expired'
  /** More than one row matched. Should be unreachable; see claimOAuthState. */
  | 'ambiguous';

export class OAuthStateError extends Error {
  readonly reason: OAuthStateFailure;

  constructor(reason: OAuthStateFailure, message: string) {
    super(message);
    this.name = 'OAuthStateError';
    this.reason = reason;
  }
}

export type ParsedOAuthState =
  | { ok: true; nonce: string; issuedAtMs: number }
  | { ok: false; reason: 'missing' | 'malformed' | 'expired' };

/** Builds a fresh state value. `now` is injectable so tests need no fake timers. */
export function issueOAuthState(now: number = Date.now()): string {
  return `${crypto.randomBytes(NONCE_BYTES).toString('hex')}.${now}`;
}

type ParsedGrammar =
  | { ok: true; nonce: string; issuedAtMs: number }
  | { ok: false; reason: 'missing' | 'malformed' };

/**
 * Grammar only, no TTL. Separate from parseOAuthState because claimOAuthState
 * must be able to reject a junk value before touching the database while still
 * letting a merely-expired one reach the claim, so the nonce gets burned.
 */
function parseOAuthStateGrammar(value: unknown): ParsedGrammar {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, reason: 'missing' };
  }
  const match = OAUTH_STATE_PATTERN.exec(value);
  if (!match) {
    return { ok: false, reason: 'malformed' };
  }
  const issuedAtMs = Number(match[2]);
  if (!Number.isSafeInteger(issuedAtMs)) {
    return { ok: false, reason: 'malformed' };
  }
  return { ok: true, nonce: match[1], issuedAtMs };
}

/**
 * Validates grammar and age. Pure — no I/O.
 */
export function parseOAuthState(
  value: unknown,
  now: number = Date.now()
): ParsedOAuthState {
  const parsed = parseOAuthStateGrammar(value);
  if (!parsed.ok) {
    return parsed;
  }
  if (now - parsed.issuedAtMs > OAUTH_STATE_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }
  return parsed;
}

/**
 * Stamps a fresh state onto exactly one provider row and returns it together
 * with that row's encrypted client credentials.
 *
 * Returning the credentials is a correctness requirement, not an optimisation.
 * `external_data_providers` is unique on `(user_id, provider_name)`, NOT on
 * `provider_type`, so a user can hold several rows of the same provider type. A
 * separate unordered SELECT could pick a different row than the one stamped
 * here, which would build an authorization URL whose `client_id` does not match
 * the row the callback later claims. One statement, one row, no divergence.
 */
export async function persistOAuthState(
  client: OAuthStateQueryClient,
  params: {
    userId: string;
    providerType: OAuthStateProviderType;
    providerId?: string | null;
    now?: number;
  }
): Promise<IssuedOAuthState> {
  const state = issueOAuthState(params.now);
  const result = await client.query(
    `UPDATE external_data_providers
        SET oauth_state = $1, updated_at = NOW()
      WHERE id = (
        SELECT id FROM external_data_providers
         WHERE user_id = $2
           AND provider_type = $3
           AND ($4::uuid IS NULL OR id = $4::uuid)
         ORDER BY created_at ASC, id ASC
         LIMIT 1
      )
      RETURNING id, encrypted_app_id, app_id_iv, app_id_tag`,
    [state, params.userId, params.providerType, params.providerId ?? null]
  );

  const row = result.rows[0] as Omit<IssuedOAuthState, 'state'> | undefined;
  if (!row) {
    throw new Error(
      `${params.providerType} client credentials not found for user.`
    );
  }
  if (!row.encrypted_app_id || !row.app_id_iv || !row.app_id_tag) {
    throw new Error(
      `${params.providerType} client credentials are not configured for user.`
    );
  }
  return { ...row, state };
}

/**
 * Atomically consumes a state and returns the row that held it.
 *
 * There is deliberately no `crypto.timingSafeEqual` here: the comparison IS the
 * `WHERE oauth_state = $1` predicate inside the UPDATE, so no stored state is
 * ever read into JS to be compared. Adding a constant-time compare would mean
 * reintroducing the read-then-compare shape that creates the TOCTOU replay hole
 * this function exists to close, and a Postgres equality test against a 256-bit
 * random value is not a practical timing oracle.
 *
 * The single UPDATE takes a row-level write lock, so concurrent replays
 * serialise and exactly one caller sees `rowCount === 1`.
 */
export async function claimOAuthState(
  client: OAuthStateQueryClient,
  params: {
    state: unknown;
    providerType: OAuthStateProviderType;
    now?: number;
  }
): Promise<OAuthStateCredentialRow> {
  // Grammar only, so a sprayed or malformed value never reaches the database.
  // Expiry is deliberately NOT checked here: an expired-but-real nonce should
  // still be consumed below, so it cannot be retried if the clock moves back.
  const parsed = parseOAuthStateGrammar(params.state);
  if (!parsed.ok) {
    throw new OAuthStateError(
      parsed.reason,
      `Rejected ${params.providerType} OAuth state: ${parsed.reason}.`
    );
  }

  const result = await client.query(
    `UPDATE external_data_providers
        SET oauth_state = NULL, updated_at = NOW()
      WHERE oauth_state = $1
        AND provider_type = $2
      RETURNING id, user_id,
                encrypted_app_id, app_id_iv, app_id_tag,
                encrypted_app_key, app_key_iv, app_key_tag`,
    [params.state, params.providerType]
  );

  // Covers forged state, cross-user substitution, and replay in one branch:
  // a successful first claim already NULLed the value.
  if (!result.rowCount) {
    throw new OAuthStateError(
      'unknown',
      `No ${params.providerType} provider row held the supplied OAuth state.`
    );
  }

  // Unreachable given the scoped issue query above, but `provider_type` carries
  // no uniqueness constraint, so this is the seatbelt rather than an assumption.
  if (result.rowCount > 1) {
    log(
      'warn',
      `[OAuthState] Ambiguous ${params.providerType} state claim matched ${result.rowCount} rows; aborting.`
    );
    throw new OAuthStateError(
      'ambiguous',
      `Ambiguous ${params.providerType} OAuth state claim.`
    );
  }

  // Checked after the claim on purpose: an expired nonce must be burned, not
  // left live for a later retry.
  const now = params.now ?? Date.now();
  if (now - parsed.issuedAtMs > OAUTH_STATE_TTL_MS) {
    throw new OAuthStateError(
      'expired',
      `Expired ${params.providerType} OAuth state.`
    );
  }

  return result.rows[0] as OAuthStateCredentialRow;
}
