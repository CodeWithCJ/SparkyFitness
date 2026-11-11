import { createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import type {
  JsonSchemaValidator,
  jsonSchemaValidator,
} from '@modelcontextprotocol/sdk/validation/types.js';
import { jsonSchema, tool, type JSONSchema7, type Tool } from 'ai';
import {
  MCP_SERVER_USER_ID_HEADER,
  mcpServerOptionsSchema,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import externalProviderRepository, {
  type McpServerRow,
} from '../../models/externalProviderRepository.js';
import {
  resolveProviderFetchEndpoint,
  type ProviderFetchEndpoint,
} from '../../services/providerEndpoint.js';
import { describeError } from '../../utils/errors.js';
import { isOutboundUrlBlockedError } from '../../utils/outboundUrlPolicy.js';
import { TtlCache } from '../../utils/ttlCache.js';
import { ERRORS, toolError } from './errors.js';
import { truncateIfNeeded } from './truncation.js';

/** Who one chat turn's outside tools are built for. */
export interface McpServerToolContext {
  /** The signed-in person. Theirs is the only ID an outside server is sent. */
  actorUserId: string;
  /** The account chat is working in: a family member's after a switch. */
  accountUserId: string;
}

interface ListedTool {
  name: string;
  description?: string;
  inputSchema: JSONSchema7;
}

interface OutsideTool {
  server: McpServerRow;
  endpoint: ProviderFetchEndpoint;
  sendUserId: boolean;
  listed: ListedTool;
}

// Bounds on one server, so a slow or broken one cannot hold up a chat turn.
const CONNECT_TIMEOUT_MS = 5_000;
const LIST_TIMEOUT_MS = 5_000;
const CALL_TIMEOUT_MS = 30_000;
const END_SESSION_TIMEOUT_MS = 2_000;
const MAX_LIST_PAGES = 10;

// A server's tool list is the same for everyone, so it is kept for a minute
// instead of being fetched on every turn. A server that failed is left alone
// for a shorter time, so a dead one costs one wait rather than one per turn.
// Both are keyed on the row's last edit, so an admin's change applies at once.
const LIST_TTL_MS = 60_000;
const FAILED_LIST_TTL_MS = 15_000;
const listCache = new TtlCache<ListedTool[]>(LIST_TTL_MS, 100);
const failedListCache = new TtlCache<true>(FAILED_LIST_TTL_MS, 100);

// The strictest naming rule among the model providers: letters, digits, _ and
// -, 64 characters at most.
const TOOL_NAME_MAX_LENGTH = 64;
const SERVER_SLUG_MAX_LENGTH = 24;
const NAME_HASH_LENGTH = 8;
// The description is the outside server's text and is sent with every request.
const DESCRIPTION_MAX_LENGTH = 1_024;

const TRUNCATION_HINT =
  'The result came from an outside tool server and cannot be paged here. If the tool takes a filter or a limit, call it again asking for less.';

function authHeaders(server: McpServerRow): Record<string, string> {
  const token = server.app_key?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// A server that repeats its token must not pass it to the person chatting, who
// could then call the server directly, past the tools the admin allowed.
function withoutToken(text: string, server: McpServerRow): string {
  const token = server.app_key?.trim();
  return token ? text.replaceAll(token, '[redacted]') : text;
}

// Chat reads only the text of a result, so no output schema is compiled. The
// SDK's own compiler prints parts of a schema to the console, and throws on a
// broken one, which would drop every tool the server offers.
const skipOutputSchemas: jsonSchemaValidator = {
  getValidator<T>(): JsonSchemaValidator<T> {
    return (input) => ({
      valid: true,
      data: input as T,
      errorMessage: undefined,
    });
  },
};

class NoAnswerError extends Error {
  override name = 'NoAnswerError';
}

// Rejects when `work` takes longer than `ms`, or when the chat is cancelled
// first. The work itself is stopped by the caller closing the transport.
async function within<T>(
  ms: number,
  work: Promise<T>,
  cancelled?: AbortSignal
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let onCancel: (() => void) | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new NoAnswerError()), ms);
        onCancel = () => reject(cancelled?.reason);
        cancelled?.addEventListener('abort', onCancel, { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onCancel) cancelled?.removeEventListener('abort', onCancel);
  }
}

// What went wrong, for the log, in this app's words only. The other side's
// words stay out: an HTTP error from the transport carries the response body,
// and a server can echo the arguments or the token back in it.
function failureReason(error: unknown): string {
  if (isOutboundUrlBlockedError(error)) return 'refused by the network policy';
  if (error instanceof StreamableHTTPError) return `HTTP ${error.code}`;
  if (error instanceof McpError) return `MCP error ${error.code}`;
  if (!(error instanceof Error)) return 'unknown error';
  const cause = error.cause as { code?: unknown } | undefined;
  return typeof cause?.code === 'string'
    ? `${error.name} (${cause.code})`
    : error.name;
}

// A server that opened a session keeps it until it hears the client is done.
// The wait is bounded because the tool's answer is already in hand.
async function endSession(
  transport: StreamableHTTPClientTransport
): Promise<void> {
  if (transport.sessionId) {
    await within(END_SESSION_TIMEOUT_MS, transport.terminateSession()).catch(
      () => undefined
    );
  }
  await transport.close().catch(() => undefined);
}

// One connection per request: nothing is shared between people or turns, and
// a server that redirects to another host is refused by the client itself, so
// the token never follows a redirect.
async function withServerClient<T>(
  endpoint: ProviderFetchEndpoint,
  headers: Record<string, string>,
  run: (client: Client) => Promise<T>,
  cancelled?: AbortSignal
): Promise<T> {
  // A chat that is already cancelled sends nothing, not even the token.
  cancelled?.throwIfAborted();
  const client = new Client(
    { name: 'SparkyFitness', version: '1.0.0' },
    { capabilities: {}, jsonSchemaValidator: skipOutputSchemas }
  );
  const transport = new StreamableHTTPClientTransport(new URL(endpoint.url), {
    fetch: endpoint.fetch,
    requestInit: { headers },
  });
  try {
    // The client's own time limit covers its first request only, so a server
    // that goes quiet later in the handshake needs a limit on the whole of it.
    await within(
      CONNECT_TIMEOUT_MS,
      client.connect(transport, { timeout: CONNECT_TIMEOUT_MS }),
      cancelled
    );
    return await run(client);
  } finally {
    await endSession(transport);
  }
}

// The list is shared by everyone, so the request never says who is chatting.
async function listServerTools(
  server: McpServerRow,
  endpoint: ProviderFetchEndpoint
): Promise<ListedTool[] | null> {
  const key = `${server.id}|${server.updated_at.getTime()}`;
  const cached = listCache.get(key);
  if (cached) return cached;
  if (failedListCache.get(key)) return null;
  try {
    const listed = await withServerClient(
      endpoint,
      authHeaders(server),
      async (client) => {
        const tools: ListedTool[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
          const result = await client.listTools(
            cursor ? { cursor } : undefined,
            { timeout: LIST_TIMEOUT_MS }
          );
          for (const { name, description, inputSchema } of result.tools) {
            tools.push({
              name,
              description,
              inputSchema: inputSchema as JSONSchema7,
            });
          }
          cursor = result.nextCursor;
          if (!cursor) break;
        }
        return tools;
      }
    );
    listCache.set(key, listed);
    return listed;
  } catch (error) {
    failedListCache.set(key, true);
    log(
      'warn',
      `MCP tool server ${server.id} (${server.provider_name}) could not list its tools: ${failureReason(error)}`
    );
    return null;
  }
}

// The tools of one server that the admin allowed. Nothing allowed means the
// server is never contacted.
async function allowedServerTools(
  server: McpServerRow
): Promise<OutsideTool[]> {
  const options = mcpServerOptionsSchema.safeParse(server.provider_options);
  if (!options.success) {
    log(
      'warn',
      `MCP tool server ${server.id} (${server.provider_name}) is skipped: its saved options are not valid`
    );
    return [];
  }
  const allowed = new Set(options.data.allowed_tools);
  if (allowed.size === 0) return [];
  const endpoint = await resolveProviderFetchEndpoint(
    server,
    'MCP tool server'
  );
  if (!endpoint) return [];
  const listed = await listServerTools(server, endpoint);
  if (!listed) return [];

  const byName = new Map<string, ListedTool>();
  for (const listedTool of listed) {
    if (allowed.has(listedTool.name) && !byName.has(listedTool.name)) {
      byName.set(listedTool.name, listedTool);
    }
  }
  return [...byName.values()]
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((listedTool) => ({
      server,
      endpoint,
      sendUserId: options.data.send_user_id,
      listed: listedTool,
    }));
}

function serverSlug(providerName: string): string {
  const slug = providerName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+/, '')
    .slice(0, SERVER_SLUG_MAX_LENGTH)
    .replace(/_+$/, '');
  return slug || 'server';
}

