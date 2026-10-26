/**
 * SIGTERM to a real server process (tests/fixtures/keepAliveDrainChild.ts,
 * production keep-alive timeout of 181 s) while a keep-alive client, like a
 * load balancer's connection pool, holds connections to it: the drain must
 * end those connections and exit promptly instead of waiting for the
 * keep-alive timeout or its own shutdown timeout. No database needed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');
const childPath = path.join(here, 'fixtures', 'keepAliveDrainChild.ts');

interface Running {
  proc: ChildProcess;
  port: number;
  exited: Promise<number | null>;
  output: () => string;
}

let running: Running | undefined;
let agent: http.Agent | undefined;

afterEach(() => {
  agent?.destroy();
  agent = undefined;
  if (running && running.proc.exitCode === null) running.proc.kill('SIGKILL');
  running = undefined;
});

async function startChild(): Promise<Running> {
  const proc = spawn(process.execPath, ['--import', 'tsx', childPath], {
    cwd: serverRoot,
    env: {
      ...process.env,
      SPARKY_FITNESS_LOG_LEVEL: 'INFO',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const port = await new Promise<number>((resolve, reject) => {
    proc.stdout!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const match = /PORT (\d+)/.exec(output);
      if (match) resolve(Number(match[1]));
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      output += chunk.toString();
    });
    proc.once('exit', () =>
      reject(new Error(`child exited early:\n${output}`))
    );
  });
  const exited = new Promise<number | null>((resolve) => {
    if (proc.exitCode !== null) resolve(proc.exitCode);
    else proc.once('exit', (code) => resolve(code));
  });
  running = { proc, port, exited, output: () => output };
  return running;
}

function get(
  port: number,
  pathname: string
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: pathname, agent }, (res) => {
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body })
        );
      })
      .on('error', reject);
  });
}

const LARGE_BYTES = 32 * 1024 * 1024;

/**
 * A client that stops reading as soon as the headers arrive and only reads
 * the rest once `readFrom` resolves, so most of the body is still in the
 * server's socket write buffer meanwhile, like a large response going out to
 * a slow link. Resolves with how much of the body arrived instead of
 * rejecting, so a truncated body shows up as a short count.
 */
