import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Tool } from 'ai';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';
import { loadMcpServerTools } from '../ai/tools/mcpServerTools.js';
import { log } from '../config/logging.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';

vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../models/externalProviderRepository', () => ({
  default: { getActiveMcpServers: vi.fn() },
}));
vi.mock('../utils/adminCheck', () => ({ resolveIsAdminByUserId: vi.fn() }));
// The operator's private-network switches are off, so only an admin's server
// may be on this machine.
vi.mock('../models/globalSettingsRepository', () => ({
  isPrivateNetworkAiAllowed: vi.fn().mockResolvedValue(false),
  isPrivateNetworkFoodProvidersAllowed: vi.fn().mockResolvedValue(false),
}));

// The real check and the real guarded fetch, with the requests it sends counted.
const guarded = vi.hoisted(() => ({ requests: 0 }));
vi.mock('../services/providerEndpoint', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../services/providerEndpoint.js')>();
  return {
    ...actual,
    resolveProviderFetchEndpoint: async (
      ...args: Parameters<typeof actual.resolveProviderFetchEndpoint>
    ) => {
      const endpoint = await actual.resolveProviderFetchEndpoint(...args);
      if (!endpoint) return null;
      const counted: typeof fetch = (input, init) => {
        guarded.requests += 1;
        return endpoint.fetch(input, init);
      };
      return { ...endpoint, fetch: counted };
    },
  };
});

const getServers = vi.mocked(externalProviderRepository.getActiveMcpServers);
const isAdmin = vi.mocked(resolveIsAdminByUserId);

const TOKEN = 't0ken';
const OWN_ACCOUNT = { actorUserId: 'person-1', accountUserId: 'person-1' };
const FAMILY_ACCOUNT = { actorUserId: 'person-1', accountUserId: 'person-2' };

interface SeenRequest {
  path: string;
  method: string;
  /** The JSON-RPC method, for a POST. */
  rpc?: string;
  userId?: string;
  sessionId?: string;
  token?: string;
}

// A real MCP server on this machine, so the tests cover the same client,
// transport and guarded fetch that chat uses.
let server: Server;
let elsewhere: Server;
let origin = '';
let seen: SeenRequest[] = [];
let elsewhereRequests = 0;
let answerWith500 = false;
let goQuiet = false;
let deepSchema = false;
let wentQuiet: () => void = () => undefined;
const sessions = new Map<string, StreamableHTTPServerTransport>();

const text = (value: string) => ({
  content: [{ type: 'text' as const, text: value }],
});

function buildMcpServer(request: IncomingMessage): McpServer {
  const mcp = new McpServer({ name: 'test tools', version: '0.0.1' });
  mcp.registerTool(
    'echo',
    { description: 'Echo text back.', inputSchema: { text: z.string() } },
    async ({ text: value }) => text(`echo: ${value}`)
  );
  mcp.registerTool(
    'whoami',
    { description: 'Report who the server was told is asking.' },
    async () =>
      text(
        JSON.stringify({
          token: request.headers.authorization ?? null,
          user: request.headers['x-sparkyfitness-user-id'] ?? null,
        })
      )
  );
  mcp.registerTool(
    'options',
    {
      description: 'Report the arguments.',
      inputSchema: { a: z.string().optional(), b: z.number().optional() },
    },
    async (args) => text(JSON.stringify(args))
  );
  mcp.registerTool('fail', { description: 'Fail.' }, async () => ({
    isError: true,
    ...text('boom: bad input'),
  }));
  mcp.registerTool(
    'leaky',
    { description: `Repeats ${request.headers.authorization}.` },
    async () => ({
      isError: true,
      ...text(`refused ${request.headers.authorization}`),
    })
  );
  mcp.registerTool('big', { description: 'A long answer.' }, async () =>
    text('x'.repeat(20_000))
  );
  mcp.registerTool(
    'picture',
    { description: 'Words and an image.' },
    async () => ({
      content: [
        { type: 'text' as const, text: 'a picture' },
        { type: 'image' as const, data: 'AAAA', mimeType: 'image/png' },
      ],
    })
  );
  mcp.registerTool('slow', { description: 'Answer late.' }, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5_000).unref());
    return text('late');
  });
  mcp.registerTool('Odd Name.v2', { description: 'An odd name.' }, async () =>
    text('odd')
  );
  const noteFields = {
    // Null means "clear the note"; the tag may only be left out.
    note: z.string().nullable(),
    tag: z.string().optional(),
  };
  mcp.registerTool(
    'set_note',
    {
      description: 'Set or clear a note.',
      inputSchema: {
        ...noteFields,
        entries: z.array(z.object(noteFields)).optional(),
      },
    },
    async (args) => text(JSON.stringify(args))
  );
  mcp.registerTool('wordy', { description: 'w'.repeat(2_000) }, async () =>
    text('wordy')
  );
  mcp.registerTool('hidden', { description: 'Never allowed.' }, async () =>
    text('hidden')
  );
  return mcp;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString('utf8');
  return body ? JSON.parse(body) : undefined;
}

