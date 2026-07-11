import { vi, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error TS(7016): no types for supertest
import request from 'supertest';
import express from 'express';
// @ts-expect-error TS(7016): no types for cookie-parser
import cookieParser from 'cookie-parser';
import { todayInZone } from '@workspace/shared';
import mcpRoutes from '../routes/mcpRoutes.js';
import { buildChatbotTools } from '../ai/tools/index.js';
import { buildDevTools } from '../ai/tools/devTools.js';
import goalService from '../services/goalService.js';
import userRepository from '../models/userRepository.js';

// buildChatbotTools loads every domain builder; real foodEntryService trips on
// a deep '@workspace/shared' subpath import at load and isn't exercised here.
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
// Dev tools read the app-pool snapshot and a system client; mock the pool layer
// so the suite stays DB-free. getPoolStats returns a fixed snapshot we assert on.
const poolMocks = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  const client = { query, release };
  return {
    query,
    release,
    client,
    getSystemClient: vi.fn(async () => client),
    getClient: vi.fn(async () => client),
    getPoolStats: vi.fn(() => ({
      totalCount: 3,
      idleCount: 2,
      waitingCount: 1,
    })),
    getRawOwnerPool: vi.fn(),
    endPool: vi.fn(),
    resetPool: vi.fn(),
  };
});
vi.mock('../db/poolManager', () => ({
  getSystemClient: poolMocks.getSystemClient,
  getClient: poolMocks.getClient,
  getPoolStats: poolMocks.getPoolStats,
  getRawOwnerPool: poolMocks.getRawOwnerPool,
  endPool: poolMocks.endPool,
  resetPool: poolMocks.resetPool,
  default: {
    getSystemClient: poolMocks.getSystemClient,
    getClient: poolMocks.getClient,
    getPoolStats: poolMocks.getPoolStats,
    getRawOwnerPool: poolMocks.getRawOwnerPool,
    endPool: poolMocks.endPool,
    resetPool: poolMocks.resetPool,
  },
}));

// resolveIsAdmin falls back to userRepository.getUserRole only when req.user has
// no role (the call-time guard, which closes over just a userId). Spy on the real
// repo method so each test controls the resolved role without a DB.
const getUserRoleSpy = vi.spyOn(userRepository, 'getUserRole');

const POOL_STATS = { totalCount: 3, idleCount: 2, waitingCount: 1 };
const DEV_TOOL_NAMES = [
  'sparky_inspect_schema',
  'sparky_get_user_info',
  'sparky_get_db_stats',
];

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

// Drives the route's registration-time admin gate. Tests flip this before a request.
let testUserRole = 'admin';

