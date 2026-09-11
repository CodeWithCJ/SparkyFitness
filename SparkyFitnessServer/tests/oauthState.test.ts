import { vi, beforeEach, describe, expect, it } from 'vitest';
import {
  OAUTH_STATE_TTL_MS,
  OAuthStateError,
  claimOAuthState,
  issueOAuthState,
  parseOAuthState,
  persistOAuthState,
  type OAuthStateQueryClient,
} from '../utils/oauthState.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const NOW = 1_760_000_000_000;
const CLAIMED_ROW = {
  id: 'provider-row-1',
  user_id: 'owner-1',
  encrypted_app_id: 'a',
  app_id_iv: 'b',
  app_id_tag: 'c',
  encrypted_app_key: 'd',
  app_key_iv: 'e',
  app_key_tag: 'f',
};

function mockClient(
  result: { rows: unknown[]; rowCount: number | null } = {
    rows: [CLAIMED_ROW],
    rowCount: 1,
  }
) {
  return {
    query: vi.fn().mockResolvedValue(result),
  } satisfies OAuthStateQueryClient & { query: ReturnType<typeof vi.fn> };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('issueOAuthState', () => {
  it('produces a 64-hex nonce joined to the issue timestamp', () => {
    expect(issueOAuthState(NOW)).toMatch(/^[0-9a-f]{64}\.\d+$/);
    expect(issueOAuthState(NOW).endsWith(`.${NOW}`)).toBe(true);
  });

  it('never repeats a nonce', () => {
    const seen = new Set(
      Array.from({ length: 1000 }, () => issueOAuthState(NOW))
    );
    expect(seen.size).toBe(1000);
  });
});

describe('parseOAuthState', () => {
  it('accepts a freshly issued value', () => {
    const parsed = parseOAuthState(issueOAuthState(NOW), NOW);
    expect(parsed).toMatchObject({ ok: true, issuedAtMs: NOW });
  });

  it.each([undefined, null, '', 42, {}, []])(
    'treats %p as missing',
    (value) => {
      expect(parseOAuthState(value, NOW)).toEqual({
        ok: false,
        reason: 'missing',
      });
    }
  );

  it.each([
    ['Polar legacy bare hex', 'a'.repeat(32)],
    ['a bare SparkyFitness UUID', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    ['a nonce with no timestamp', 'a'.repeat(64)],
    ['a non-numeric timestamp', `${'a'.repeat(64)}.notanumber`],
    ['a short nonce', `${'a'.repeat(63)}.${NOW}`],
    ['an uppercase nonce', `${'A'.repeat(64)}.${NOW}`],
    ['an extra segment', `${'a'.repeat(64)}.${NOW}.1`],
  ])('rejects %s as malformed', (_label, value) => {
    expect(parseOAuthState(value, NOW)).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });

  it('honours the TTL boundary in both directions', () => {
    const state = issueOAuthState(NOW);
    expect(parseOAuthState(state, NOW + OAUTH_STATE_TTL_MS).ok).toBe(true);
    expect(parseOAuthState(state, NOW + OAUTH_STATE_TTL_MS + 1)).toEqual({
      ok: false,
      reason: 'expired',
    });
  });
});

describe('persistOAuthState', () => {
  it('scopes the issue to exactly one row and returns its credentials', async () => {
    const client = mockClient({
      rows: [
        {
          id: 'provider-row-1',
          encrypted_app_id: 'a',
          app_id_iv: 'b',
          app_id_tag: 'c',
        },
      ],
      rowCount: 1,
    });

    const issued = await persistOAuthState(client, {
      userId: 'owner-1',
      providerType: 'withings',
      now: NOW,
    });

    expect(issued.state).toMatch(/^[0-9a-f]{64}\.\d+$/);
    expect(issued.id).toBe('provider-row-1');

    const [sql, values] = client.query.mock.calls[0];
    // LIMIT 1 is what stops a duplicate provider_type row from being stamped too.
    expect(sql).toContain('LIMIT 1');
    expect(sql).toContain('RETURNING id, encrypted_app_id');
    expect(values).toEqual([issued.state, 'owner-1', 'withings', null]);
  });

  it('throws when the user has no provider row', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    await expect(
      persistOAuthState(client, {
        userId: 'owner-1',
        providerType: 'withings',
        now: NOW,
      })
    ).rejects.toThrow(/client credentials not found/);
  });

  it('throws when the row exists but has no configured credentials', async () => {
    const client = mockClient({
      rows: [
        {
          id: 'provider-row-1',
          encrypted_app_id: null,
          app_id_iv: null,
          app_id_tag: null,
        },
      ],
      rowCount: 1,
    });
    await expect(
      persistOAuthState(client, {
        userId: 'owner-1',
        providerType: 'withings',
        now: NOW,
      })
    ).rejects.toThrow(/not configured/);
  });
});

describe('claimOAuthState', () => {
  it('consumes a valid state and returns the owning row', async () => {
    const client = mockClient();
    const row = await claimOAuthState(client, {
      state: issueOAuthState(NOW),
      providerType: 'withings',
      actorUserId: 'owner-1',
      now: NOW,
    });

    expect(row).toEqual(CLAIMED_ROW);
    const [sql, values] = client.query.mock.calls[0];
    // The claim must stay a single self-clearing UPDATE. A refactor back to a
    // SELECT would reopen the replay window this function exists to close.
    expect(sql).toContain('SET oauth_state = NULL');
    expect(sql).toContain('WHERE oauth_state = $1');
    expect(sql).toContain('RETURNING');
    // The actor is part of the predicate, so a state belonging to another user
    // matches no row rather than being caught after the fact.
    expect(sql).toContain('user_id = $3');
    expect(values).toEqual([expect.any(String), 'withings', 'owner-1']);
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  ])(
    'rejects a %s state without touching the database',
    async (reason, state) => {
      const client = mockClient();
      await expect(
        claimOAuthState(client, {
          state,
          providerType: 'withings',
          actorUserId: 'owner-1',
          now: NOW,
        })
      ).rejects.toMatchObject({ reason });
      expect(client.query).not.toHaveBeenCalled();
    }
  );

  it('reports an unclaimed state as unknown (forged, replayed, or cross-user)', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    await expect(
      claimOAuthState(client, {
        state: issueOAuthState(NOW),
        providerType: 'withings',
        actorUserId: 'owner-1',
        now: NOW,
      })
    ).rejects.toMatchObject({ reason: 'unknown' });
  });

  it('refuses to proceed when more than one row matched', async () => {
    const client = mockClient({
      rows: [CLAIMED_ROW, { ...CLAIMED_ROW, id: 'provider-row-2' }],
      rowCount: 2,
    });
    await expect(
      claimOAuthState(client, {
        state: issueOAuthState(NOW),
        providerType: 'withings',
        actorUserId: 'owner-1',
        now: NOW,
      })
    ).rejects.toMatchObject({ reason: 'ambiguous' });
    expect(client.query).toHaveBeenCalledTimes(1);
  });

  it('burns an expired state rather than leaving it claimable', async () => {
    const client = mockClient();
    const state = issueOAuthState(NOW);

    await expect(
      claimOAuthState(client, {
        state,
        providerType: 'withings',
        actorUserId: 'owner-1',
        now: NOW + OAUTH_STATE_TTL_MS + 1,
      })
    ).rejects.toMatchObject({ reason: 'expired' });

    // The clearing UPDATE still ran, so the nonce cannot be retried later.
    expect(client.query).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toContain('SET oauth_state = NULL');
  });

  it('does not claim a state that belongs to a different user', async () => {
    // The predicate matches nothing, so the row is never returned and the real
    // owner's nonce is left intact for their own flow to complete.
    const client = mockClient({ rows: [], rowCount: 0 });

    await expect(
      claimOAuthState(client, {
        state: issueOAuthState(NOW),
        providerType: 'withings',
        actorUserId: 'someone-else',
        now: NOW,
      })
    ).rejects.toMatchObject({ reason: 'unknown' });

    expect(client.query.mock.calls[0][1][2]).toBe('someone-else');
  });

  it('exposes OAuthStateError as a typed error', async () => {
    const client = mockClient({ rows: [], rowCount: 0 });
    const error = await claimOAuthState(client, {
      state: issueOAuthState(NOW),
      providerType: 'polar',
      actorUserId: 'owner-1',
      now: NOW,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(OAuthStateError);
  });
});