function plainToolName({ server, listed }: OutsideTool): string {
  const toolPart = listed.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `mcp_${serverSlug(server.provider_name)}__${toolPart}`.slice(
    0,
    TOOL_NAME_MAX_LENGTH
  );
}

// Model-facing names. When two tools would get the same name (two servers
// with one name, or names that differ only in characters a model cannot use),
// each takes a suffix made from its own server row and real tool name, so no
// name depends on which tool was loaded first.
function nameTools(outsideTools: OutsideTool[]): Map<string, OutsideTool> {
  const uses = new Map<string, number>();
  for (const outsideTool of outsideTools) {
    const plain = plainToolName(outsideTool);
    uses.set(plain, (uses.get(plain) ?? 0) + 1);
  }
  const named = new Map<string, OutsideTool>();
  for (const outsideTool of outsideTools) {
    const { server, listed } = outsideTool;
    const plain = plainToolName(outsideTool);
    let name = plain;
    if (uses.get(plain) !== 1) {
      const hash = createHash('sha256')
        .update(`${server.id}\n${listed.name}`)
        .digest('hex')
        .slice(0, NAME_HASH_LENGTH);
      name = `${plain.slice(0, TOOL_NAME_MAX_LENGTH - NAME_HASH_LENGTH - 1)}_${hash}`;
    }
    if (named.has(name)) {
      log(
        'warn',
        `MCP tool server ${server.id} (${server.provider_name}): ${listed.name} is left out, its chat name is already taken`
      );
      continue;
    }
    named.set(name, outsideTool);
  }
  return named;
}

