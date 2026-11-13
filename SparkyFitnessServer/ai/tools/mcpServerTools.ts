import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type {
  JsonSchemaValidator,
  jsonSchemaValidator,
} from '@modelcontextprotocol/sdk/validation/types.js';
import { jsonSchema, tool, type JSONSchema7, type Tool } from 'ai';
import {
  MCP_SERVER_USER_ID_HEADER,
  MCP_SERVER_TOOL_NAME_MAX_LENGTH,
  mcpServerOptionsSchema,
  type McpServerToolChoice,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getChatMcpServerIds } from '../../models/chatMcpPreferenceRepository.js';
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

// Serialize iteratively because even a rejected server schema may be deeply nested.
export function mcpToolFingerprint(listed: {
  name: string;
  description?: string;
  inputSchema: unknown;
}): string {
  const parts: string[] = [];
  const pending: Array<{ value: unknown } | { text: string }> = [
    { value: listed.inputSchema },
  ];
  while (pending.length) {
    const next = pending.pop();
    if (!next) break;
    if ('text' in next) {
      parts.push(next.text);
    } else if (Array.isArray(next.value)) {
      parts.push('[');
      pending.push({ text: ']' });
      for (let index = next.value.length - 1; index >= 0; index -= 1) {
        pending.push({ value: next.value[index] });
        if (index > 0) pending.push({ text: ',' });
      }
    } else if (typeof next.value === 'object' && next.value !== null) {
      const record = next.value as Record<string, unknown>;
      const keys = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort();
      parts.push('{');
      pending.push({ text: '}' });
      for (let index = keys.length - 1; index >= 0; index -= 1) {
        const key = keys[index]!;
        pending.push({ value: record[key] });
        pending.push({ text: `${JSON.stringify(key)}:` });
        if (index > 0) pending.push({ text: ',' });
      }
    } else {
      parts.push(JSON.stringify(next.value) ?? 'null');
    }
  }
  return createHash('sha256')
    .update(
      JSON.stringify([listed.name, listed.description ?? '', parts.join('')])
    )
    .digest('hex');
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
// No built-in chat tool name starts with this.
const TOOL_NAME_PREFIX = 'mcp_';
const SERVER_SLUG_MAX_LENGTH = 24;
const NAME_HASH_LENGTH = 8;
// For all servers together. OpenAI-style chat refuses a request with more than
// 128 tools, which would fail every chat, and Sparky's own can take 58 of them.
const MAX_OUTSIDE_TOOLS = 40;
// The description is the outside server's text and is sent with every request.
const DESCRIPTION_MAX_LENGTH = 1_024;
// So is the input schema. Sparky's own largest is about 10 KB.
const SCHEMA_MAX_LENGTH = 32_768;
const SCHEMA_MAX_DEPTH = 32;
// Keywords whose value is one schema, a list of them or a map of them: the
// ones the AI SDK's OpenAI adapter walks before a request is sent.
const ONE_SCHEMA = [
  'additionalProperties',
  'additionalItems',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'propertyNames',
];
const SCHEMA_LIST = ['allOf', 'anyOf', 'oneOf'];
const SCHEMA_MAP = ['properties', 'patternProperties', 'definitions', '$defs'];

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
// Checks a schema against JSON Schema's own rules for one, without compiling
// it, so nothing is printed and no format is looked up.
const schemaRules = new Ajv({
  strict: false,
  logger: false,
  validateFormats: false,
});

// The keyword types the walk below and the OpenAI adapter rely on, and the
// only propertyNames that adapter takes.
function keywordsFit(node: Record<string, unknown>): boolean {
  return (
    (node.enum === undefined || Array.isArray(node.enum)) &&
    (node.required === undefined || isStringList(node.required)) &&
    (node.propertyNames === undefined ||
      (isRecord(node.propertyNames) && node.propertyNames.type === 'string')) &&
    (node.dependencies === undefined || isRecord(node.dependencies)) &&
    SCHEMA_LIST.every(
      (key) => node[key] === undefined || Array.isArray(node[key])
    ) &&
    SCHEMA_MAP.every((key) => node[key] === undefined || isRecord(node[key]))
  );
}

type ToolProblem = NonNullable<McpServerToolChoice['problem']>;

const SCHEMA_PROBLEM_TEXT: Record<
  Exclude<ToolProblem, 'name_too_long' | 'name_blank_or_padded'>,
  string
> = {
  not_object: 'does not describe an object',
  too_deep: 'is nested too deeply',
  malformed: 'is malformed',
  unreadable: 'cannot be read',
  too_large: 'is too large',
  contains_token: 'contains the token',
};

// The allowed list stores names trimmed and non-empty, at most the shared
// limit, so a listed name outside that could be ticked but never saved.
function toolNameProblem(name: string): ToolProblem | null {
  if (name.length > MCP_SERVER_TOOL_NAME_MAX_LENGTH) return 'name_too_long';
  if (!name.trim() || name.trim() !== name) return 'name_blank_or_padded';
  return null;
}

// Why a tool's input schema cannot go to the model provider, or null when it
// can. Every allowed tool's schema goes with every chat request, and one the
// provider's adapter cannot walk, or the provider refuses, fails the whole
// request, so such a tool is left out instead. A list with no items is given
// `items: {}` on the way: OpenAI refuses one without, and to JSON Schema the
// two mean the same.
function schemaProblem(
  schema: unknown,
  server: McpServerRow
): Exclude<ToolProblem, 'name_too_long' | 'name_blank_or_padded'> | null {
  if (!isRecord(schema) || schema.type !== 'object') {
    return 'not_object';
  }
  // Walked without recursion, so no schema can run this out of stack.
  const pending: [unknown, number][] = [[schema, 1]];
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [node, depth] = next;
    if (typeof node === 'boolean') continue;
    if (depth > SCHEMA_MAX_DEPTH) return 'too_deep';
    if (!isRecord(node) || !keywordsFit(node)) return 'malformed';
    const types = Array.isArray(node.type) ? node.type : [node.type];
    if (types.includes('array') && node.items === undefined) node.items = {};
    // One at a time: spreading a list this wide as arguments would throw.
    const add = (child: unknown) => pending.push([child, depth + 1]);
    for (const key of ONE_SCHEMA) {
      if (node[key] !== undefined) add(node[key]);
    }
    for (const key of SCHEMA_LIST) {
      if (node[key] !== undefined) (node[key] as unknown[]).forEach(add);
    }
    for (const key of SCHEMA_MAP) {
      if (node[key] !== undefined) {
        Object.values(node[key] as Record<string, unknown>).forEach(add);
      }
    }
    if (Array.isArray(node.items)) node.items.forEach(add);
    else if (node.items !== undefined) add(node.items);
    if (isRecord(node.dependencies)) {
      // A list of property names is not a schema.
      for (const value of Object.values(node.dependencies)) {
        if (!Array.isArray(value)) add(value);
      }
    }
  }
  let text: string;
  try {
    // Keywords that hold data, such as a default, are not walked above.
    text = JSON.stringify(schema);
  } catch {
    return 'unreadable';
  }
  if (text.length > SCHEMA_MAX_LENGTH) return 'too_large';
  const token = server.app_key?.trim();
  if (token && text.includes(JSON.stringify(token).slice(1, -1))) {
    return 'contains_token';
  }
  // The rest of JSON Schema's rules, such as a number where one belongs, by
  // its draft-07 meta-schema whatever $schema names. Keywords added in later
  // drafts are not checked by it. After the size limit: this blocks the
  // server while it runs, and a long enum takes it a while.
  try {
    if (!schemaRules.validateSchema({ ...schema, $schema: undefined })) {
      return 'malformed';
    }
  } catch {
    return 'malformed';
  }
  return null;
}

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

