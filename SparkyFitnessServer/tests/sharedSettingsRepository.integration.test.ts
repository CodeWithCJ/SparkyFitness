import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { endPool, getSystemClient } from '../db/poolManager.js';
import {
  checkIn,
  type CheckInSnapshot,
  getSharedSettings,
  joinMembers,
  withdrawMember,
} from '../models/sharedSettingsRepository.js';
import { decideAgreement } from '../services/sharedSettingsService.js';

/** Runs only against a reachable test database with the coordination tables applied. */
async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT id FROM system.instance_members LIMIT 0');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();
const EXPIRY_MS = 30_000;
const identity = { enable_email_password_login: null, is_oidc_active: true };
/** Decides agreement for the identity group only. */
const decide = (snapshot: CheckInSnapshot) =>
  decideAgreement({ ...snapshot, groups: ['identity'] });

/** Runs one statement on the owner connection. */
async function query(sql: string, params: unknown[] = []) {
  const client = await getSystemClient();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

describe.skipIf(!RUN)('sharedSettingsRepository (native PostgreSQL)', () => {
  beforeEach(async () => {
    await query(
      'TRUNCATE system.instance_members, system.shared_settings, system.instance_membership'
    );
  });

  afterAll(async () => {
    await endPool();
  });

  it('lets a lone first instance save its settings', async () => {
    const id = await joinMembers('1.7.2', { identity }, EXPIRY_MS);

    const result = await checkIn(id, { identity }, '1.7.2', EXPIRY_MS, decide);

    expect(result?.groups).toEqual([
      { group: 'identity', status: 'save', payload: identity },
    ]);
    expect(await getSharedSettings()).toEqual({
      identity: { payload: identity, releaseVersion: '1.7.2' },
    });
    const count = await query(
      'SELECT expected_count, pending_count FROM system.instance_membership'
    );
    expect(count.rows).toEqual([{ expected_count: 1, pending_count: null }]);
  });

  it('refuses a check-in from an expired membership', async () => {
    const id = await joinMembers('1.7.2', { identity }, 1);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await checkIn(id, { identity }, '1.7.2', EXPIRY_MS, decide);

    expect(result).toBeNull();
    expect(await getSharedSettings()).toEqual({});
  });

  it('removes expired members during another check-in', async () => {
    await joinMembers('1.7.2', { identity: { changed: true } }, 1);
    const id = await joinMembers('1.7.2', { identity }, EXPIRY_MS);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const result = await checkIn(id, { identity }, '1.7.2', EXPIRY_MS, decide);

    expect(result?.groups[0].status).toBe('save');
    const members = await query('SELECT id FROM system.instance_members');
    expect(members.rows).toEqual([{ id }]);
  });

  it('withdraws a member on shutdown', async () => {
    const id = await joinMembers('1.7.2', { identity }, EXPIRY_MS);

    await withdrawMember(id);

    const members = await query('SELECT id FROM system.instance_members');
    expect(members.rows).toEqual([]);
  });

  it('makes concurrent check-ins wait for the same lock', async () => {
    const id = await joinMembers('1.7.2', { identity }, EXPIRY_MS);
    const holder = await getSystemClient();
    let finished = false;
    try {
      await holder.query('BEGIN');
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtext('shared_settings_check_in'))"
      );
      const pending = checkIn(
        id,
        { identity },
        '1.7.2',
        EXPIRY_MS,
        decide
      ).then((result) => {
        finished = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(finished).toBe(false);

      await holder.query('COMMIT');
      expect((await pending)?.groups[0].status).toBe('save');
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  });

  it('makes a joining instance wait for a check-in in progress', async () => {
    const holder = await getSystemClient();
    let joined = false;
    try {
      await holder.query('BEGIN');
      await holder.query(
        "SELECT pg_advisory_xact_lock(hashtext('shared_settings_check_in'))"
      );
      const pending = joinMembers('1.7.2', { identity }, EXPIRY_MS).then(
        (id) => {
          joined = true;
          return id;
        }
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(joined).toBe(false);

      await holder.query('COMMIT');
      expect(await pending).toEqual(expect.any(String));
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  });

  it('agrees once when two instances check in at the same moment', async () => {
    const first = await joinMembers('1.7.2', { identity }, EXPIRY_MS);
    const second = await joinMembers('1.7.2', { identity }, EXPIRY_MS);

    const results = await Promise.all([
      checkIn(first, { identity }, '1.7.2', EXPIRY_MS, decide),
      checkIn(second, { identity }, '1.7.2', EXPIRY_MS, decide),
    ]);

    expect(results.map((result) => result?.groups[0].status).sort()).toEqual([
      'save',
      'unchanged',
    ]);
    const count = await query(
      'SELECT expected_count FROM system.instance_membership'
    );
    expect(count.rows).toEqual([{ expected_count: 2 }]);
  });

  it('writes nothing when the decision fails', async () => {
    const id = await joinMembers('1.7.2', { identity }, EXPIRY_MS);

    await expect(
      checkIn(id, { identity }, '1.7.2', EXPIRY_MS, () => {
        throw new Error('decision failed');
      })
    ).rejects.toThrow('decision failed');

    expect(await getSharedSettings()).toEqual({});
    const count = await query(
      'SELECT count(*)::int AS n FROM system.instance_membership'
    );
    expect(count.rows).toEqual([{ n: 0 }]);
  });
});