// A field schema nested far deeper than any real server writes one. It goes
// into the reply as text, because JSON.stringify runs out of stack on it.
const DEEP_SCHEMA = `${'{"anyOf":['.repeat(50_000)}{"type":"string"}${']}'.repeat(50_000)}`;

// A server that hands out its tool list one tool per page, which the SDK's own
// server never does: '/paged' has two pages, '/endless' never stops.
function answerPagedList(
  path: string,
  method: string,
  body: unknown,
  response: ServerResponse
): void {
  const rpc = body as
    | {
        id?: number;
        method?: string;
        params?: {
          cursor?: string;
          protocolVersion?: string;
          arguments?: unknown;
        };
      }
    | undefined;
  if (method !== 'POST' || !rpc) {
    response.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  if (rpc.id === undefined) {
    // '/stall' answers the first request of the handshake and then goes quiet.
    if (path === '/stall' || goQuiet) wentQuiet();
    else response.writeHead(202).end();
    return;
  }
  if (rpc.method === 'tools/call') {
    // A call is answered with the arguments the server was sent.
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: rpc.id,
        result: text(JSON.stringify(rpc.params?.arguments)),
      })
    );
    return;
  }
  const page = Number(rpc.params?.cursor ?? '1');
  const result =
    rpc.method === 'initialize'
      ? {
          protocolVersion: rpc.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: 'paged', version: '0.0.1' },
        }
      : {
          tools: [
            {
              name: `page_${page}`,
              description: `The tool on page ${page}.`,
              // The SDK's own schema compiler prints an unknown format and
              // throws on a type it does not know.
              ...(page === 2
                ? {
                    outputSchema: {
                      type: 'object',
                      properties: {
                        a: { type: 'string', format: `Bearer ${TOKEN}` },
                        b: { type: 'nonsense' },
                      },
                    },
                  }
                : {}),
              // A careless schema, which the SDK still accepts.
              inputSchema: {
                type: 'object',
                properties: {
                  choice: { enum: 5 },
                  either: { anyOf: 'string' },
                  nested: { type: 'object', properties: { inner: null } },
                  deep: deepSchema ? 'DEEP_SCHEMA' : {},
                },
              },
            },
          ],
          ...(path === '/endless' || page < 2
            ? { nextCursor: String(page + 1) }
            : {}),
        };
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(
    JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }).replace(
      '"DEEP_SCHEMA"',
      DEEP_SCHEMA
    )
  );
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const path = request.url ?? '';
  const method = request.method ?? '';
  const body = method === 'POST' ? await readJson(request) : undefined;
  const header = (name: string) => {
    const value = request.headers[name];
    return typeof value === 'string' ? value : undefined;
  };
  seen.push({
    path,
    method,
    rpc: (body as { method?: string } | undefined)?.method,
    userId: header('x-sparkyfitness-user-id'),
    sessionId: header('mcp-session-id'),
    token: header('authorization'),
  });

  if (path === '/paged' || path === '/endless' || path === '/stall') {
    answerPagedList(path, method, body, response);
    return;
  }
  if (path === '/moved') {
    const { port } = elsewhere.address() as AddressInfo;
    response.writeHead(307, { Location: `http://127.0.0.1:${port}/mcp` });
    response.end();
    return;
  }
  if (answerWith500 || path === '/broken') {
    // A careless server that repeats what it was sent in its error page.
    response
      .writeHead(500)
      .end(
        JSON.stringify({ sent: body, token: request.headers.authorization })
      );
    return;
  }
  if (path === '/session') {
    const sessionId = header('mcp-session-id');
    let transport = sessionId ? sessions.get(sessionId) : undefined;
    if (!transport) {
      const opened = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, opened);
        },
      });
      await buildMcpServer(request).connect(opened);
      transport = opened;
    }
    await transport.handleRequest(request, response, body);
    return;
  }
  if (method !== 'POST') {
    response.writeHead(405, { Allow: 'POST' }).end();
    return;
  }
  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    response.writeHead(401).end();
    return;
  }
  const mcp = buildMcpServer(request);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  response.on('close', () => void mcp.close());
  await mcp.connect(transport);
  await transport.handleRequest(request, response, body);
}

