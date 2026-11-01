import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import cron from 'node-cron';
import { log } from '../config/logging.js';
import { endPool } from '../db/poolManager.js';
import {
  releaseRunningProviderSyncs,
  runningProviderSyncCount,
  waitForProviderSyncs,
} from '../services/providerSyncClaim.js';
import {
  markShuttingDown,
  pendingBackgroundWorkCount,
  waitForBackgroundWork,
} from './shutdownHooks.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_SECONDS = 15;
export const MIN_SHUTDOWN_TIMEOUT_SECONDS = 1;
export const MAX_SHUTDOWN_TIMEOUT_SECONDS = 3600;
const HALF_CLOSE_GRACE_MS = 2_000;

/**
 * SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS: the most time between a stop
 * signal and the process exiting. Whatever stops the container must wait
 * longer before killing it (Compose stop_grace_period, Kubernetes
 * terminationGracePeriodSeconds).
 */
export function shutdownTimeoutMs(
  value = process.env.SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS
): number {
  if (value === undefined || value.trim() === '') {
    return DEFAULT_SHUTDOWN_TIMEOUT_SECONDS * 1000;
  }
  const seconds = Number(value);
  if (
    !Number.isFinite(seconds) ||
    seconds < MIN_SHUTDOWN_TIMEOUT_SECONDS ||
    seconds > MAX_SHUTDOWN_TIMEOUT_SECONDS
  ) {
    // 'error' so the ignored setting shows at the documented ERROR log level.
    log(
      'error',
      `SPARKY_FITNESS_SHUTDOWN_TIMEOUT_SECONDS="${value}" must be from ${MIN_SHUTDOWN_TIMEOUT_SECONDS} to ${MAX_SHUTDOWN_TIMEOUT_SECONDS} seconds; using ${DEFAULT_SHUTDOWN_TIMEOUT_SECONDS}.`
    );
    return DEFAULT_SHUTDOWN_TIMEOUT_SECONDS * 1000;
  }
  return Math.round(seconds * 1000);
}

interface ConnectionTracker {
  /** Each connection's responses not yet sent in full, oldest first. */
  connections: Map<Socket, Set<ServerResponse>>;
  draining: boolean;
}

const connectionTrackers = new WeakMap<Server, ConnectionTracker>();

function openResponses(
  tracker: ConnectionTracker,
  socket: Socket
): Set<ServerResponse> {
  let open = tracker.connections.get(socket);
  if (!open) {
    open = new Set();
    tracker.connections.set(socket, open);
    socket.once('close', () => tracker.connections.delete(socket));
  }
  return open;
}

/**
 * Half-closes the connection: whatever is still in its write buffer goes out
 * first, then the FIN. Destroying it instead would drop that data and cut a
 * large response short, even one the client has been told is complete.
 * A client that never closes its side would hold the drain to the shutdown
 * timeout, so the connection is destroyed a moment after everything on it
 * has been written out.
 */
function endConnection(socket: Socket) {
  if (socket.destroyed || socket.writableEnded) return;
  socket.end();
  socket.once('finish', () => {
    const timer = setTimeout(() => socket.destroy(), HALF_CLOSE_GRACE_MS);
    timer.unref();
    socket.once('close', () => clearTimeout(timer));
  });
}

/**
 * Only the last response queued on a connection may carry `Connection:
 * close`: Node closes the connection once that response is sent, so an
 * earlier one carrying it would drop the pipelined responses behind it.
 */
function closeAfterLastResponse(open: Set<ServerResponse>) {
  const responses = [...open];
  const last = responses.pop();
  for (const res of responses) {
    if (!res.headersSent) res.removeHeader('Connection');
  }
  // A last response already written keeps its keep-alive header; the
  // connection is then ended once everything on it has been sent.
  if (last && !last.headersSent) last.setHeader('Connection', 'close');
}

/**
 * Follows connections and their responses so a drain can end keep-alive
 * connections without losing data. Installed at startup so requests already
 * running when the drain begins are covered too.
 *
 * Node's closeIdleConnections(), which server.close() also calls, destroys
 * every connection between requests, including one whose last response has
 * been handed to res.end() but still sits in the socket's write buffer
 * because the client reads slowly. That truncates a large response mid-body.
 * Node still picks the connections here, since its parser knows when a next
 * request has only partly arrived, but they are ended instead of destroyed.
 */
