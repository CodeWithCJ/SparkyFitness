import express from 'express';
import type pg from 'pg';
import { log } from '../config/logging.js';
import { getRawAppPool } from '../db/poolManager.js';
import { isPoolBusy } from '../db/poolBusy.js';
import { isConnectionError, requestConnectRetry } from '../db/connectRetry.js';
import {
  checkAuthSchema,
  connectAuthPoolForProbe,
  isAuthPoolBusy,
} from '../auth.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
import { describeError } from '../utils/errors.js';

const router = express.Router();
router.use(express.json());

const readinessTimeoutMs = 2_000;

type CheckResult = 'ok' | 'busy' | 'retrying' | 'failed' | 'timeout';

interface ReadinessCheck {
  /** Takes a connection without the request connect retry. */
  connect: () => Promise<pg.PoolClient>;
  query: string;
  /** Runs once the query has answered and its connection is back. */
  after?: () => Promise<void> | void;
  poolBusy: () => boolean;
}

// The probes share the pools that serve requests. A replica whose pool is
// full only waits its turn, and failing it then would move its load onto the
// other replicas until they fill up and fail too. So a probe that is still
// waiting for a connection when the time is up counts as ready while the pool
// is busy (full, callers queued, and still finishing work: the database
// answers). Connection errors, a failing query, a wait on a pool that is not
// busy and a query that does not answer in time still fail readiness.
const readinessChecks: Record<string, ReadinessCheck> = {
  database: {
    connect: () => getRawAppPool().connect(),
    query: 'SELECT 1',
    poolBusy: () => isPoolBusy(getRawAppPool()),
  },
  auth: {
    connect: connectAuthPoolForProbe,
    query: 'SELECT 1 FROM "session" LIMIT 0',
    // Better Auth shares one pending schema check between all its callers and
    // caches the verdict, so this holds at most one auth connection however
    // many probes time out on it.
    after: checkAuthSchema,
    poolBusy: () => isAuthPoolBusy(),
  },
};

// Requests wait out a database that refuses connections for up to the
// request connect-retry window, so a restart or switchover shorter than that
// costs them only latency. Failing readiness at the first refused connection
// would instead take every replica out of the load balancer at once, failing
// requests that would have succeeded. A connection error therefore reports
// 'retrying' (still ready) until it has lasted longer than that window,
// counted from the first failure and reset by the first success. Any other
// failure, a timeout and draining still fail readiness at once.
const connectionFailingSince = new Map<string, number>();

// Probes repeat every few seconds; log when a check's result changes rather
// than on every failing probe.
const lastResults = new Map<string, CheckResult>();

// The endpoint is public and not rate limited, and probes queue on the pools
// that serve requests. A probe that times out leaves its connection request
// queued until the pool's own connect timeout, so a check still waiting for
// one repeats its last result instead of queuing another; together with
// sharing one evaluation between concurrent requests, a flood of probes adds
// at most one waiting caller to each pool.
const waitingForConnection = new Set<string>();

function describeResult(result: CheckResult, failure: unknown): string {
  switch (result) {
    case 'busy':
      return `waited ${readinessTimeoutMs} ms for a busy connection pool; counted as ready`;
    case 'timeout':
      return `timed out after ${readinessTimeoutMs} ms`;
    case 'retrying':
      return `cannot connect to the database; counted as ready for up to ${requestConnectRetry.windowMs} ms while requests retry: ${describeError(failure)}`;
    default:
      return `failed: ${describeError(failure)}`;
  }
}