const listen = (target: Server) =>
  new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
const close = (target: Server) =>
  new Promise<void>((resolve) => {
    target.closeAllConnections();
    target.close(() => resolve());
  });

let rowCount = 0;
function toolServer(
  allowedTools: string[],
  overrides: {
    provider_name?: string;
    path?: string;
    send_user_id?: boolean;
    updated_at?: Date;
    id?: string;
  } = {}
) {
  rowCount += 1;
  return {
    id: overrides.id ?? `server-${rowCount}`,
    user_id: 'admin-1',
    provider_name: overrides.provider_name ?? 'Household tools',
    base_url: `${origin}${overrides.path ?? '/mcp'}`,
    app_key: TOKEN,
    provider_options: {
      allowed_tools: allowedTools,
      send_user_id: overrides.send_user_id ?? false,
    },
    updated_at: overrides.updated_at ?? new Date('2026-11-10T00:00:00Z'),
  };
}

async function run(
  tool: Tool,
  input: unknown = {},
  abortSignal?: AbortSignal
): Promise<string> {
  if (!tool.execute) throw new Error('the tool has no execute');
  return String(
    await tool.execute(input, {
      toolCallId: 'call-1',
      messages: [],
      abortSignal,
    } as never)
  );
}

const calls = (rpc: string) => seen.filter((request) => request.rpc === rpc);

