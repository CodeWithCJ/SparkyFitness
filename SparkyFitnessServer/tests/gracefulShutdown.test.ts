import type { Server } from 'node:http';
import cron from 'node-cron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endPool } from '../db/poolManager.js';
import {
  releaseRunningProviderSyncs,
  runningProviderSyncCount,
  waitForProviderSyncs,
} from '../services/providerSyncClaim.js';
import { log } from '../config/logging.js';
import {
  drainServer,
  installShutdownHandlers,
} from '../utils/gracefulShutdown.js';
import { isShuttingDown, trackBackgroundWork } from '../utils/shutdownHooks.js';

vi.mock('node-cron', () => ({ default: { shutdown: vi.fn() } }));
vi.mock('../db/poolManager.js', () => ({ endPool: vi.fn() }));
vi.mock('../services/providerSyncClaim.js', () => ({
  waitForProviderSyncs: vi.fn(),
  releaseRunningProviderSyncs: vi.fn(),
  runningProviderSyncCount: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let calls: string[];
let closeHttp: () => void;
let server: Server;
let cronJob: ReturnType<typeof deferred>;
let sync: ReturnType<typeof deferred>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  calls = [];
  cronJob = deferred();
  sync = deferred();
  server = {
    close: vi.fn((callback: () => void) => {
      calls.push('server.close');
      closeHttp = callback;
    }),
    closeAllConnections: vi.fn(() => calls.push('closeAllConnections')),
    closeIdleConnections: vi.fn(),
    prependListener: vi.fn(),
  } as unknown as Server;
  vi.mocked(cron.shutdown).mockImplementation(async () => {
    calls.push('cron.shutdown');
    await cronJob.promise;
    calls.push('cron jobs settled');
  });
  let syncRunning = true;
  vi.mocked(runningProviderSyncCount).mockImplementation(() =>
    syncRunning ? 1 : 0
  );
  vi.mocked(waitForProviderSyncs).mockImplementation(async () => {
    await sync.promise;
    if (syncRunning) calls.push('syncs settled');
    syncRunning = false;
  });
  vi.mocked(releaseRunningProviderSyncs).mockImplementation(async () => {
    calls.push('release claims');
  });
  vi.mocked(endPool).mockImplementation(async () => {
    calls.push('endPool');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('drainServer', () => {
  it('closes the pools only after jobs, syncs, requests and background work finish', async () => {
    const background = deferred();
    trackBackgroundWork(background.promise);

    const result = drainServer(server, 15_000);
    await vi.advanceTimersByTimeAsync(0);

    expect(isShuttingDown()).toBe(true);
    expect(calls).toEqual(['server.close', 'cron.shutdown']);
    expect(cron.shutdown).toHaveBeenCalledWith(15_000);

    cronJob.resolve();
    sync.resolve();
    closeHttp();
    await vi.advanceTimersByTimeAsync(1000);
    expect(endPool).not.toHaveBeenCalled();

    background.resolve();
    expect(await result).toBe(0);
    expect(calls).toEqual([
      'server.close',
      'cron.shutdown',
      'cron jobs settled',
      'syncs settled',
      'release claims',
      'endPool',
    ]);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it('waits for background work a request starts after shutdown began', async () => {
    cronJob.resolve();
    sync.resolve();
    const result = drainServer(server, 15_000);
    await vi.advanceTimersByTimeAsync(0);

    const late = deferred();
    trackBackgroundWork(late.promise);
    closeHttp();
    await vi.advanceTimersByTimeAsync(1000);
    expect(endPool).not.toHaveBeenCalled();

    late.resolve();
    expect(await result).toBe(0);
  });

  it('reports a cron job still running at the deadline as cut off', async () => {
    // Like node-cron: resolves at its own timeout whether or not the job ended.
    vi.mocked(cron.shutdown).mockImplementation(
      (timeout = 0) => new Promise((resolve) => setTimeout(resolve, timeout))
    );
    sync.resolve();
    const result = drainServer(server, 15_000);
    closeHttp();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBe(1);
  });

  it('gives up at the timeout, keeping time to release claims before closing the pools', async () => {
    closeHttp = () => {};
    const result = drainServer(server, 15_000);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(releaseRunningProviderSyncs).not.toHaveBeenCalled();
    expect(endPool).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toBe(1);
    expect(calls.slice(-3)).toEqual([
      'closeAllConnections',
      'release claims',
      'endPool',
    ]);
    expect(log).toHaveBeenCalledWith(
      'warn',
      expect.stringContaining('1 provider sync(s)')
    );
  });

  it('still exits cleanly when closing the pools fails', async () => {
    vi.mocked(endPool).mockRejectedValueOnce(new Error('already closed'));
    cronJob.resolve();
    sync.resolve();
    const result = drainServer(server, 15_000);
    closeHttp();

    expect(await result).toBe(0);
    expect(log).toHaveBeenCalledWith(
      'error',
      'Error closing database pools:',
      expect.any(Error)
    );
  });
});

describe('installShutdownHandlers', () => {
  let added: Array<(...args: unknown[]) => void>;
  let exit: ReturnType<typeof vi.spyOn>;
  let stopServer: (reason: string) => void;

  beforeEach(() => {
    const before = new Set(process.listeners('SIGTERM'));
    stopServer = installShutdownHandlers(server, 15_000);
    added = process
      .listeners('SIGTERM')
      .filter((listener) => !before.has(listener)) as typeof added;
    exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    for (const listener of added) process.off('SIGTERM', listener);
    for (const listener of process.listeners('SIGINT').slice(-1)) {
      process.off('SIGINT', listener);
    }
    exit.mockRestore();
  });

  it('exits 0 once drained and ignores a second signal', async () => {
    cronJob.resolve();
    sync.resolve();
    added[0]!();
    added[0]!();
    closeHttp();
    await vi.advanceTimersByTimeAsync(0);

    expect(server.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('drains and exits 1 when the server stops itself', async () => {
    cronJob.resolve();
    sync.resolve();
    stopServer('Database schema mismatch');
    added[0]!();
    closeHttp();
    await vi.advanceTimersByTimeAsync(0);

    expect(isShuttingDown()).toBe(true);
    expect(server.close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('forces exit at the timeout when cleanup itself hangs', async () => {
    vi.mocked(endPool).mockReturnValue(new Promise(() => {}));
    added[0]!();

    await vi.advanceTimersByTimeAsync(14_999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledExactlyOnceWith(1);
  });
});
