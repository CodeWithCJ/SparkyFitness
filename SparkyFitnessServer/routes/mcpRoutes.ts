import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { registerRegistryTools } from '../ai/mcp/mcpAdapter.js';
import versionService from '../services/versionService.js';

const router = express.Router();

// Reported to MCP clients as the server version; sourced from package.json so
// it tracks releases instead of drifting from a hardcoded literal.
const SERVER_VERSION = versionService.getAppVersion();

/**
 * Stateless StreamableHTTP MCP endpoint. Auth (the global gate plus the
 * route-local chain in SparkyFitnessServer.ts) has already populated
 * req.authenticatedUserId by the time this runs.
 *
 * Scope to authenticatedUserId — the logged-in actor — to match the in-process
 * chat path (chatService builds buildChatbotTools(authenticatedUserId, ...)).
 * Deliberately not req.userId/activeUserId, which would honor a delegation
 * cookie and silently make MCP act as a delegated user.
 *
 * A fresh McpServer + transport is required per request: the stateless
 * transport is single-use (its _hasHandledRequest guard throws on reuse).
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.authenticatedUserId;
    const tz = await loadUserTimezone(userId);
    const mcpServer = new McpServer({
      name: 'sparkyfitness-mcp-server',
      version: SERVER_VERSION,
    });
    // McpServer wraps the low-level Server as `.server`.
    mcpServer.server.onerror = (e) => log('error', '[MCP] server error', e);
    registerRegistryTools(mcpServer, userId, tz);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    transport.onerror = (e) => log('error', '[MCP] transport error', e);
    // Single teardown path: McpServer.close() owns tearing down its transport,
    // so we don't also call transport.close() (double-close). Log the rejection.
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