beforeAll(async () => {
  server = createServer((request, response) => {
    handle(request, response).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  elsewhere = createServer((_request, response) => {
    elsewhereRequests += 1;
    response.writeHead(200).end('{}');
  });
  await Promise.all([listen(server), listen(elsewhere)]);
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await Promise.all([close(server), close(elsewhere)]);
});

beforeEach(() => {
  vi.clearAllMocks();
  isAdmin.mockResolvedValue(true);
  seen = [];
  elsewhereRequests = 0;
  answerWith500 = false;
  goQuiet = false;
  deepSchema = false;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('which tools chat gets', () => {
  it('gets none, and asks nothing, when no server was added', async () => {
    getServers.mockResolvedValue([]);
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it('never contacts a server with no allowed tools', async () => {
    getServers.mockResolvedValue([toolServer([])]);
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
    expect(seen).toEqual([]);
  });

  it('gets only the allowed tools, named for their server', async () => {
    getServers.mockResolvedValue([
      toolServer(['whoami', 'echo', 'not on the server']),
    ]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(Object.keys(tools)).toEqual([
      'mcp_household_tools__echo',
      'mcp_household_tools__whoami',
    ]);
    expect(tools.mcp_household_tools__echo.description).toBe('Echo text back.');
    await expect(
      run(tools.mcp_household_tools__echo, { text: 'hi' })
    ).resolves.toBe('echo: hi');
  });

  it('cuts a description to the length it sends with every request', async () => {
    getServers.mockResolvedValue([toolServer(['wordy'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(tools.mcp_household_tools__wordy.description).toHaveLength(1_024);
  });

  it('skips a server whose saved options are not valid', async () => {
    getServers.mockResolvedValue([
      { ...toolServer(['echo']), provider_options: { allowed_tools: 'echo' } },
    ]);
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
    expect(seen).toEqual([]);
  });

  it('keeps going when the servers cannot be looked up', async () => {
    getServers.mockRejectedValue(new Error('database is down'));
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
  });
});

describe('tool names', () => {
  it('keeps a name the model can use and still calls the real tool', async () => {
    getServers.mockResolvedValue([toolServer(['Odd Name.v2'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(Object.keys(tools)).toEqual(['mcp_household_tools__Odd_Name_v2']);
    await expect(run(tools.mcp_household_tools__Odd_Name_v2)).resolves.toBe(
      'odd'
    );
  });

  it('tells two servers with one name apart, whichever loads first', async () => {
    const first = toolServer(['echo'], { provider_name: 'Tools' });
    const second = toolServer(['echo'], { provider_name: 'Tools' });
    getServers.mockResolvedValue([first, second]);
    const names = Object.keys(await loadMcpServerTools(OWN_ACCOUNT));
    expect(names).toHaveLength(2);
    expect(new Set(names).size).toBe(2);
    for (const name of names) {
      expect(name).toMatch(/^mcp_tools__echo_[0-9a-f]{8}$/);
    }

    getServers.mockResolvedValue([second, first]);
    const reversed = Object.keys(await loadMcpServerTools(OWN_ACCOUNT));
    expect([...reversed].sort()).toEqual([...names].sort());
  });

  it('fits a long server name into the length a model accepts', async () => {
    getServers.mockResolvedValue([
      toolServer(['Odd Name.v2', 'echo'], {
        provider_name: 'A very long name for the tools of this household',
      }),
    ]);
    const names = Object.keys(await loadMcpServerTools(OWN_ACCOUNT));
    expect(names).toEqual([
      'mcp_a_very_long_name_for_the__Odd_Name_v2',
      'mcp_a_very_long_name_for_the__echo',
    ]);
    for (const name of names) {
      expect(name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    }
  });
});

describe('what the outside server is told', () => {
  it('sends the token and no user ID unless the admin turned that on', async () => {
    getServers.mockResolvedValue([toolServer(['whoami'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await run(tools.mcp_household_tools__whoami);
    expect(calls('tools/call')).toMatchObject([
      { token: `Bearer ${TOKEN}`, userId: undefined },
    ]);
  });

  it('sends the signed-in person when the admin turned that on', async () => {
    getServers.mockResolvedValue([
      toolServer(['whoami'], { send_user_id: true }),
    ]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(
      JSON.parse(await run(tools.mcp_household_tools__whoami))
    ).toMatchObject({ user: 'person-1' });
  });

  it('never says who is chatting while it lists the tools', async () => {
    getServers.mockResolvedValue([
      toolServer(['whoami'], { send_user_id: true }),
    ]);
    await loadMcpServerTools(OWN_ACCOUNT);
    expect(calls('tools/list')).toHaveLength(1);
    expect(seen.every((request) => request.userId === undefined)).toBe(true);
  });

  it('refuses in a family member’s account when the server is told who is chatting', async () => {
    getServers.mockResolvedValue([
      toolServer(['whoami'], { send_user_id: true }),
    ]);
    const tools = await loadMcpServerTools(FAMILY_ACCOUNT);
    await expect(run(tools.mcp_household_tools__whoami)).resolves.toBe(
      "Error [FORBIDDEN]: This only works in the user's own account, not in a family member's."
    );
    expect(calls('tools/call')).toEqual([]);
  });

  it('still works in a family member’s account when the server is told nothing', async () => {
    getServers.mockResolvedValue([toolServer(['whoami'])]);
    const tools = await loadMcpServerTools(FAMILY_ACCOUNT);
    expect(
      JSON.parse(await run(tools.mcp_household_tools__whoami))
    ).toMatchObject({ user: null });
  });

  it('keeps a null the tool’s schema takes, at any depth', async () => {
    getServers.mockResolvedValue([toolServer(['set_note'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    const sent = await run(tools.mcp_household_tools__set_note, {
      note: null,
      tag: null,
      entries: [{ note: null, tag: null }],
    });
    expect(JSON.parse(sent)).toEqual({
      note: null,
      entries: [{ note: null }],
    });
  });

  it('keeps a null where the tool’s schema cannot be read', async () => {
    getServers.mockResolvedValue([toolServer(['page_1'], { path: '/paged' })]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    const input = { choice: null, either: null, nested: { inner: null } };
    await expect(run(tools.mcp_household_tools__page_1, input)).resolves.toBe(
      JSON.stringify(input)
    );
  });

  it.each([[['hi']], ['hi'], [null]])(
    'refuses arguments that are not an object, without calling the server (%j)',
    async (input) => {
      getServers.mockResolvedValue([toolServer(['whoami'])]);
      const tools = await loadMcpServerTools(OWN_ACCOUNT);
      await expect(run(tools.mcp_household_tools__whoami, input)).resolves.toBe(
        'Error [VALIDATION]: The arguments must be a JSON object.'
      );
      expect(calls('tools/call')).toEqual([]);
    }
  );

  it('drops nulls, which a server refuses for a field that is only optional', async () => {
    getServers.mockResolvedValue([toolServer(['options'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await expect(
      run(tools.mcp_household_tools__options, { a: null, b: 2 })
    ).resolves.toBe('{"b":2}');
  });
});

describe('what chat gets back', () => {
  it('passes on a tool’s own error in the server’s words', async () => {
    getServers.mockResolvedValue([toolServer(['fail'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await expect(run(tools.mcp_household_tools__fail)).resolves.toBe(
      'Error [EXTERNAL_TOOL_ERROR]: boom: bad input'
    );
  });

  it('never hands chat the token the server was sent', async () => {
    getServers.mockResolvedValue([toolServer(['whoami', 'leaky'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(tools.mcp_household_tools__leaky.description).toBe(
      'Repeats Bearer [redacted].'
    );
    await expect(run(tools.mcp_household_tools__leaky)).resolves.toBe(
      'Error [EXTERNAL_TOOL_ERROR]: refused Bearer [redacted]'
    );
    expect(JSON.parse(await run(tools.mcp_household_tools__whoami))).toEqual({
      token: 'Bearer [redacted]',
      user: null,
    });
  });

  it('cuts a long answer and says how to ask for less', async () => {
    getServers.mockResolvedValue([toolServer(['big'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    const result = await run(tools.mcp_household_tools__big);
    expect(result.length).toBeLessThan(8_200);
    expect(result).toContain('cannot be paged here');
  });

  it('counts what is not text instead of passing it on', async () => {
    getServers.mockResolvedValue([toolServer(['picture'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await expect(run(tools.mcp_household_tools__picture)).resolves.toBe(
      'a picture\n\n[1 part of the result left out: chat reads only text from an outside tool.]'
    );
  });

  it('says the tool is unavailable when the server fails, and logs no arguments or token', async () => {
    getServers.mockResolvedValue([toolServer(['echo'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    answerWith500 = true;
    const result = await run(tools.mcp_household_tools__echo, {
      text: 'a private note',
    });
    expect(result).toMatch(
      /^Error \[EXTERNAL_TOOL_UNAVAILABLE\]: The tool server "Household tools" did not answer\./
    );
    expect(result).not.toContain('500');
    const logged = JSON.stringify(vi.mocked(log).mock.calls);
    expect(logged).toContain('echo failed after');
    expect(logged).not.toContain('a private note');
    expect(logged).not.toContain(TOKEN);
  });

  it('says the tool is unavailable, instead of throwing, when its schema is too deep to read', async () => {
    deepSchema = true;
    getServers.mockResolvedValue([toolServer(['page_1'], { path: '/paged' })]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await expect(
      run(tools.mcp_household_tools__page_1, { deep: null })
    ).resolves.toMatch(/^Error \[EXTERNAL_TOOL_UNAVAILABLE\]/);
    expect(calls('tools/call')).toEqual([]);
    expect(JSON.stringify(vi.mocked(log).mock.calls)).toMatch(
      /page_1 failed after \d+ ms: RangeError/
    );
  });

  it('stops waiting when the chat is cancelled', async () => {
    getServers.mockResolvedValue([toolServer(['slow'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    const cancel = new AbortController();
    const startedAt = Date.now();
    setTimeout(() => cancel.abort(), 50);
    await expect(
      run(tools.mcp_household_tools__slow, {}, cancel.signal)
    ).resolves.toMatch(/^Error \[EXTERNAL_TOOL_UNAVAILABLE\]/);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('stops waiting when the chat is cancelled while the server is still connecting', async () => {
    getServers.mockResolvedValue([toolServer(['page_1'], { path: '/paged' })]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    const quiet = new Promise<void>((resolve) => {
      wentQuiet = resolve;
    });
    goQuiet = true;
    const cancel = new AbortController();
    const startedAt = Date.now();
    const answer = run(tools.mcp_household_tools__page_1, {}, cancel.signal);
    await quiet;
    cancel.abort();
    await expect(answer).resolves.toMatch(
      /^Error \[EXTERNAL_TOOL_UNAVAILABLE\]/
    );
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it('sends nothing, and warns of nothing, for a chat that is already cancelled', async () => {
    getServers.mockResolvedValue([toolServer(['echo'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    seen = [];
    vi.mocked(log).mockClear();
    const cancel = new AbortController();
    cancel.abort();
    await expect(
      run(tools.mcp_household_tools__echo, { text: 'hi' }, cancel.signal)
    ).resolves.toMatch(/^Error \[EXTERNAL_TOOL_UNAVAILABLE\]/);
    expect(seen).toEqual([]);
    expect(
      vi.mocked(log).mock.calls.filter(([level]) => level === 'warn')
    ).toEqual([]);
  });

  it('gives a server five seconds to connect and a tool thirty to answer', async () => {
    const connect = vi.spyOn(Client.prototype, 'connect');
    const callTool = vi.spyOn(Client.prototype, 'callTool');
    getServers.mockResolvedValue([toolServer(['echo'])]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await run(tools.mcp_household_tools__echo, { text: 'hi' });
    expect(connect.mock.calls.at(-1)?.[1]).toEqual({ timeout: 5_000 });
    expect(callTool.mock.calls.at(-1)?.[2]).toMatchObject({ timeout: 30_000 });
  });
});

describe('how a server is contacted', () => {
  it('keeps a tool list for the next turn and reads it again after an edit', async () => {
    const row = toolServer(['echo']);
    getServers.mockResolvedValue([row]);
    await loadMcpServerTools(OWN_ACCOUNT);
    await loadMcpServerTools(OWN_ACCOUNT);
    expect(calls('tools/list')).toHaveLength(1);

    getServers.mockResolvedValue([
      { ...row, updated_at: new Date('2026-11-10T00:05:00Z') },
    ]);
    await loadMcpServerTools(OWN_ACCOUNT);
    expect(calls('tools/list')).toHaveLength(2);
  });

  it('leaves a failed server alone for a while and keeps the others', async () => {
    getServers.mockResolvedValue([
      toolServer(['echo'], { provider_name: 'Broken', path: '/broken' }),
      toolServer(['echo']),
    ]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    expect(Object.keys(tools)).toEqual(['mcp_household_tools__echo']);
    const attempts = () =>
      seen.filter((request) => request.path === '/broken').length;
    const afterFirstTurn = attempts();
    expect(afterFirstTurn).toBeGreaterThan(0);

    await loadMcpServerTools(OWN_ACCOUNT);
    expect(attempts()).toBe(afterFirstTurn);

    // The broken server's error page repeats the token; the log does not.
    const logged = JSON.stringify(vi.mocked(log).mock.calls);
    expect(logged).toContain('could not list its tools: HTTP 500');
    expect(logged).not.toContain(TOKEN);
  });

  it('gives up on a server that goes quiet part way through connecting', async () => {
    const quiet = new Promise<void>((resolve) => {
      wentQuiet = resolve;
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getServers.mockResolvedValue([
        toolServer(['page_1'], { provider_name: 'Quiet', path: '/stall' }),
        toolServer(['echo']),
      ]);
      const loading = loadMcpServerTools(OWN_ACCOUNT);
      await quiet;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(Object.keys(await loading)).toEqual(['mcp_household_tools__echo']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reach this machine for a server whose owner is not an admin', async () => {
    isAdmin.mockResolvedValue(false);
    getServers.mockResolvedValue([toolServer(['echo'])]);
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
    expect(seen).toEqual([]);
  });

  it('does not follow a redirect to another host, so the token stays put', async () => {
    getServers.mockResolvedValue([toolServer(['echo'], { path: '/moved' })]);
    await expect(loadMcpServerTools(OWN_ACCOUNT)).resolves.toEqual({});
    expect(seen.some((request) => request.path === '/moved')).toBe(true);
    expect(elsewhereRequests).toBe(0);
  });

  it('sends every request through the guarded fetch', async () => {
    getServers.mockResolvedValue([toolServer(['echo'])]);
    guarded.requests = 0;
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await run(tools.mcp_household_tools__echo, { text: 'hi' });
    expect(seen.length).toBeGreaterThan(0);
    expect(guarded.requests).toBe(seen.length);
  });

  it('keeps a server whose other tools have output schemas the SDK cannot compile, and prints nothing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    getServers.mockResolvedValue([toolServer(['page_1'], { path: '/paged' })]);
    expect(Object.keys(await loadMcpServerTools(OWN_ACCOUNT))).toEqual([
      'mcp_household_tools__page_1',
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('reads every page of a long tool list', async () => {
    getServers.mockResolvedValue([
      toolServer(['page_1', 'page_2'], { path: '/paged' }),
    ]);
    expect(Object.keys(await loadMcpServerTools(OWN_ACCOUNT))).toEqual([
      'mcp_household_tools__page_1',
      'mcp_household_tools__page_2',
    ]);
  });

  it('stops after ten pages of a list that never ends', async () => {
    getServers.mockResolvedValue([
      toolServer(['page_10', 'page_11'], { path: '/endless' }),
    ]);
    expect(Object.keys(await loadMcpServerTools(OWN_ACCOUNT))).toEqual([
      'mcp_household_tools__page_10',
    ]);
    expect(calls('tools/list')).toHaveLength(10);
  });

  it('ends the session of a server that opened one', async () => {
    getServers.mockResolvedValue([toolServer(['echo'], { path: '/session' })]);
    const tools = await loadMcpServerTools(OWN_ACCOUNT);
    await run(tools.mcp_household_tools__echo, { text: 'hi' });
    const opened = new Set(
      seen.flatMap((request) => (request.sessionId ? [request.sessionId] : []))
    );
    const ended = seen
      .filter((request) => request.method === 'DELETE')
      .map((request) => request.sessionId);
    expect(opened.size).toBe(2);
    expect(new Set(ended)).toEqual(opened);
  });
});