function getSlowly(
  port: number,
  pathname: string,
  readFrom: Promise<unknown>
): {
  headers: Promise<void>;
  done: Promise<{ received: number; complete: boolean }>;
} {
  let headersArrived!: () => void;
  const headers = new Promise<void>((resolve) => {
    headersArrived = resolve;
  });
  const done = new Promise<{ received: number; complete: boolean }>(
    (resolve) => {
      let received = 0;
      const req = http.get(
        { host: '127.0.0.1', port, path: pathname, agent },
        (res) => {
          res.pause();
          headersArrived();
          res.on('data', (chunk: Buffer) => {
            received += chunk.length;
          });
          res.on('error', () => {});
          res.on('close', () => resolve({ received, complete: res.complete }));
          void readFrom.then(() => res.resume());
        }
      );
      req.on('error', () => resolve({ received, complete: false }));
    }
  );
  return { headers, done };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A raw connection, for request shapes http.Agent never sends: pipelined
 * requests and a request whose headers arrive in two parts. Resolves with
 * everything received once the server closes the connection.
 */
function rawConnection(port: number, allowHalfOpen = false) {
  const socket = net.connect({ port, host: '127.0.0.1', allowHalfOpen });
  let received = '';
  socket.on('data', (chunk: Buffer) => {
    received += chunk.toString();
  });
  const closed = new Promise<string>((resolve) => {
    socket.on('close', () => resolve(received));
    socket.on('error', () => {});
  });
  return { socket, closed };
}

const statusLines = (received: string) =>
  received.match(/HTTP\/1\.1 \d+/g) ?? [];

/** Each response's Connection header, in the order the responses arrived. */
const connectionHeaders = (received: string) =>
  (received.match(/HTTP\/1\.1 \d+.*?\r\n\r\n/gs) ?? []).map(
    (head) => /^connection: (.*)$/im.exec(head)?.[1]?.trim() ?? null
  );

async function terminate(child: Running) {
  const signalledAt = Date.now();
  child.proc.kill('SIGTERM');
  const code = await child.exited;
  return { code, elapsedMs: Date.now() - signalledAt };
}

describe('drain with keep-alive connections', () => {
  it('exits at once when a keep-alive connection is idle', async () => {
    const child = await startChild();
    agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    expect((await get(child.port, '/')).headers.connection).toBe('keep-alive');

    const result = await terminate(child);

    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(2000);
    expect(child.output()).toContain('SIGTERM received');
  }, 30_000);

  it('answers a request in flight with Connection: close and exits once it is sent', async () => {
    const child = await startChild();
    agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    await get(child.port, '/');
    // Reuses the pooled connection, which is busy when the drain begins.
    const inFlight = get(child.port, '/slow?ms=800');
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [result, response] = await Promise.all([terminate(child), inFlight]);

    expect(response.body).toBe('slow');
    expect(response.headers.connection).toBe('close');
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(3000);
  }, 30_000);

  it('closes a connection whose response had already started once it ends', async () => {
    const child = await startChild();
    agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    const streaming = get(child.port, '/stream?ms=800');
    await new Promise((resolve) => setTimeout(resolve, 200));

    const [result, response] = await Promise.all([terminate(child), streaming]);

    expect(response.body).toBe('start end');
    // Its headers went out before the drain, still promising keep-alive.
    expect(response.headers.connection).toBe('keep-alive');
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(3000);
  }, 30_000);

  it('finishes sending a large response that was still in the write buffer at SIGTERM', async () => {
    const child = await startChild();
    agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    let startReading!: () => void;
    const reading = new Promise<void>((resolve) => {
      startReading = resolve;
    });
    const large = getSlowly(child.port, `/large?bytes=${LARGE_BYTES}`, reading);
    await large.headers;
    await sleep(200);

    const terminated = terminate(child);
    await sleep(500);
    startReading();
    const [result, response] = await Promise.all([terminated, large.done]);

    expect(response.received).toBe(LARGE_BYTES);
    expect(response.complete).toBe(true);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(5000);
  }, 30_000);

  it('keeps flushing a large response when another response ends during the drain', async () => {
    const child = await startChild();
    agent = new http.Agent({ keepAlive: true, maxSockets: 2 });
    let startReading!: () => void;
    const reading = new Promise<void>((resolve) => {
      startReading = resolve;
    });
    // Both responses are under way at SIGTERM; the large body is written
    // during the drain, and the small response ends while that body is
    // still waiting for the reader.
    const large = getSlowly(
      child.port,
      `/large?bytes=${LARGE_BYTES}&ms=300`,
      reading
    );
    const small = get(child.port, '/stream?ms=800');
    await sleep(100);

    const terminated = terminate(child);
    expect((await small).body).toBe('start end');
    await sleep(300);
    startReading();
    const [result, response] = await Promise.all([terminated, large.done]);

    expect(response.received).toBe(LARGE_BYTES);
    expect(response.complete).toBe(true);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(5000);
  }, 30_000);

  it('answers every pipelined request that arrived before SIGTERM', async () => {
    const child = await startChild();
    const { socket, closed } = rawConnection(child.port);
    socket.write(
      'GET /slow?ms=500 HTTP/1.1\r\nHost: x\r\n\r\n' +
        'GET /slow?ms=700 HTTP/1.1\r\nHost: x\r\n\r\n'
    );
    await sleep(200);

    const [result, received] = await Promise.all([terminate(child), closed]);

    expect(statusLines(received)).toEqual(['HTTP/1.1 200', 'HTTP/1.1 200']);
    expect(received.match(/slow/g)).toHaveLength(2);
    // Only the last response closes the connection.
    expect(connectionHeaders(received)).toEqual([null, 'close']);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(3000);
  }, 30_000);

  it('answers a pipelined request that finished before the one ahead of it', async () => {
    const child = await startChild();
    const { socket, closed } = rawConnection(child.port);
    // The second response is complete but queued behind the first.
    socket.write(
      'GET /slow?ms=700 HTTP/1.1\r\nHost: x\r\n\r\n' +
        'GET / HTTP/1.1\r\nHost: x\r\n\r\n'
    );
    await sleep(200);

    const [result, received] = await Promise.all([terminate(child), closed]);

    expect(statusLines(received)).toEqual(['HTTP/1.1 200', 'HTTP/1.1 200']);
    expect(received).toMatch(/slow.*ok$/s);
    // The second response was written before the drain and kept its
    // keep-alive header, so the first must not carry Connection: close.
    expect(connectionHeaders(received)).toEqual([null, 'keep-alive']);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(3000);
  }, 30_000);

  it('answers a request whose headers were still arriving at SIGTERM', async () => {
    const child = await startChild();
    const { socket, closed } = rawConnection(child.port);
    // The first request is answered before SIGTERM; the second has only
    // started to arrive.
    socket.write(
      'GET /slow?ms=100 HTTP/1.1\r\nHost: x\r\n\r\nGET / HTTP/1.1\r\nHo'
    );
    await sleep(400);

    const terminated = terminate(child);
    await sleep(200);
    socket.write('st: x\r\n\r\n');
    const [result, received] = await Promise.all([terminated, closed]);

    expect(statusLines(received)).toEqual(['HTTP/1.1 200', 'HTTP/1.1 200']);
    expect(received).toMatch(/\r\n\r\nok$/);
    expect(connectionHeaders(received)).toEqual(['keep-alive', 'close']);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(3000);
  }, 30_000);

  it('closes an idle connection whose client never closes its side', async () => {
    const child = await startChild();
    const { socket, closed } = rawConnection(child.port, true);
    socket.write('GET / HTTP/1.1\r\nHost: x\r\n\r\n');
    await sleep(200);

    // This client keeps its side open, so its own socket never closes.
    const result = await terminate(child);
    socket.destroy();

    expect(statusLines(await closed)).toEqual(['HTTP/1.1 200']);
    expect(result.code, child.output()).toBe(0);
    expect(result.elapsedMs).toBeLessThan(5000);
  }, 30_000);
});
