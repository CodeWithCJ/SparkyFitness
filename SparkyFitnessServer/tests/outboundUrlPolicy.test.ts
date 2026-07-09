import net from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import {
  assertOutboundUrlShapeAndLiteralAllowed,
  createGuardedDispatcher,
  isOutboundUrlBlockedError,
  OutboundUrlBlockedError,
  OutboundUrlShapeError,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
  resolveHostnameForOutboundConnection,
} from '../utils/outboundUrlPolicy.js';

const PRIVATE_ALLOWED_POLICY = {
  allowPrivateNetwork: true,
  reason: 'admin' as const,
};

describe('outboundUrlPolicy', () => {
  it('accepts public http(s) URLs', () => {
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(
        'https://api.openai.com/v1/chat/completions',
        PUBLIC_ONLY_AI_NETWORK_POLICY
      )
    ).not.toThrow();
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(
        'http://8.8.8.8:1234/v1',
        PUBLIC_ONLY_AI_NETWORK_POLICY
      )
    ).not.toThrow();
  });

  it.each([
    'http://localhost:11434',
    'http://localhost.:11434',
    'http://127.0.0.1:5432',
    'http://127.1:5432',
    'http://2130706433:5432',
    'http://10.0.0.5',
    'http://172.16.0.1',
    'http://192.168.1.10',
    'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1',
    'http://0.0.0.0',
    'http://[::1]:11434',
    'http://[::ffff:127.0.0.1]:11434',
  ])('rejects private/internal literal URL %s', (url) => {
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(
        url,
        PUBLIC_ONLY_AI_NETWORK_POLICY
      )
    ).toThrow(OutboundUrlBlockedError);
  });

  // Shape violations are bad input (OutboundUrlShapeError, 400), distinct from
  // private-network policy denials (OutboundUrlBlockedError, 403) — and they are
  // rejected even for trusted policies since fetch could never use these URLs.
  it.each([
    'file:///etc/passwd',
    'gopher://example.com/',
    'ftp://8.8.8.8/',
    'http://user:pass@example.com/v1',
    'not a url',
  ])('rejects unsafe or malformed URL %s', (url) => {
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(
        url,
        PUBLIC_ONLY_AI_NETWORK_POLICY
      )
    ).toThrow(OutboundUrlShapeError);
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(url, PRIVATE_ALLOWED_POLICY)
    ).toThrow(OutboundUrlShapeError);
  });

  it('rejects hostnames when any resolved address is private', async () => {
    const lookup = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);

    await expect(
      resolveHostnameForOutboundConnection(
        'mixed.example',
        PUBLIC_ONLY_AI_NETWORK_POLICY,
        lookup
      )
    ).rejects.toThrow(OutboundUrlBlockedError);
  });

  it('returns the resolved public address when all DNS answers are public', async () => {
    const lookup = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 },
    ]);

    await expect(
      resolveHostnameForOutboundConnection(
        'public.example',
        PUBLIC_ONLY_AI_NETWORK_POLICY,
        lookup
      )
    ).resolves.toBe('8.8.8.8');
  });

  it('allows private destinations when the policy is trusted', async () => {
    expect(() =>
      assertOutboundUrlShapeAndLiteralAllowed(
        'http://localhost:11434',
        PRIVATE_ALLOWED_POLICY
      )
    ).not.toThrow();

    await expect(
      resolveHostnameForOutboundConnection(
        'internal.example',
        PRIVATE_ALLOWED_POLICY,
        vi.fn()
      )
    ).resolves.toBe('internal.example');
  });

  it('recognizes policy errors wrapped by fetch-style cause chains', () => {
    const blocked = new OutboundUrlBlockedError('blocked by policy');
    const wrapped = new TypeError('fetch failed', {
      cause: new Error('provider request failed', { cause: blocked }),
    });

    expect(isOutboundUrlBlockedError(wrapped)).toBe(true);
  });

  it('closes a stalled TLS connection with the bounded connector timeout', async () => {
    const sockets = new Set<net.Socket>();
    const server = net.createServer((socket) => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
      // Drain the TLS ClientHello so EOF/RST is observable via `close`.
      socket.resume();
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Test server did not bind to a TCP address.');
    }

    const dispatcher = createGuardedDispatcher(PRIVATE_ALLOWED_POLICY, {
      connectTimeout: 50,
    });

    try {
      const outcome = await Promise.race([
        fetch(`https://127.0.0.1:${address.port}`, {
          // Undici-specific option supported by Node's fetch implementation.
          dispatcher,
        } as RequestInit & { dispatcher: unknown }).then(
          () => 'resolved',
          () => 'rejected'
        ),
        new Promise<'pending'>((resolve) =>
          setTimeout(() => resolve('pending'), 1_500)
        ),
      ]);

      expect(outcome).toBe('rejected');
      await vi.waitFor(() => expect(sockets.size).toBe(0), {
        timeout: 500,
        interval: 10,
      });
    } finally {
      for (const socket of sockets) socket.destroy();
      await dispatcher.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