function trackConnections(server: Server): ConnectionTracker {
  const existing = connectionTrackers.get(server);
  if (existing) return existing;
  const tracker: ConnectionTracker = {
    connections: new Map(),
    draining: false,
  };
  connectionTrackers.set(server, tracker);
  server.prependListener('connection', (socket: Socket) => {
    openResponses(tracker, socket);
  });
  server.prependListener(
    'request',
    (req: IncomingMessage, res: ServerResponse) => {
      const open = openResponses(tracker, req.socket);
      open.add(res);
      if (tracker.draining) closeAfterLastResponse(open);
      // 'finish' fires once the response is written out to the socket (or
      // 'close' if the connection died first).
      const settled = () => {
        if (!open.delete(res)) return;
        if (tracker.draining) server.closeIdleConnections();
      };
      res.once('finish', settled);
      res.once('close', settled);
    }
  );
  const closeIdleConnections = server.closeIdleConnections.bind(server);
  server.closeIdleConnections = () => {
    const sockets = [...tracker.connections.keys()];
    const destroys = sockets.map((socket) => socket.destroy);
    for (const socket of sockets) {
      socket.destroy = () => {
        endConnection(socket);
        return socket;
      };
    }
    try {
      closeIdleConnections();
    } finally {
      sockets.forEach((socket, i) => {
        socket.destroy = destroys[i]!;
      });
    }
  };
  return tracker;
}

/**
 * server.close() only closes connections idle at that moment. A keep-alive
 * connection busy then (a reverse proxy's pooled connection, say) would stay
 * open until keepAliveTimeout, minutes away, and hold the drain to its
 * timeout. The last response not yet started on each connection gets
 * `Connection: close`, so Node closes the connection after sending it;
 * connections whose responses were already under way are ended once they
 * have been written out.
 */
function endKeepAlive(server: Server) {
  const tracker = trackConnections(server);
  tracker.draining = true;
  for (const open of tracker.connections.values()) {
    closeAfterLastResponse(open);
  }
  server.closeIdleConnections();
}

// Kept back from the wait so that releasing sync claims and closing the pools
// still fit inside the hard exit.
function cleanupReserveMs(timeoutMs: number): number {
  return Math.min(5000, Math.floor(timeoutMs / 3));
}

/**
 * Drains the server and returns the exit code: 0 when every request, job,
 * sync and tracked background task finished in time, 1 when some were cut off.
 *
 * Scheduled jobs stop firing before anything is awaited, so a draining server
 * never starts work it would then abandon. Sync claims still held after the
 * wait are released before the pools close, so the account can sync again at
 * once instead of after the claim expiry.
 */
export async function drainServer(
  server: Server,
  timeoutMs: number
): Promise<number> {
  const waitMs = timeoutMs - cleanupReserveMs(timeoutMs);
  markShuttingDown();
  const httpClosed = new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  endKeepAlive(server);
  const finished = (async () => {
    // node-cron resolves silently at its own timeout, so it gets the full
    // timeout and the wait below decides when to give up.
    await Promise.all([httpClosed, cron.shutdown(timeoutMs)]);
    // A request or job still running above can start a sync or background
    // task, so the registries are only read once those have finished.
    while (runningProviderSyncCount() > 0 || pendingBackgroundWorkCount() > 0) {
      await Promise.all([waitForProviderSyncs(), waitForBackgroundWork()]);
    }
    return true;
  })();
  let waitTimer: NodeJS.Timeout | undefined;
  const gaveUp = new Promise<false>((resolve) => {
    waitTimer = setTimeout(() => resolve(false), waitMs);
  });
  const drained = await Promise.race([finished, gaveUp]);
  clearTimeout(waitTimer);
  if (!drained) {
    log(
      'warn',
      `Shutdown stopped waiting after ${waitMs / 1000}s: ${runningProviderSyncCount()} provider sync(s) and ${pendingBackgroundWorkCount()} background task(s) still running.`
    );
    server.closeAllConnections();
  }
  await releaseRunningProviderSyncs();
  try {
    await endPool();
    log('info', 'Database pools closed. Exiting.');
  } catch (error) {
    log('error', 'Error closing database pools:', error);
  }
  return drained ? 0 : 1;
}

/**
 * On SIGTERM or SIGINT, drains the server and exits with drainServer's code;
 * exits 1 if that takes longer than the shutdown timeout.
 */
export function installShutdownHandlers(
  server: Server,
  timeoutMs = shutdownTimeoutMs()
) {
  trackConnections(server);
  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(
      'info',
      `${signal} received, shutting down gracefully (up to ${timeoutMs / 1000}s)...`
    );
    setTimeout(() => {
      log(
        'error',
        `Graceful shutdown timed out after ${timeoutMs / 1000}s, forcing exit.`
      );
      // eslint-disable-next-line n/no-process-exit
      process.exit(1);
    }, timeoutMs).unref();
    void drainServer(server, timeoutMs)
      .catch((error: unknown) => {
        log('error', 'Graceful shutdown failed:', error);
        return 1;
      })
      .then((code) => {
        // eslint-disable-next-line n/no-process-exit
        process.exit(code);
      });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
