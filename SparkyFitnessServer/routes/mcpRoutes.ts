import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js';
import { isDayString } from '@workspace/shared';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  registerRegistryTools,
  registerDevTools,
} from '../ai/mcp/mcpAdapter.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import versionService from '../services/versionService.js';
import chatService from '../services/chatService.js';
import { TtlCache } from '../utils/ttlCache.js';

const router = express.Router();

/**
 * Clamp an unrecognised `MCP-Protocol-Version` header down to the newest version
 * this SDK understands.
 *
 * `initialize` already negotiates correctly — a client asking for a future
 * version is answered with ours. But some clients (Claude.ai's connector at the
 * time of writing) then send *their* newest version in the header on every
 * subsequent request rather than the negotiated one, and the transport rejects
 * the whole request:
 *
 *   Bad Request: Unsupported protocol version: 2026-07-28
 *   (supported versions: 2025-11-25, 2025-06-18, ...)
 *
 * The spec says the client MUST send the negotiated version, so that is a
 * client-side fault — but 400ing every call is a poor way to meet it, and the
 * request is otherwise perfectly serviceable at our version.
 *
 * Only a well-formed version that genuinely post-dates this SDK is clamped.
 * An unrecognised *older* version, and anything that is not a real date, are
 * both left alone so they still fail loudly rather than being silently
 * upgraded — the spec requires a 400 for a malformed version.
 */
export function clampFutureProtocolVersion(req: express.Request): void {
  const version = req.headers['mcp-protocol-version'];
  // Node collapses a repeated non-`set-cookie` header into a single
  // comma-joined string, so this is a string or undefined — never an array.
  // A repeated header therefore arrives as "2026-07-28, 2026-07-28", fails the
  // date check below, and is left for the transport to reject with the same 400
  // it already returned before this clamp existed.
  if (typeof version !== 'string') return;
  if (SUPPORTED_PROTOCOL_VERSIONS.includes(version)) return;
  // The comparison below is lexicographic, so it is only a version comparison
  // for real dates. Without this guard a value like "latest" or "foo" sorts
  // above LATEST_PROTOCOL_VERSION and would be silently accepted as a future
  // version instead of being rejected.
  if (!isDayString(version)) return;
  // Versions are ISO dates, so a lexicographic compare is a date compare.
  if (version <= LATEST_PROTOCOL_VERSION) return;
  log(
    'warn',
    `[MCP] Client sent protocol version ${version}, which post-dates this SDK; treating it as ${LATEST_PROTOCOL_VERSION}.`
  );
  req.headers['mcp-protocol-version'] = LATEST_PROTOCOL_VERSION;
  // `req.headers` alone is not enough. The Node transport hands the request to
  // Hono's getRequestListener, which rebuilds a Web Request from `rawHeaders`,
  // so a clamp applied only to the parsed headers is silently discarded and the
  // transport still sees the original version.
  const rawHeaders = (req as unknown as { rawHeaders?: string[] }).rawHeaders;
  if (Array.isArray(rawHeaders)) {
    for (let i = 0; i < rawHeaders.length; i += 2) {
      if (rawHeaders[i]?.toLowerCase() === 'mcp-protocol-version') {
        rawHeaders[i + 1] = LATEST_PROTOCOL_VERSION;
        // Exactly one occurrence can reach here: a repeated header would have
        // been comma-joined and rejected by the date check above.
        break;
      }
    }
  }
}

// Per-user cache of the two DB lookups at the top of every MCP request (each
// request builds a fresh McpServer, so tools/list + tools/call each paid a
// timezone query plus the full active-AI-setting fetch just to read one
// profile string). Both change rarely; a settings edit lands within a minute.
const mcpContextCache = new TtlCache<{
  tz: string;
  profile: 'full' | 'core';
}>(60_000);

// Reported to MCP clients; sourced from package.json so it tracks releases.
const SERVER_VERSION = versionService.getAppVersion();

