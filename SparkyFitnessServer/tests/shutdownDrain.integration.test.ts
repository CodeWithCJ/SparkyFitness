/**
 * SIGTERM during a claimed provider sync, in a real child process against a
 * migrated database: shutdown either waits for the sync or, at the timeout,
 * releases its claim, so the account is not locked for the claim expiry.
 *
 * Skipped when no database is reachable, like the other integration tests.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const child = path.join(here, 'fixtures', 'shutdownDrainChild.ts');

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

/** Starts the child, waits until it holds the claim, sends SIGTERM, and resolves with its exit. */
async function terminateDuringSync(
  args: string[],
  timeoutSeconds: number,
  onClaimed: () => Promise<void>
): Promise<{ code: number | null; elapsedMs: number; output: string }> {
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx', child, ...args, String(timeoutSeconds * 1000)],
    {
      cwd: serverRoot,
      env: { ...process.env, SPARKY_FITNESS_LOG_LEVEL: 'INFO' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let output = '';
  const claimed = new Promise<void>((resolve, reject) => {
    proc.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('CLAIMED')) resolve();
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.once('exit', () =>
      reject(new Error(`child exited early:\n${output}`))
    );
  });
  const exited = new Promise<number | null>((resolve) =>
    proc.once('exit', (code) => resolve(code))
  );
  await claimed;
  await onClaimed();
  const signalledAt = Date.now();
  proc.kill('SIGTERM');
  const code = await exited;
  return { code, elapsedMs: Date.now() - signalledAt, output };
}

describe('shutdown drain with a claimed provider sync', () => {
  let dbAvailable = false;
  let db: pg.Client;
  const userId = randomUUID();
  let providerId: string;

  const row = async () =>
    (
      await db.query(
        'SELECT sync_started_at, last_sync_at FROM external_data_providers WHERE id = $1',
        [providerId]
      )
    ).rows[0] as { sync_started_at: Date | null; last_sync_at: Date | null };

  beforeAll(async () => {
    dbAvailable = await isDbReachable();
    if (!dbAvailable) return;
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `shutdown-drain-${userId}@example.com`]
    );
    providerId = (
      await db.query(
        `INSERT INTO external_data_providers (user_id, provider_name, provider_type)
         VALUES ($1, 'Fitbit', 'fitbit') RETURNING id`,
        [userId]
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
  });

  it('releases the claim of a sync that does not finish before the timeout', async () => {
    if (!dbAvailable) return;

    const result = await terminateDuringSync(
      [userId, providerId, 'wedged'],
      3,
      async () => {
        expect((await row()).sync_started_at).not.toBeNull();
      }
    );

    expect(result.code, result.output).toBe(1);
    expect(result.elapsedMs).toBeLessThan(3000);
    expect((await row()).sync_started_at).toBeNull();
    expect(result.output).toContain('1 provider sync(s)');
  }, 30_000);

  it('waits for a sync that finishes within the timeout', async () => {
    if (!dbAvailable) return;
    await db.query(
      'UPDATE external_data_providers SET last_sync_at = NULL WHERE id = $1',
      [providerId]
    );

    const result = await terminateDuringSync(
      [userId, providerId, '1500'],
      10,
      async () => {}
    );

    expect(result.code, result.output).toBe(0);
    expect(result.elapsedMs).toBeLessThan(6000);
    const after = await row();
    expect(after.last_sync_at).not.toBeNull();
    expect(after.sync_started_at).toBeNull();
  }, 30_000);
});
