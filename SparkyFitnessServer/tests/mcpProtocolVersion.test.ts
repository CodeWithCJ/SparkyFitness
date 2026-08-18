import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';

const logSpy = vi.fn();
vi.mock('../config/logging.js', () => ({
  log: (...a: unknown[]) => logSpy(...a),
}));

// The route module pulls in the whole tool registry and DB layer; the clamp is
// pure header logic, so stub the rest out rather than standing up the world.
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: class {},
}));
vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
  StreamableHTTPServerTransport: class {},
}));
vi.mock('../utils/timezoneLoader.js', () => ({ loadUserTimezone: vi.fn() }));
vi.mock('../ai/mcp/mcpAdapter.js', () => ({
  registerRegistryTools: vi.fn(),
  registerDevTools: vi.fn(),
}));
vi.mock('../utils/adminCheck.js', () => ({ resolveIsAdmin: vi.fn() }));
vi.mock('../services/versionService.js', () => ({
  default: { getAppVersion: () => '0.0.0-test' },
}));
vi.mock('../services/chatService.js', () => ({
  default: { getActiveAiServiceSetting: vi.fn() },
}));

const { clampFutureProtocolVersion } = await import('../routes/mcpRoutes.js');

const reqWith = (version?: string) =>
  ({
    headers: version === undefined ? {} : { 'mcp-protocol-version': version },
    // The transport reads rawHeaders, not the parsed headers, so the fixture
    // has to carry both for the test to mean anything.
    rawHeaders: version === undefined ? [] : ['MCP-Protocol-Version', version],
  }) as never;

describe('clampFutureProtocolVersion', () => {
  beforeEach(() => logSpy.mockClear());

  it('rewrites a version newer than this SDK to the latest supported one', () => {
    // Claude.ai's connector negotiates 2025-11-25 at initialize and then sends
    // its own newest version on every later request; the transport used to 400
    // the whole call.
    const req = reqWith('2026-07-28');
    clampFutureProtocolVersion(req);
    expect(
      (req as unknown as { headers: Record<string, string> }).headers[
        'mcp-protocol-version'
      ]
    ).toBe(LATEST_PROTOCOL_VERSION);
    expect(logSpy).toHaveBeenCalled();
  });

  it('also rewrites rawHeaders, which is what the transport actually reads', () => {
    // The Node transport rebuilds a Web Request from rawHeaders via Hono, so a
    // clamp applied only to req.headers is discarded and the 400 persists.
    const req = reqWith('2026-07-28');
    clampFutureProtocolVersion(req);
    const raw = (req as unknown as { rawHeaders: string[] }).rawHeaders;
    expect(raw[1]).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('leaves every supported version untouched', () => {
    for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
      const req = reqWith(version);
      clampFutureProtocolVersion(req);
      expect(
        (req as unknown as { headers: Record<string, string> }).headers[
          'mcp-protocol-version'
        ]
      ).toBe(version);
    }
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('leaves an unrecognised OLDER version alone so it still fails loudly', () => {
    // Silently upgrading a client that asked for something ancient would hide a
    // real incompatibility.
    const req = reqWith('2023-01-01');
    clampFutureProtocolVersion(req);
    expect(
      (req as unknown as { headers: Record<string, string> }).headers[
        'mcp-protocol-version'
      ]
    ).toBe('2023-01-01');
  });

  it('does nothing when the header is absent', () => {
    const req = reqWith();
    clampFutureProtocolVersion(req);
    expect(
      (req as unknown as { headers: Record<string, string> }).headers[
        'mcp-protocol-version'
      ]
    ).toBeUndefined();
  });

  it('handles a repeated header (array form) without throwing', () => {
    const req = {
      headers: { 'mcp-protocol-version': ['2026-07-28', '2026-07-28'] },
    } as never;
    expect(() => clampFutureProtocolVersion(req)).not.toThrow();
    expect(
      (req as unknown as { headers: Record<string, string> }).headers[
        'mcp-protocol-version'
      ]
    ).toBe(LATEST_PROTOCOL_VERSION);
  });
});