// What went wrong, for the log and the admin, in this app's words only. The
// other side's words stay out: an HTTP error from the transport carries the
// response body, and a server can echo the arguments or the token back in it.
function failureReason(error: unknown): string {
  if (isOutboundUrlBlockedError(error)) return 'refused by the network policy';
  if (error instanceof NoAnswerError) return 'no answer in time';
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

// Every tool the server lists, page by page, except any whose name holds the
// token: a name is shown to the admin and the model as it is, and renaming it
// would leave nothing to call.
async function eachListedTool(
  client: Client,
  server: McpServerRow,
  visit: (listed: {
    name: string;
    description?: string;
    inputSchema: unknown;
  }) => void
): Promise<void> {
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page += 1) {
    const result = await client.listTools(cursor ? { cursor } : undefined, {
      timeout: LIST_TIMEOUT_MS,
    });
    const token = server.app_key?.trim();
    for (const listed of result.tools) {
      if (!token || !listed.name.includes(token)) visit(listed);
    }
    cursor = result.nextCursor;
    if (!cursor) break;
  }
}

async function readAllowedTools(
  client: Client,
  server: McpServerRow,
  allowed: ReadonlyMap<string, string>
): Promise<ListedTool[]> {
  const tools: ListedTool[] = [];
  await eachListedTool(client, server, ({ name, description, inputSchema }) => {
    if (!allowed.has(name)) return;
    if (
      mcpToolFingerprint({ name, description, inputSchema }) !==
      allowed.get(name)
    ) {
      log(
        'warn',
        `MCP tool server ${server.id} (${server.provider_name}): ${name} is left out: it changed since an admin allowed it; an admin has to load the tools again and save`
      );
      return;
    }
    const problem = schemaProblem(inputSchema, server);
    if (problem) {
      log(
        'warn',
        `MCP tool server ${server.id} (${server.provider_name}): ${name} is left out: its input schema ${SCHEMA_PROBLEM_TEXT[problem]}`
      );
      return;
    }
    tools.push({
      name,
      description,
      inputSchema: inputSchema as JSONSchema7,
    });
  });
  return tools;
}

