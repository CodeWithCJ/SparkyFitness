import { randomUUID } from 'node:crypto';
import pg from 'pg';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'.
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { endPool, getSystemClient } from '../db/poolManager.js';
import oidcProviderRepository from '../models/oidcProviderRepository.js';
import oidcSettingsRoutes from '../routes/oidcSettingsRoutes.js';
import { upsertEnvOidcProvider } from '../utils/oidcEnvConfig.js';

const app = express();
app.use(express.json());
app.use('/admin/oidc-settings', oidcSettingsRoutes);

vi.mock('../auth.js', () => ({
  syncTrustedProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../middleware/authMiddleware.js', () => ({
  isAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../middleware/oidcLogoUpload.js', () => ({
  default: {
    single: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  },
}));

/** Runs only against a reachable test database with the provider schema applied. */
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
    await probe.query('SELECT id FROM public.sso_provider LIMIT 0');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();
const fixtureIds: string[] = [];
const issuer = 'https://oidc.example.test';
/** Discovery response for the test issuer; env providers are saved only after discovery succeeds. */
const discovery = {
  ok: true,
  json: async () => ({ issuer: `${issuer}/` }),
};

/** Seeds a provider and records its row ID for scoped cleanup. */
async function seedProvider(
  providerId: string,
  id = randomUUID()
): Promise<string> {
  fixtureIds.push(id);
  const client = await getSystemClient();
  try {
    await client.query(
      `INSERT INTO sso_provider (id, provider_id, issuer, client_id, client_secret)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, providerId, issuer, 'original-client', 'original-secret']
    );
    return id;
  } finally {
    client.release();
  }
}

/** Sets the same environment configuration for each simulated startup. */
function configureEnvProvider(providerId: string) {
  vi.stubEnv('SPARKY_FITNESS_OIDC_AUTH_ENABLED', 'true');
  vi.stubEnv('SPARKY_FITNESS_OIDC_ISSUER_URL', issuer);
  vi.stubEnv('SPARKY_FITNESS_OIDC_CLIENT_ID', 'env-client');
  vi.stubEnv('SPARKY_FITNESS_OIDC_CLIENT_SECRET', 'env-secret');
  vi.stubEnv('SPARKY_FITNESS_OIDC_PROVIDER_SLUG', providerId);
  vi.stubEnv('SPARKY_FITNESS_OIDC_DOMAIN', 'example.test');
}

describe.runIf(RUN)('OIDC provider identity in PostgreSQL', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(discovery));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    const client = await getSystemClient();
    try {
      await client.query(
        'DELETE FROM sso_provider WHERE id = ANY($1::uuid[])',
        [fixtureIds]
      );
      fixtureIds.length = 0;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await endPool();
  });

  it('omits the secret from provider details and preserves it on round-trip updates', async () => {
    const id = await seedProvider(`test-${randomUUID()}`);
    const response = await request(app).get(`/admin/oidc-settings/${id}`);
    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty('client_secret');
    const updated = await request(app)
      .put(`/admin/oidc-settings/${id}`)
      .send(response.body);
    expect(updated.status).toBe(200);
    const stored = await oidcProviderRepository.getOidcProviderById(id);
    expect(stored?.client_secret).toBe('original-secret');
  });

  it.each(['replacement-secret', '*****'])(
    'stores the supplied admin secret %s literally',
    async (secret) => {
      const id = await seedProvider(`test-${randomUUID()}`);
      const response = await request(app)
        .put(`/admin/oidc-settings/${id}`)
        .send({
          issuer_url: issuer,
          client_id: 'updated-client',
          domain: 'example.test',
          client_secret: secret,
        });
      expect(response.status).toBe(200);
      const client = await getSystemClient();
      try {
        const result = await client.query(
          `SELECT client_secret, oidc_config->>'clientSecret' AS config_secret
        FROM sso_provider WHERE id = $1`,
          [id]
        );
        expect(result.rows).toEqual([
          { client_secret: secret, config_secret: secret },
        ]);
      } finally {
        client.release();
      }
    }
  );

  it('configures the same environment provider concurrently', async () => {
    const providerId = `test-${randomUUID()}`;
    const client = await getSystemClient();
    try {
      const existing = await client.query(
        `SELECT id FROM sso_provider
         WHERE additional_config::jsonb->>'is_env_configured' = 'true'`
      );
      expect(existing.rows).toEqual([]);

      configureEnvProvider(providerId);

      // Hold discovery until both callers have reached it, without mocking database work.
      let releaseDiscovery!: () => void;
      const ready = new Promise<void>((resolve) => {
        releaseDiscovery = resolve;
      });
      let arrivals = 0;
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          if (++arrivals === 2) releaseDiscovery();
          await ready;
          return discovery;
        })
      );

      const outcomes = await Promise.allSettled([
        upsertEnvOidcProvider(),
        upsertEnvOidcProvider(),
      ]);
      const result = await client.query(
        'SELECT id, provider_id, client_id, domain FROM sso_provider WHERE provider_id = $1',
        [providerId]
      );
      fixtureIds.push(...result.rows.map((row: { id: string }) => row.id));

      expect(result.rows).toEqual([
        {
          id: expect.any(String),
          provider_id: providerId,
          client_id: 'env-client',
          domain: 'example.test',
        },
      ]);
      expect(outcomes).toEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
      ]);
    } finally {
      client.release();
    }
  });

  it.each([false, true])(
    'serializes environment providers with different IDs (existing: %s)',
    async (existing) => {
      const providerIds = [`test-${randomUUID()}`, `test-${randomUUID()}`];
      const trigger = `oidc_commit_${randomUUID().replaceAll('-', '')}`;
      const client = await getSystemClient();
      let saves: Promise<PromiseSettledResult<string[]>[]> | undefined;
      let gateHeld = false;
      try {
        if (existing) {
          for (const providerId of providerIds) await seedProvider(providerId);
          await client.query(
            `UPDATE sso_provider SET additional_config = '{"is_env_configured":true}'
           WHERE provider_id = ANY($1::text[])`,
            [providerIds]
          );
        }
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [trigger]);
        gateHeld = true;
        // Existing rows must overlap before cleanup to expose opposing row locks.
        // New rows must overlap at commit so neither cleanup sees the other insert.
        await client.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_advisory_xact_lock_shared(hashtext('${trigger}')); RETURN NEW; END $$`);
        if (existing) {
          await client.query(`CREATE TRIGGER ${trigger} AFTER INSERT OR UPDATE ON sso_provider
          FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
        } else {
          await client.query(`CREATE CONSTRAINT TRIGGER ${trigger} AFTER INSERT ON sso_provider
          DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
        }

        saves = Promise.allSettled(
          providerIds.map((providerId) =>
            oidcProviderRepository.upsertEnvOidcProvider({
              provider_id: providerId,
              issuer_url: issuer,
              client_id: 'env-client',
              client_secret: 'env-secret',
              domain: 'example.test',
              is_env_configured: true,
            })
          )
        );
        await vi.waitFor(async () => {
          const waiting = await client.query(
            `SELECT count(*)::int AS count FROM pg_locks
           WHERE locktype = 'advisory' AND NOT granted
           AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
          );
          expect(waiting.rows[0].count).toBe(2);
        });
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
          trigger,
        ]);
        gateHeld = false;
        const outcomes = await saves;
        const result = await client.query(
          'SELECT id, provider_id FROM sso_provider WHERE provider_id = ANY($1::text[])',
          [providerIds]
        );
        fixtureIds.push(...result.rows.map((row: { id: string }) => row.id));
        expect(outcomes).toEqual([
          { status: 'fulfilled', value: expect.any(Array) },
          { status: 'fulfilled', value: expect.any(Array) },
        ]);
        expect(result.rows).toHaveLength(1);
        expect(providerIds).toContain(result.rows[0].provider_id);
      } finally {
        if (gateHeld) {
          await client.query('SELECT pg_advisory_unlock(hashtext($1))', [
            trigger,
          ]);
        }
        await saves;
        try {
          await client.query(
            `DROP TRIGGER IF EXISTS ${trigger} ON sso_provider`
          );
          await client.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
          await client.query(
            'DELETE FROM sso_provider WHERE provider_id = ANY($1::text[])',
            [providerIds]
          );
        } finally {
          client.release();
        }
      }
    }
  );

  it.each(['env-secret', '*****'])(
    'updates the exact provider with literal env secret %s while preserving its manual alias',
    async (secret) => {
      const name = `test-${randomUUID()}`;
      const exactId = await seedProvider(name);
      const aliasId = await seedProvider(`oidc-${name}`);
      const staleId = await seedProvider(`stale-${randomUUID()}`);
      const client = await getSystemClient();
      try {
        await client.query(
          'UPDATE sso_provider SET additional_config = $1 WHERE id = $2',
          [JSON.stringify({ is_env_configured: true }), staleId]
        );
        configureEnvProvider(name);
        vi.stubEnv('SPARKY_FITNESS_OIDC_CLIENT_SECRET', secret);

        await upsertEnvOidcProvider();

        const result = await client.query(
          `SELECT id, provider_id, client_id, client_secret, oidc_config->>'clientSecret' AS config_secret
           FROM sso_provider WHERE id = ANY($1::uuid[]) ORDER BY provider_id`,
          [[exactId, aliasId, staleId]]
        );
        expect(result.rows).toEqual([
          {
            id: aliasId,
            provider_id: `oidc-${name}`,
            client_id: 'original-client',
            client_secret: 'original-secret',
            config_secret: null,
          },
          {
            id: exactId,
            provider_id: name,
            client_id: 'env-client',
            client_secret: secret,
            config_secret: secret,
          },
        ]);
      } finally {
        client.release();
      }
    }
  );

  it('rolls back the provider save when stale cleanup fails', async () => {
    const name = `test-${randomUUID()}`;
    const staleId = await seedProvider(`stale-${randomUUID()}`);
    const trigger = `oidc_cleanup_${randomUUID().replaceAll('-', '')}`;
    const client = await getSystemClient();
    try {
      await client.query(
        'UPDATE sso_provider SET additional_config = $1 WHERE id = $2',
        [JSON.stringify({ is_env_configured: true }), staleId]
      );
      await client.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test stale cleanup failure'; END $$`);
      await client.query(`CREATE TRIGGER ${trigger} BEFORE DELETE ON sso_provider
        FOR EACH ROW WHEN (OLD.id = '${staleId}'::uuid) EXECUTE FUNCTION ${trigger}()`);
      configureEnvProvider(name);

      await expect(upsertEnvOidcProvider()).rejects.toThrow(
        'test stale cleanup failure'
      );

      const result = await client.query(
        'SELECT id, provider_id FROM sso_provider WHERE id = $1 OR provider_id = $2',
        [staleId, name]
      );
      fixtureIds.push(...result.rows.map((row: { id: string }) => row.id));
      expect(result.rows).toEqual([
        { id: staleId, provider_id: expect.stringMatching(/^stale-/) },
      ]);
    } finally {
      try {
        await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON sso_provider`);
        await client.query(`DROP FUNCTION IF EXISTS ${trigger}()`);
      } finally {
        client.release();
      }
    }
  });

  it.each([false, true])(
    'prefers the exact name (prefixed: %s)',
    async (prefixed) => {
      const name = `test-${randomUUID()}`;
      const exact = prefixed ? `oidc-${name}` : name;
      const alias = prefixed ? name : `oidc-${name}`;
      await seedProvider(alias);
      const id = await seedProvider(exact);

      expect(
        await oidcProviderRepository.getOidcProviderById(exact)
      ).toMatchObject({
        id,
        provider_id: exact,
      });
    }
  );

  it('prefers the row ID over a provider named after that ID', async () => {
    const id = randomUUID();
    await seedProvider(id);
    const name = `test-${randomUUID()}`;
    await seedProvider(name, id);

    expect(await oidcProviderRepository.getOidcProviderById(id)).toMatchObject({
      id,
      provider_id: name,
    });
  });

  it.each([
    ['toggle', 'config-client'],
    ['null', null],
    ['replacement', 'replacement-client'],
  ])(
    'preserves or replaces a config-only client ID on %s updates',
    async (_case, clientId) => {
      const id = await seedProvider(`test-${randomUUID()}`);
      const client = await getSystemClient();
      try {
        await client.query(
          'UPDATE sso_provider SET client_id = NULL, oidc_config = $1::jsonb WHERE id = $2',
          [JSON.stringify({ clientId: 'config-client' }), id]
        );
        const app = express();
        app.use(express.json());
        app.use('/admin/oidc-settings', oidcSettingsRoutes);
        const listed = await request(app)
          .get('/admin/oidc-settings')
          .expect(200);
        const provider = listed.body.find(
          (entry: { id: string }) => entry.id === id
        );
        expect(provider.client_id).toBe('config-client');
        const detail = await request(app)
          .get(`/admin/oidc-settings/${id}`)
          .expect(200);
        expect(detail.body.client_id).toBe('config-client');

        await request(app)
          .put(`/admin/oidc-settings/${id}`)
          .send({ ...provider, client_id: clientId, is_active: false })
          .expect(200);

        const stored = await client.query(
          "SELECT client_id, oidc_config->>'clientId' AS config_client_id, additional_config::jsonb->'is_active' AS is_active FROM sso_provider WHERE id = $1",
          [id]
        );
        expect(stored.rows[0]).toEqual({
          client_id: clientId ?? 'config-client',
          config_client_id: clientId ?? 'config-client',
          is_active: false,
        });
      } finally {
        client.release();
      }
    }
  );

  it('rejects an update without a usable client ID before writing', async () => {
    const id = await seedProvider(`test-${randomUUID()}`);
    const client = await getSystemClient();
    try {
      await client.query(
        'UPDATE sso_provider SET client_id = NULL WHERE id = $1',
        [id]
      );
      const app = express();
      app.use(express.json());
      app.use('/admin/oidc-settings', oidcSettingsRoutes);
      const before = await client.query(
        'SELECT * FROM sso_provider WHERE id = $1',
        [id]
      );
      const response = await request(app)
        .put(`/admin/oidc-settings/${id}`)
        .send({ issuer_url: issuer, client_id: null, is_active: false });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'OIDC client ID is required' });
      const after = await client.query(
        'SELECT * FROM sso_provider WHERE id = $1',
        [id]
      );
      expect(after.rows).toEqual(before.rows);
    } finally {
      client.release();
    }
  });

  it.each([
    ['omitted', undefined, 'original.example.test'],
    ['supplied', 'updated.example.test', 'updated.example.test'],
  ])(
    'handles the %s domain case in an admin update',
    async (_case, domain, expected) => {
      const providerId = `test-${randomUUID()}`;
      const id = await seedProvider(providerId);
      const client = await getSystemClient();
      try {
        await client.query(
          'UPDATE sso_provider SET domain = $1 WHERE id = $2',
          ['original.example.test', id]
        );
        const app = express();
        app.use(express.json());
        app.use('/admin/oidc-settings', oidcSettingsRoutes);

        await request(app)
          .put(`/admin/oidc-settings/${id}`)
          .send({ issuer_url: issuer, client_id: 'updated-client', domain })
          .expect(200);

        const result = await client.query(
          'SELECT domain, client_id FROM sso_provider WHERE id = $1',
          [id]
        );
        expect(result.rows[0]).toEqual({
          domain: expected,
          client_id: 'updated-client',
        });
      } finally {
        client.release();
      }
    }
  );

  it.each(['prefixed alias', 'unprefixed alias', 'row ID'])(
    'updates through %s without changing the provider name',
    async (lookup) => {
      const name = `test-${randomUUID()}`;
      const stored = lookup === 'unprefixed alias' ? `oidc-${name}` : name;
      const id = await seedProvider(stored);
      const key =
        lookup === 'row ID'
          ? id
          : lookup === 'prefixed alias'
            ? `oidc-${name}`
            : name;

      expect(
        await oidcProviderRepository.getOidcProviderById(key)
      ).toMatchObject({
        id,
        provider_id: stored,
      });
      await oidcProviderRepository.updateOidcProvider(key, {
        issuer_url: issuer,
        domain: 'example.test',
        client_id: 'updated-client',
      });

      const client = await getSystemClient();
      try {
        const result = await client.query(
          'SELECT * FROM sso_provider WHERE id = $1',
          [id]
        );
        expect(result.rows[0]).toMatchObject({
          provider_id: stored,
          client_id: 'updated-client',
          client_secret: 'original-secret',
        });
        expect(
          result.rows[0].oidc_config.redirectURI.endsWith(
            `/api/auth/sso/callback/${stored}`
          )
        ).toBe(true);
      } finally {
        client.release();
      }
    }
  );
});