async function runCheck(
  name: string,
  check: ReadinessCheck
): Promise<CheckResult> {
  if (waitingForConnection.has(name)) {
    return lastResults.get(name) ?? 'timeout';
  }
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  let acquired = false;
  let holding: pg.PoolClient | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      // Neither pool bounds its queries, so a query on a connection that
      // stopped answering would keep its client checked out, and every later
      // probe would pin another until the pool had none left for requests.
      // Discarding it frees the slot now; the query's late result is ignored.
      holding?.release(true);
      holding = undefined;
      resolve('timeout');
    }, readinessTimeoutMs);
  });
  const attempt = async () => {
    waitingForConnection.add(name);
    let client: pg.PoolClient;
    try {
      client = await check.connect();
    } finally {
      waitingForConnection.delete(name);
    }
    if (timedOut) {
      client.release();
      return;
    }
    acquired = true;
    holding = client;
    try {
      await client.query(check.query);
    } catch (error) {
      if (holding === client) {
        holding = undefined;
        client.release(true);
      }
      throw error;
    }
    if (holding !== client) return;
    holding = undefined;
    client.release();
    if (!timedOut) await check.after?.();
  };
  let result: CheckResult;
  let failure: unknown;
  try {
    result = await Promise.race([attempt().then(() => 'ok' as const), timeout]);
    if (result === 'timeout' && !acquired && check.poolBusy()) {
      result = 'busy';
    }
  } catch (error) {
    result = 'failed';
    failure = error;
  } finally {
    clearTimeout(timer);
  }
  if (result === 'ok' || result === 'busy') {
    connectionFailingSince.delete(name);
  } else if (result === 'failed' && isConnectionError(failure)) {
    const now = Date.now();
    const since = connectionFailingSince.get(name) ?? now;
    connectionFailingSince.set(name, since);
    if (now - since < requestConnectRetry.windowMs) {
      result = 'retrying';
    }
  }
  const previous = lastResults.get(name);
  if (previous !== result) {
    if (result === 'ok') {
      if (
        previous === 'failed' ||
        previous === 'timeout' ||
        previous === 'retrying'
      ) {
        log('info', `Readiness check ${name} recovered.`);
      }
    } else {
      log(
        result === 'busy' ? 'info' : 'warn',
        `Readiness check ${name} ${describeResult(result, failure)}`
      );
    }
    lastResults.set(name, result);
  }
  return result;
}

/**
 * @swagger
 * /health:
 *   get:
 *     summary: System health check
 *     description: Liveness. Answers as long as the process serves HTTP; it does not check the database.
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: System is up and running.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: UP
 */
router.get('/', async (req, res) => {
  return res.json({
    status: 'UP',
  });
});

interface Readiness {
  code: 200 | 503;
  body: { status: string; checks: Record<string, CheckResult> };
}

let pendingReadiness: Promise<Readiness> | undefined;

async function evaluateReadiness(): Promise<Readiness> {
  const checks = Object.fromEntries(
    await Promise.all(
      Object.entries(readinessChecks).map(
        async ([name, check]) => [name, await runCheck(name, check)] as const
      )
    )
  );
  const results = Object.values(checks);
  const ready = results.every(
    (result) => result === 'ok' || result === 'busy' || result === 'retrying'
  );
  const status = !ready
    ? 'NOT_READY'
    : results.includes('retrying')
      ? 'DEGRADED'
      : 'READY';
  return { code: ready ? 200 : 503, body: { status, checks } };
}

/**
 * @swagger
 * /health/ready:
 *   get:
 *     summary: Readiness check
 *     description: Whether this instance can serve requests now. Runs a query on the database and on the authentication tables, each limited to 2 seconds, and fails while the server shuts down. A check still waiting for a connection from a busy pool after 2 seconds reports busy and counts as ready. A check that cannot connect to the database reports retrying and counts as ready (status DEGRADED) until the failure has lasted longer than the 10-second window in which requests retry their connection.
 *     tags: [System & Admin]
 *     responses:
 *       200:
 *         description: Ready to serve requests.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [READY, DEGRADED]
 *                 checks:
 *                   type: object
 *                   additionalProperties:
 *                     type: string
 *                     enum: [ok, busy, retrying, failed, timeout]
 *       503:
 *         description: Not ready (status NOT_READY with the failing checks), or shutting down (status DRAINING).
 */
router.get('/ready', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (isShuttingDown()) {
    return res.status(503).json({ status: 'DRAINING' });
  }
  pendingReadiness ??= evaluateReadiness().finally(() => {
    pendingReadiness = undefined;
  });
  const { code, body } = await pendingReadiness;
  return res.status(code).json(body);
});

export default router;
