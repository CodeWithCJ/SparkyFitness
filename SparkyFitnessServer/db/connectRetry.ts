import type pg from 'pg';
import { log } from '../config/logging.js';
import { describeError } from '../utils/errors.js';

const connectionErrorCodes = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now: starting up, shutting down or in recovery
]);

// node-postgres raises these without a code.
const connectionErrorMessages = new Set([
  // pg-pool: connectionTimeoutMillis expired before the connection was made.
  'Connection terminated due to connection timeout',
  // pg: the socket of a pooled client closed before its next query.
  'Connection terminated unexpectedly',
]);

/**
 * True for errors that mean the database is not reachable right now, as
 * opposed to one that will fail the same way on every attempt, such as bad
 * credentials or a full pool.
 */
function isConnectionError(error: unknown): boolean {
  for (let current = error, depth = 0; current && depth < 5; depth++) {
    const { code, message, cause } = current as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    if (typeof code === 'string' && connectionErrorCodes.has(code)) return true;
    if (typeof message === 'string' && connectionErrorMessages.has(message)) {
      return true;
    }
    current = cause;
  }
  return false;
}

interface ConnectRetryOptions {
  /** No new attempt starts later than this after the first one. */
  windowMs: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Starts the log line of each retry, and of the outage's first warning. */
  message: string;
}

// During an outage every waiting caller retries about once a second, so a
// warning per retry would bury the log under hundreds of identical lines.
// Instead the first failure warns once, the first success reports how long
// the outage lasted, and each retry logs at debug. A caller that gives up
// still surfaces its own error.
let outage: { startedAt: number; callers: number } | null = null;

function noteRetry(
  message: string,
  error: unknown,
  delay: number,
  firstRetry: boolean
): void {
  if (!outage) {
    outage = { startedAt: Date.now(), callers: 0 };
    log(
      'warn',
      `${message}; retrying until the database is reachable again: ${describeError(error)}`
    );
  }
  if (firstRetry) outage.callers++;
  log('debug', `${message}, retrying in ${delay} ms: ${describeError(error)}`);
}

function noteConnected(): void {
  if (!outage) return;
  const seconds = ((Date.now() - outage.startedAt) / 1000).toFixed(1);
  log(
    'info',
    `Database reachable again after ${seconds} s; ${outage.callers} waiting callers had retried.`
  );
  outage = null;
}

/**
 * A database restart or primary switchover refuses connections for a few
 * seconds. Request-path acquires wait that out instead of failing the request.
 */
const requestConnectRetryWindowMs = 10_000;
const requestConnectRetry: ConnectRetryOptions = {
  // Unit tests run without a database, where an unmocked acquire has to fail
  // at once as it did before this retry existed, not stall the test for 10 s.
  // Tests of the retry turn it back on with enableRequestConnectRetry().
  windowMs: process.env.NODE_ENV === 'test' ? 0 : requestConnectRetryWindowMs,
  initialDelayMs: 100,
  maxDelayMs: 1_000,
  message: 'Database connection failed',
};

/** Test hook: restores the production request retry under NODE_ENV=test. */
function enableRequestConnectRetry(): void {
  requestConnectRetry.windowMs = requestConnectRetryWindowMs;
}

/**
 * Runs `attempt` again with exponential backoff while it fails with a
 * connection error. Only for work that has not sent any of the caller's
 * statements: acquiring a connection, or preparing the session it returns.
 */
async function retryOnConnectionError<T>(
  attempt: () => Promise<T>,
  { windowMs, initialDelayMs, maxDelayMs, message }: ConnectRetryOptions
): Promise<T> {
  const deadline = Date.now() + windowMs;
  let retried = false;
  for (let delay = initialDelayMs; ; delay = Math.min(delay * 2, maxDelayMs)) {
    let result: T;
    try {
      result = await attempt();
    } catch (error) {
      if (!isConnectionError(error) || Date.now() + delay > deadline) {
        throw error;
      }
      noteRetry(message, error, delay, !retried);
      retried = true;
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    noteConnected();
    return result;
  }
}

type PoolConnectCallback = (
  error: Error | undefined,
  client: pg.PoolClient | undefined,
  done: pg.PoolClient['release']
) => void;

/**
 * Makes every `pool.connect()` retry connection errors, for a pool handed to a
 * library that acquires its own connections (Better Auth). Statements are
 * never replayed: `pool.query()` acquires through `connect()` and only sends
 * its statement once that succeeds. Returns the original connect for callers
 * that must not wait, such as the readiness check.
 */
function retryPoolConnects(
  pool: pg.Pool,
  options: ConnectRetryOptions = requestConnectRetry
): () => Promise<pg.PoolClient> {
  const connectOnce = pool.connect.bind(pool) as () => Promise<pg.PoolClient>;
  const connect = (callback?: PoolConnectCallback) => {
    const acquired = retryOnConnectionError(connectOnce, options);
    if (!callback) return acquired;
    acquired.then(
      (client) => callback(undefined, client, client.release),
      (error: Error) => callback(error, undefined, () => {})
    );
  };
  pool.connect = connect as typeof pool.connect;
  return connectOnce;
}

export type { ConnectRetryOptions };
export {
  enableRequestConnectRetry,
  isConnectionError,
  requestConnectRetry,
  retryOnConnectionError,
  retryPoolConnects,
};
