import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): no types for supertest
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): no types for cookie-parser
import cookieParser from 'cookie-parser';
import { todayInZone } from '@workspace/shared';
import mcpRoutes from '../routes/mcpRoutes.js';
import { buildChatbotTools } from '../ai/tools/index.js';
import goalService from '../services/goalService.js';

// buildChatbotTools composes every domain builder; the real foodEntryService
// trips on a deep '@workspace/shared' subpath import at load time, and the
// registry surface here never executes that tool.
vi.mock('../services/foodEntryService', () => ({ default: {} }));
vi.mock('../config/logging', () => ({ log: vi.fn() }));
// Pin the user's timezone so day-defaults are deterministic and no DB is hit.
vi.mock('../utils/timezoneLoader', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));
// goalService backs the sparky_get_goal_snapshot tools/call case.
vi.mock('../services/goalService', () => ({
  default: { getUserGoals: vi.fn() },
}));

const TEST_USER = 'mcp-test-user';
// StreamableHTTP returns 406 unless Accept lists both content types and 415
// unless Content-Type is application/json.
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

const EXPECTED_TOOL_NAMES = Object.keys(
  buildChatbotTools('user', 'UTC')
).sort();

// Mirrors authMiddleware's contract at the route boundary: valid creds set the
// user IDs and continue; missing creds 401. The route reads authenticatedUserId
// while the (production) global gate and RLS read userId, so set both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeAuthenticate(req: any, res: any, next: any) {
  if (req.headers.authorization === 'Bearer valid') {
    req.authenticatedUserId = TEST_USER;
    req.userId = TEST_USER;
    req.activeUserId = TEST_USER;
    return next();
  }
  return res.status(401).json({ error: 'Authentication required.' });
}

// Same chain shape and order as the /mcp mount in SparkyFitnessServer.ts.
const app = express();
app.use(
  '/mcp',
  express.json({ limit: '1mb' }),
  cookieParser(),
  fakeAuthenticate,
  mcpRoutes
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /mcp', () => {
  it('tools/list returns the full registry tool surface as MCP tools', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

    expect(res.status).toBe(200);
    const tools = res.body.result.tools;
    expect(tools).toHaveLength(35);
    expect(tools.map((t: { name: string }) => t.name).sort()).toEqual(
      EXPECTED_TOOL_NAMES
    );
    for (const t of tools) {
      expect(t.description, `${t.name} description`).toBeTruthy();
      // tool() identity passthrough → bare zod-4 object → JSON-Schema object.
      expect(t.inputSchema.type, `${t.name} inputSchema`).toBe('object');
    }
  });

  it('tools/call dispatches to the registry handler and returns its text', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'sparky_get_goal_snapshot', arguments: {} },
      });

    expect(res.status).toBe(200);
    // Same text the chatbotToolsGoals golden test asserts for this case.
    expect(res.body.result.content).toEqual([
      { type: 'text', text: JSON.stringify({ calories: 2000 }, null, 2) },
    ]);
    // Scoped to the authenticated user; tz resolved to UTC for the today default.
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      TEST_USER,
      todayInZone('UTC')
    );
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/list' });

    expect(res.status).toBe(401);
    expect(goalService.getUserGoals).not.toHaveBeenCalled();
  });

  it('rejects bodies over the route-local 1mb limit with 413', async () => {
    const padding = 'x'.repeat(1024 * 1024 + 100);
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: { padding },
      });

    expect(res.status).toBe(413);
  });
});