// Chat reads text. Anything else an outside tool returns is counted rather
// than passed on, so the model knows something was left out.
function resultText(result: {
  content?: unknown;
  structuredContent?: unknown;
  toolResult?: unknown;
}): string {
  const parts: { type?: unknown; text?: unknown }[] = Array.isArray(
    result.content
  )
    ? result.content
    : [];
  const texts: string[] = [];
  let leftOut = 0;
  for (const part of parts) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      texts.push(part.text);
    } else {
      leftOut += 1;
    }
  }
  let text = texts.join('\n').trim();
  if (!text) {
    const data = result.structuredContent ?? result.toolResult;
    if (data !== undefined) text = JSON.stringify(data);
  }
  if (leftOut > 0) {
    const note = `[${leftOut} part${leftOut === 1 ? '' : 's'} of the result left out: chat reads only text from an outside tool.]`;
    text = text ? `${text}\n\n${note}` : note;
  }
  return text || 'The tool returned nothing.';
}

type SchemaNode = NonNullable<JSONSchema7['properties']>[string] | undefined;

// True when the schema plainly leaves null out. Anything this cannot read,
// such as a $ref, an empty schema or one the server got wrong, counts as
// allowing it.
function refusesNull(schema: SchemaNode): boolean {
  if (!schema || typeof schema !== 'object') return false;
  if ((schema as { nullable?: unknown }).nullable === true) return false;
  if (schema.const !== undefined) return schema.const !== null;
  if (schema.enum !== undefined) {
    return Array.isArray(schema.enum) && !schema.enum.includes(null);
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    return !types.includes('null');
  }
  const branches = schema.anyOf ?? schema.oneOf;
  return (
    Array.isArray(branches) &&
    branches.length > 0 &&
    branches.every(refusesNull)
  );
}

// A model often sends null for a field it means to leave out, and a server
// that only marks the field optional refuses that. A null is dropped only
// where the tool's own schema leaves null out, so a tool that takes null (to
// clear a value, say) still gets it.
function dropRefusedNulls(value: unknown, schema: SchemaNode): unknown {
  const node = typeof schema === 'object' ? schema : undefined;
  if (Array.isArray(value)) {
    const items = Array.isArray(node?.items) ? undefined : node?.items;
    return value.map((item) => dropRefusedNulls(item, items));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const property = node?.properties?.[key];
      if (val === null && refusesNull(property)) continue;
      out[key] = dropRefusedNulls(val, property);
    }
    return out;
  }
  return value;
}