/**
 * Recursively strips keys with null values from an object or array.
 * This is used to normalize optional parameters sent as null by LLM clients
 * (e.g. start_date: null) into undefined (omitted) so they satisfy Zod's .optional() validation.
 */
function stripNulls(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map((item: unknown) =>
      item && typeof item === 'object' ? stripNulls(item) : item
    );
  }
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const clean: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const cleanedVal = obj[key];
      if (cleanedVal !== null) {
        clean[key] =
          cleanedVal && typeof cleanedVal === 'object'
            ? stripNulls(cleanedVal)
            : cleanedVal;
      }
    }
    return clean;
  }
  return val;
}

/**
 * Stateless StreamableHTTP MCP endpoint; auth has already run by here.
 *
 * Scope to authenticatedUserId (the logged-in actor) to match the in-process
 * chat path — not req.userId/activeUserId, which would honor a delegation
 * cookie and silently make MCP act as a delegated user.
 *
 * A fresh McpServer + transport per request: the stateless transport is
 * single-use (its _hasHandledRequest guard throws on reuse).
 */
router.post('/', async (req, res) => {
  try {
    clampFutureProtocolVersion(req);
    const userId = req.authenticatedUserId;
    // The profile is honored verbatim for every service type (unlike chat,
    // which only honors 'core' for self-hosted backends): a user who trimmed
    // their tool surface to 'core' wants the lean 20-tool list in MCP clients
    // too — MCP clients pay the full tool-list cost in their own context
    // window on every call, with no server-side prompt cache to soften it.
    const { tz, profile } = await mcpContextCache.getOrLoad(
      userId,
      async () => {
        const [tz, activeSetting] = await Promise.all([
          loadUserTimezone(userId),
          chatService.getActiveAiServiceSetting(userId, userId),
        ]);
        return {
          tz,
          profile:
            activeSetting?.chat_tool_profile === 'core' ? 'core' : 'full',
        };
      }
    );

    // Normalize null arguments to undefined (omitted) for tools/call requests.
    // This prevents validation errors (MCP -32602) on optional schema fields.
    if (req.body) {
      const requests = Array.isArray(req.body) ? req.body : [req.body];
      for (const r of requests) {
        if (
          r &&
          r.method === 'tools/call' &&
          r.params &&
          typeof r.params === 'object' &&
          'arguments' in r.params &&
          r.params.arguments &&
          typeof r.params.arguments === 'object'
        ) {
          r.params.arguments = stripNulls(r.params.arguments);
        }
      }
    }

    const mcpServer = new McpServer({
      name: 'sparkyfitness-mcp-server',
      version: SERVER_VERSION,
    });
    // McpServer wraps the low-level Server as `.server`.
    mcpServer.server.onerror = (e) => log('error', '[MCP] server error', e);
    registerRegistryTools(mcpServer, userId, tz, profile);
    // Admin-only dev tools, off by default; gating at registration keeps them
    // out of non-admins' tools/list. authenticate already populated req.user.
    const devToolsAllowed =
      process.env.DEV_TOOLS_ENABLED === 'true' &&
      (await resolveIsAdmin(req.user, req.authenticatedUserId));
    if (devToolsAllowed) {
      registerDevTools(mcpServer, userId);
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = (e) => log('error', '[MCP] transport error', e);
    // McpServer.close() tears down its transport too, so don't double-close.
    res.on('close', () => {
      mcpServer.close().catch((e) => log('error', '[MCP] close error', e));
    });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    log('error', '[MCP] /mcp handler error', e);
    if (!res.headersSent) {
      // JSON-RPC error envelope (not a bare {error} object) so compliant MCP
      // clients parse fatal failures instead of choking on the shape.
      // -32603 = JSON-RPC "Internal error".
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

router.get('/', (_req, res) => {
  res.set('Allow', 'POST').status(405).end();
});

router.delete('/', (_req, res) => {
  res.set('Allow', 'POST').status(405).end();
});

export default router;
