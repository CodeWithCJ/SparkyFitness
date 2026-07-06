import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  registerRegistryTools,
  registerDevTools,
} from '../ai/mcp/mcpAdapter.js';
import { resolveIsAdmin } from '../utils/adminCheck.js';
import versionService from '../services/versionService.js';

const router = express.Router();

// Reported to MCP clients; sourced from package.json so it tracks releases.
const SERVER_VERSION = versionService.getAppVersion();

/**
 * Recursively strips keys with null values from an object or array.
 * This is used to normalize optional parameters sent as null by LLM clients
 * (e.g. start_date: null) into undefined (omitted) so they satisfy Zod's .optional() validation.
 */
function stripNulls(val: any): any {
  if (Array.isArray(val)) {
    return val.map((item) =>
      item && typeof item === 'object' ? stripNulls(item) : item
    );
  }
  if (val && typeof val === 'object') {
    const clean: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      const cleanedVal = val[key];
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
    const userId = req.authenticatedUserId;
    const tz = await loadUserTimezone(userId);

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
    registerRegistryTools(mcpServer, userId, tz);
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
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

export default router;