async function callServerTool(
  { server, endpoint, sendUserId, listed }: OutsideTool,
  actorUserId: string,
  input: unknown,
  abortSignal: AbortSignal | undefined
): Promise<string> {
  // Nothing checks the arguments before this point, and calling the tool
  // with none in their place could do something the model did not ask for.
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return ERRORS.VALIDATION('The arguments must be a JSON object.');
  }
  const headers = authHeaders(server);
  if (sendUserId) headers[MCP_SERVER_USER_ID_HEADER] = actorUserId;
  const startedAt = Date.now();
  try {
    // Inside the try: the server's own schema steers this walk, and one deep
    // enough to run out of stack must not make the tool throw.
    const args = dropRefusedNulls(input, listed.inputSchema) as Record<
      string,
      unknown
    >;
    // Never retried: the call may have changed something on the other side.
    const result = await withServerClient(
      endpoint,
      headers,
      (client) =>
        client.callTool({ name: listed.name, arguments: args }, undefined, {
          timeout: CALL_TIMEOUT_MS,
          signal: abortSignal,
        }),
      abortSignal
    );
    log(
      'debug',
      `MCP tool server ${server.id}: ${listed.name} answered in ${Date.now() - startedAt} ms`
    );
    const text = truncateIfNeeded(
      withoutToken(resultText(result), server),
      TRUNCATION_HINT
    );
    return result.isError ? toolError('EXTERNAL_TOOL_ERROR', text) : text;
  } catch (error) {
    // The arguments stay out of the log: they can hold health data. A
    // cancelled chat is not the server's failure, so it is not a warning.
    log(
      abortSignal?.aborted ? 'debug' : 'warn',
      `MCP tool server ${server.id} (${server.provider_name}): ${listed.name} failed after ${Date.now() - startedAt} ms: ${failureReason(error)}`
    );
    return toolError(
      'EXTERNAL_TOOL_UNAVAILABLE',
      `The tool server "${server.provider_name}" did not answer.`,
      'Tell the user this outside tool is not available right now. Do NOT call it again in this reply.'
    );
  }
}

function toChatTool(
  outsideTool: OutsideTool,
  { actorUserId, accountUserId }: McpServerToolContext
): Tool {
  const { server, listed, sendUserId } = outsideTool;
  // An outside server is not bound by Family Access: it trusts the ID it is
  // sent. So a tool that is told who is chatting works in that person's own
  // account only.
  const ownAccountOnly = sendUserId && actorUserId !== accountUserId;
  return tool({
    description: withoutToken(
      listed.description?.trim() || `The "${listed.name}" tool.`,
      server
    ).slice(0, DESCRIPTION_MAX_LENGTH),
    inputSchema: jsonSchema(listed.inputSchema),
    execute: async (input: unknown, { abortSignal }) =>
      ownAccountOnly
        ? ERRORS.OWN_ACCOUNT_ONLY()
        : callServerTool(outsideTool, actorUserId, input, abortSignal),
  });
}

/**
 * The chat tools from the outside MCP servers an admin added, for one turn.
 * Only the tools the admin allowed are returned, and a server with none
 * allowed is not contacted. A server that is down, slow or refused is skipped
 * and logged, and chat goes on without it. The result is built fresh for each
 * turn: it closes over the people in `context`, so it must not be cached.
 */
export async function loadMcpServerTools(
  context: McpServerToolContext
): Promise<Record<string, Tool>> {
  let servers: McpServerRow[];
  try {
    servers = await externalProviderRepository.getActiveMcpServers();
  } catch (error) {
    log('warn', `Could not look up MCP tool servers: ${describeError(error)}`);
    return {};
  }
  if (servers.length === 0) return {};

  const perServer = await Promise.all(
    servers.map(async (server) => {
      try {
        return await allowedServerTools(server);
      } catch (error) {
        log(
          'warn',
          `MCP tool server ${server.id} (${server.provider_name}) is skipped: ${failureReason(error)}`
        );
        return [];
      }
    })
  );
  const tools: Record<string, Tool> = {};
  for (const [name, outsideTool] of nameTools(perServer.flat())) {
    tools[name] = toChatTool(outsideTool, context);
  }
  return tools;
}