// Stands in for authMiddleware: valid creds set the user IDs, missing creds
// 401. The route reads authenticatedUserId; set userId too to match production.
// req.user carries the role so resolveIsAdmin resolves without the DB fallback.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeAuthenticate(req: any, res: any, next: any) {
  if (req.headers.authorization === 'Bearer valid') {
    req.authenticatedUserId = TEST_USER;
    req.userId = TEST_USER;
    req.activeUserId = TEST_USER;
    req.user = {
      id: TEST_USER,
      role: testUserRole,
      email: 'mcp-test@example.com',
    };
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
  vi.unstubAllEnvs();
  // Neutralize the super-admin email override so role is the sole admin factor.
  vi.stubEnv('SPARKY_FITNESS_ADMIN_EMAIL', '');
  testUserRole = 'admin';
  // Safe default; tests that exercise the DB fallback set this explicitly.
  getUserRoleSpy.mockResolvedValue('user');
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
      { type: 'text', text: JSON.stringify({ calories: 2000 }) },
    ]);
    // Scoped to the authenticated user; tz resolved to UTC for the today default.
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      TEST_USER,
      todayInZone('UTC'),
      undefined,
      true
    );
  });

  it('tools/call normalizes null values to undefined in arguments', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sparky_get_goal_snapshot',
          arguments: { target_date: null },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.result.content).toEqual([
      { type: 'text', text: JSON.stringify({ calories: 2000 }) },
    ]);
    expect(goalService.getUserGoals).toHaveBeenCalledWith(
      TEST_USER,
      todayInZone('UTC'),
      undefined,
      true
    );
  });

  it('returns a per-action validation error instead of -32602 when a required field is passed as null', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'sparky_manage_goals',
          arguments: {
            action: 'set_goals',
            start_date: null,
            calories: 2000,
          },
        },
      });

    expect(res.status).toBe(200);
    const text = res.body.result.content[0].text;
    expect(text).toContain('Error [VALIDATION]');
    expect(text).toContain('start_date');
    // ERRORS.* strings are flagged so MCP clients can distinguish failures
    // from results without parsing prose.
    expect(res.body.result.isError).toBe(true);
  });

  it('does not flag successful tool results as errors', async () => {
    vi.mocked(goalService.getUserGoals).mockResolvedValue({ calories: 2000 });

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 30,
        method: 'tools/call',
        params: { name: 'sparky_get_goal_snapshot', arguments: {} },
      });

    expect(res.status).toBe(200);
    expect(res.body.result.isError).toBeUndefined();
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

  it('omits dev tools from tools/list when DEV_TOOLS_ENABLED is unset', async () => {
    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({ jsonrpc: '2.0', id: 5, method: 'tools/list' });

    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: { name: string }) => t.name);
    expect(res.body.result.tools).toHaveLength(35);
    for (const devTool of DEV_TOOL_NAMES) {
      expect(names).not.toContain(devTool);
    }
  });

  it('exposes the 3 dev tools to an admin when DEV_TOOLS_ENABLED=true', async () => {
    vi.stubEnv('DEV_TOOLS_ENABLED', 'true');
    testUserRole = 'admin';

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({ jsonrpc: '2.0', id: 6, method: 'tools/list' });

    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: { name: string }) => t.name);
    expect(res.body.result.tools).toHaveLength(38);
    for (const devTool of DEV_TOOL_NAMES) {
      expect(names).toContain(devTool);
    }
  });

  it('gates dev tools out of tools/list for a non-admin even with DEV_TOOLS_ENABLED=true', async () => {
    vi.stubEnv('DEV_TOOLS_ENABLED', 'true');
    testUserRole = 'user';

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({ jsonrpc: '2.0', id: 7, method: 'tools/list' });

    expect(res.status).toBe(200);
    const names = res.body.result.tools.map((t: { name: string }) => t.name);
    expect(res.body.result.tools).toHaveLength(35);
    for (const devTool of DEV_TOOL_NAMES) {
      expect(names).not.toContain(devTool);
    }
  });

  it('tools/call sparky_get_db_stats returns the pool snapshot for an admin', async () => {
    vi.stubEnv('DEV_TOOLS_ENABLED', 'true');
    testUserRole = 'admin';
    // The call-time guard re-checks admin via the DB role (no req.user in scope).
    getUserRoleSpy.mockResolvedValue('admin');

    const res = await request(app)
      .post('/mcp')
      .set(MCP_HEADERS)
      .set('Authorization', 'Bearer valid')
      .send({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'sparky_get_db_stats', arguments: {} },
      });

    expect(res.status).toBe(200);
    expect(res.body.result.content).toEqual([
      {
        type: 'text',
        text: `# Database Pool Stats\n\n${JSON.stringify(POOL_STATS, null, 2)}`,
      },
    ]);
  });
});

// The route never registers dev tools for a non-admin, so a non-admin tools/call
// returns MCP "tool not found" — the call-time guard can't be reached that way.
// Exercise the guard directly on the built tool's execute() instead.
describe('buildDevTools call-time guard', () => {
  // Registry handlers read only rawArgs; a stub satisfies the execute() signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const EXEC_STUB = { toolCallId: 'test', messages: [] } as any;

  it('returns FORBIDDEN when DEV_TOOLS_ENABLED is not true', async () => {
    const tools = buildDevTools(TEST_USER);
    const out = await tools.sparky_get_db_stats.execute!({}, EXEC_STUB);
    expect(out).toContain('Dev tools are disabled');
    expect(getUserRoleSpy).not.toHaveBeenCalled();
  });

  it('returns FORBIDDEN when the caller is not an admin', async () => {
    vi.stubEnv('DEV_TOOLS_ENABLED', 'true');
    getUserRoleSpy.mockResolvedValue('user');

    const tools = buildDevTools(TEST_USER);
    const out = await tools.sparky_get_db_stats.execute!({}, EXEC_STUB);
    expect(out).toContain('Admin access required');
  });

  it('runs the tool when enabled for an admin', async () => {
    vi.stubEnv('DEV_TOOLS_ENABLED', 'true');
    getUserRoleSpy.mockResolvedValue('admin');

    const tools = buildDevTools(TEST_USER);
    const out = await tools.sparky_get_db_stats.execute!({}, EXEC_STUB);
    expect(out).toContain('Database Pool Stats');
    expect(out).toContain('"totalCount": 3');
  });
});