// The list is shared by everyone, so the request never says who is chatting.
// Only the allowed tools are kept, and only those whose input schema can go to
// the model provider. The allowed list is part of the row, so the cache key
// still fits.
async function listServerTools(
  server: McpServerRow,
  endpoint: ProviderFetchEndpoint,
  allowed: ReadonlyMap<string, string>
): Promise<ListedTool[] | null> {
  const key = `${server.id}|${server.updated_at.getTime()}`;
  const cached = listCache.get(key);
  if (cached) return cached;
  if (failedListCache.get(key)) return null;
  try {
    const listed = await withServerClient(
      endpoint,
      authHeaders(server),
      // The client's own time limit is per page, and chat waits for this
      // list, so the whole of it has one limit too.
      (client) =>
        within(LIST_TIMEOUT_MS, readAllowedTools(client, server, allowed))
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
  const allowed = new Map(
    options.data.allowed_tools.map(({ name, fingerprint }) => [
      name,
      fingerprint,
    ])
  );
  if (allowed.size === 0) return [];
  const endpoint = await resolveProviderFetchEndpoint(
    server,
    'MCP tool server'
  );
  if (!endpoint) return [];
  const listed = await listServerTools(server, endpoint, allowed);
  if (!listed) return [];

  const byName = new Map<string, ListedTool>();
  for (const listedTool of listed) {
    if (!byName.has(listedTool.name)) {
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
  return `${TOOL_NAME_PREFIX}${serverSlug(server.provider_name)}__${toolPart}`.slice(
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

// Escape names separately from the body so neither can end the data boundary.
function outsideResult(
  text: string,
  serverName: string,
  toolName: string
): string {
  const attribute = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const body = text.replace(/<\s*\/\s*outside_tool_result/gi, '$&_');
  return `<outside_tool_result server="${attribute(serverName)}" tool="${attribute(toolName)}">\n${body}\n</outside_tool_result>`;
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
  const startedAt = Date.now();
  let outcome: 'ok' | 'error' | 'timeout' | 'refused' = 'refused';
  try {
    // Nothing checks the arguments before this point, and calling the tool
    // with none in their place could do something the model did not ask for.
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return ERRORS.VALIDATION('The arguments must be a JSON object.');
    }
    // Read again at each call: the person may have turned the server off while
    // this turn was running, and nothing goes to it after they have.
    let stillOn: boolean;
    try {
      stillOn = (await getChatMcpServerIds(actorUserId)).includes(server.id);
    } catch (error) {
      log(
        'warn',
        `MCP tool server ${server.id} (${server.provider_name}): could not check the person's choice before ${listed.name}: ${describeError(error)}`
      );
      stillOn = false;
    }
    if (!stillOn) {
      return ERRORS.FORBIDDEN(
        'The user has not turned this server on for chat. Do not retry.'
      );
    }
    outcome = 'error';
    const headers = authHeaders(server);
    if (sendUserId) headers[MCP_SERVER_USER_ID_HEADER] = actorUserId;
    try {
      // Inside the try: arguments nested deeply enough can run this walk out of
      // stack, and that must not make the tool throw.
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
      outcome = result.isError ? 'error' : 'ok';
      return outsideResult(
        result.isError ? toolError('EXTERNAL_TOOL_ERROR', text) : text,
        withoutToken(server.provider_name, server),
        listed.name
      );
    } catch (error) {
      outcome =
        isOutboundUrlBlockedError(error) || abortSignal?.aborted
          ? 'refused'
          : error instanceof NoAnswerError ||
              (error instanceof McpError &&
                error.code === ErrorCode.RequestTimeout)
            ? 'timeout'
            : 'error';
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
  } finally {
    log(
      'info',
      `MCP tool call userId=${actorUserId} serverId=${server.id} tool=${listed.name} durationMs=${Date.now() - startedAt} outcome=${outcome}`
    );
  }
}

function toChatTool(
  outsideTool: OutsideTool,
  { actorUserId }: McpServerToolContext
): Tool {
  const { server, listed } = outsideTool;
  return tool({
    description: withoutToken(
      listed.description?.trim() || `The "${listed.name}" tool.`,
      server
    ).slice(0, DESCRIPTION_MAX_LENGTH),
    inputSchema: jsonSchema(listed.inputSchema),
    execute: async (input: unknown, { abortSignal }) =>
      callServerTool(outsideTool, actorUserId, input, abortSignal),
  });
}

/** Why an admin could not get a server's tool list, in this app's words. */
export class McpServerListError extends Error {
  override name = 'McpServerListError';
}

/**
 * The tools a server lists, for an admin choosing which ones chat may use.
 * Never cached, so a change on the server shows on the next load. A tool chat
 * would leave out for its input schema is still listed, with the reason.
 */
export async function listToolsForAdmin(
  server: McpServerRow
): Promise<McpServerToolChoice[]> {
  const endpoint = await resolveProviderFetchEndpoint(
    server,
    'MCP tool server'
  );
  if (!endpoint) {
    throw new McpServerListError(
      'This server URL is not valid or not allowed.'
    );
  }
  try {
    return await withServerClient(endpoint, authHeaders(server), (client) =>
      within(
        LIST_TIMEOUT_MS,
        (async () => {
          const tools: McpServerToolChoice[] = [];
          await eachListedTool(
            client,
            server,
            ({ name, description, inputSchema }) => {
              tools.push({
                name,
                fingerprint: mcpToolFingerprint({
                  name,
                  description,
                  inputSchema,
                }),
                description: withoutToken(
                  description?.trim() ?? '',
                  server
                ).slice(0, DESCRIPTION_MAX_LENGTH),
                problem:
                  toolNameProblem(name) ?? schemaProblem(inputSchema, server),
              });
            }
          );
          return tools;
        })()
      )
    );
  } catch (error) {
    throw new McpServerListError(
      `The server did not list its tools: ${failureReason(error)}`
    );
  }
}

/** True for the chat name of a tool from an outside MCP server. */
export function isMcpServerToolName(name: string): boolean {
  return name.startsWith(TOOL_NAME_PREFIX);
}

/**
 * The chat tools from the outside MCP servers an admin added, for one turn.
 * Only servers the account owner opted into and tools the admin allowed are
 * returned. Other servers are not contacted. A server that is down, slow or
 * refused is skipped and logged, and chat goes on without it. The result is
 * built fresh for each turn: it closes over the people in `context`, so it
 * must not be cached.
 */
export async function loadMcpServerTools(
  context: McpServerToolContext
): Promise<Record<string, Tool>> {
  // None in a family member's account: Family Access shares the account with a
  // person, not with an outside server, and the owner's choice covers only the
  // owner. Even listing would contact the server and show the model its tools.
  if (context.actorUserId !== context.accountUserId) return {};
  let servers: McpServerRow[];
  try {
    const enabled = new Set(await getChatMcpServerIds(context.accountUserId));
    if (enabled.size === 0) return {};
    servers = (await externalProviderRepository.getActiveMcpServers()).filter(
      (server) => enabled.has(server.id)
    );
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
  const named = [...nameTools(perServer.flat())];
  // Servers come in name order, so the same tools are left out every turn.
  for (const [name, outsideTool] of named.slice(0, MAX_OUTSIDE_TOOLS)) {
    tools[name] = toChatTool(outsideTool, context);
  }
  if (named.length > MAX_OUTSIDE_TOOLS) {
    log(
      'warn',
      `${named.length - MAX_OUTSIDE_TOOLS} MCP server tools are left out: chat takes at most ${MAX_OUTSIDE_TOOLS} from all servers together`
    );
  }
  return tools;
}
