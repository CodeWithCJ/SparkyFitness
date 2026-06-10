import undici from 'undici';
import { getDefaultModel, getDefaultVisionModel } from './config.js';

const { Agent } = undici;

/**
 * Shared AI provider-dispatch helper.
 *
 * This is the single place transport-level provider logic lives: the
 * provider->URL ladder, per-provider auth headers, request bodies, the
 * structured-output strategy, per-provider response extraction, and JSON
 * handling. It takes an already-resolved provider config (callers fetch the
 * setting via `chatRepository` and pass it in) and never touches the DB.
 */

export interface ProviderConfig {
  service_type: string;
  api_key?: string;
  model_name?: string;
  custom_url?: string;
  timeout?: number;
}

export interface DispatchImage {
  base64: string;
  mimeType: string;
}

/** A minimal JSON Schema node. */
export interface JsonSchemaNode {
  type?: string;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  additionalProperties?: boolean;
  propertyOrdering?: string[];
  [k: string]: unknown;
}

export interface DispatchRequest {
  provider: ProviderConfig;
  prompt: string;
  /** Presence => vision; selects `getDefaultVisionModel` when `model_name` unset. */
  images?: DispatchImage[];
  /** Presence => structured output requested. */
  jsonSchema?: JsonSchemaNode;
  /** OpenAI `json_schema` name / Anthropic tool name. */
  schemaName?: string;
  /** Unstructured-but-JSON callers (label scan): populate `json` without a schema. */
  parseJson?: boolean;
  /** Forwarded to every provider family; omitted from the request body when unset. */
  temperature?: number;
  /** Default 90_000; Ollama default 120_000 (or `provider.timeout`). */
  timeoutMs?: number;
}

export type DispatchErrorCategory =
  | 'unsupported_provider' // helper has no builder for this service_type (NOT a provider failure)
  | 'api_key_missing' // key required (all but ollama) but absent
  | 'custom_url_missing' // ollama/openai_compatible/custom require custom_url but it's absent/blank
  | 'unsupported_media' // e.g. HEIC sent to a provider that rejects it
  | 'timeout'
  | 'upstream_error' // non-2xx, network failure, non-JSON body
  | 'refused' // explicit provider refusal / safety block
  | 'truncated' // length / max_tokens
  | 'no_content' // empty/blocked response
  | 'parse_error'; // invalid JSON when JSON was requested

export type DispatchResult =
  | { ok: true; text: string; json: unknown | null }
  | {
      ok: false;
      category: DispatchErrorCategory;
      status?: number;
      detail: string;
    };

const DEFAULT_TIMEOUT_MS = 90_000;
const OLLAMA_DEFAULT_TIMEOUT_MS = 120_000;
const ANTHROPIC_MAX_TOKENS = 2048;
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_SCHEMA_NAME = 'structured_output';
const MAX_DETAIL_BODY_CHARS = 500;

type ProviderFamily = 'google' | 'openai' | 'anthropic' | 'ollama';

// Providers whose vision APIs reject HEIC/HEIF (only Gemini accepts them).
// Surfaced as `unsupported_media` so it doesn't masquerade as an opaque 502.
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

// OpenAI-family providers that reliably support strict `response_format.json_schema`.
// Others (openai_compatible/custom) fall back to `json_object` with the schema
// embedded in the prompt, since arbitrary compatible servers may not support it.
const STRICT_SCHEMA_PROVIDERS = new Set([
  'openai',
  'mistral',
  'groq',
  'openrouter',
]);

function providerFamily(serviceType: string): ProviderFamily | null {
  switch (serviceType) {
    case 'google':
      return 'google';
    case 'openai':
    case 'openai_compatible':
    case 'mistral':
    case 'groq':
    case 'openrouter':
    case 'custom':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'ollama':
      return 'ollama';
    default:
      return null;
  }
}

function requiresCustomUrl(serviceType: string): boolean {
  return (
    serviceType === 'ollama' ||
    serviceType === 'openai_compatible' ||
    serviceType === 'custom'
  );
}

// Anthropic's Messages API rejects the non-standard 'image/jpg'; normalize it
// to the canonical 'image/jpeg'. Shared transport concern, so it lives here.
function normalizeMimeType(mimeType: string): string {
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function isBlank(value: string | undefined | null): boolean {
  return !value || value.trim().length === 0;
}

function truncateBody(body: string): string {
  return body.length > MAX_DETAIL_BODY_CHARS
    ? `${body.slice(0, MAX_DETAIL_BODY_CHARS)}…`
    : body;
}

function stripCodeFences(content: string): string {
  return content
    .replace(/^```(?:json)?\n?/, '')
    .replace(/\n?```$/, '')
    .trim();
}

/**
 * Convert a Gemini-shaped schema into a strict-mode JSON Schema accepted by
 * both OpenAI `response_format.json_schema` (strict: true) and Anthropic tool
 * `input_schema` (strict: true). Deep clones, recursively strips
 * `propertyOrdering` (non-standard, rejected in strict mode) and adds
 * `additionalProperties: false` to every object node.
 */
export function toStrictJsonSchema(input: unknown): JsonSchemaNode {
  const clone: JsonSchemaNode = JSON.parse(JSON.stringify(input));
  const walk = (node: JsonSchemaNode): void => {
    if (!node || typeof node !== 'object') return;
    delete node.propertyOrdering;
    if (node.type === 'object') {
      node.additionalProperties = false;
      if (node.properties) {
        for (const child of Object.values(node.properties)) {
          walk(child);
        }
      }
    }
    if (node.items) walk(node.items);
  };
  walk(clone);
  return clone;
}

/**
 * Deep clone a schema and recursively strip `additionalProperties`. Gemini's
 * `responseSchema` is an OpenAPI subset that rejects it; `propertyOrdering`
 * (a Gemini extension) is preserved.
 */
function stripAdditionalProperties(input: JsonSchemaNode): JsonSchemaNode {
  const clone: JsonSchemaNode = JSON.parse(JSON.stringify(input));
  const walk = (node: JsonSchemaNode): void => {
    if (!node || typeof node !== 'object') return;
    delete node.additionalProperties;
    if (node.properties) {
      for (const child of Object.values(node.properties)) {
        walk(child);
      }
    }
    if (node.items) walk(node.items);
  };
  walk(clone);
  return clone;
}

interface BuildContext {
  provider: ProviderConfig;
  model: string;
  prompt: string;
  images: DispatchImage[];
  jsonSchema?: JsonSchemaNode;
  toolName: string;
  temperature?: number;
}

interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function openAiFamilyUrl(provider: ProviderConfig): string {
  switch (provider.service_type) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'openai_compatible':
      return `${provider.custom_url}/chat/completions`;
    case 'mistral':
      return 'https://api.mistral.ai/v1/chat/completions';
    case 'groq':
      return 'https://api.groq.com/openai/v1/chat/completions';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1/chat/completions';
    default:
      // 'custom' uses the user-supplied URL as-is.
      return provider.custom_url as string;
  }
}

function buildGoogleRequest(
  ctx: BuildContext,
  parseJson: boolean
): BuiltRequest {
  const body: Record<string, unknown> = {
    contents: [
      {
        role: 'user',
        parts: [
          ...ctx.images.map((img) => ({
            inline_data: { mime_type: img.mimeType, data: img.base64 },
          })),
          { text: ctx.prompt },
        ],
      },
    ],
  };
  const generationConfig: Record<string, unknown> = {};
  if (ctx.temperature !== undefined) {
    generationConfig.temperature = ctx.temperature;
  }
  if (ctx.jsonSchema || parseJson) {
    generationConfig.responseMimeType = 'application/json';
    if (ctx.jsonSchema) {
      generationConfig.responseSchema = stripAdditionalProperties(
        ctx.jsonSchema
      );
    }
  }
  if (Object.keys(generationConfig).length > 0) {
    body.generationConfig = generationConfig;
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${ctx.model}:generateContent`,
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': ctx.provider.api_key as string,
    },
    body,
  };
}

function buildOpenAiFamilyRequest(ctx: BuildContext): BuiltRequest {
  const useStrictSchema =
    ctx.jsonSchema !== undefined &&
    STRICT_SCHEMA_PROVIDERS.has(ctx.provider.service_type);
  // `json_object` mode only guarantees syntactically valid JSON; the model
  // never sees the schema unless it is in the prompt, so embed it there.
  const prompt =
    ctx.jsonSchema && !useStrictSchema
      ? `${ctx.prompt}\n\nRespond with a single JSON object that conforms to this JSON Schema:\n${JSON.stringify(toStrictJsonSchema(ctx.jsonSchema))}`
      : ctx.prompt;
  const content =
    ctx.images.length > 0
      ? [
          ...ctx.images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
          { type: 'text', text: prompt },
        ]
      : prompt;
  const body: Record<string, unknown> = {
    model: ctx.model,
    messages: [{ role: 'user', content }],
  };
  if (ctx.temperature !== undefined) {
    body.temperature = ctx.temperature;
  }
  if (ctx.jsonSchema) {
    if (useStrictSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: ctx.toolName,
          strict: true,
          schema: toStrictJsonSchema(ctx.jsonSchema),
        },
      };
      // OpenRouter refuses to route to a model lacking structured-output support.
      if (ctx.provider.service_type === 'openrouter') {
        body.provider = { require_parameters: true };
      }
    } else {
      body.response_format = { type: 'json_object' };
    }
  }
  return {
    url: openAiFamilyUrl(ctx.provider),
    headers: {
      'Content-Type': 'application/json',
      ...(ctx.provider.service_type === 'openrouter' && {
        'HTTP-Referer': 'https://sparky-fitness.com',
        'X-Title': 'Sparky Fitness',
      }),
      Authorization: `Bearer ${ctx.provider.api_key}`,
    },
    body,
  };
}

function buildAnthropicRequest(ctx: BuildContext): BuiltRequest {
  const content =
    ctx.images.length > 0
      ? [
          ...ctx.images.map((img) => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType,
              data: img.base64,
            },
          })),
          { type: 'text', text: ctx.prompt },
        ]
      : ctx.prompt;
  const body: Record<string, unknown> = {
    model: ctx.model,
    max_tokens: ANTHROPIC_MAX_TOKENS,
    messages: [{ role: 'user', content }],
  };
  if (ctx.temperature !== undefined) {
    body.temperature = ctx.temperature;
  }
  if (ctx.jsonSchema) {
    body.tools = [
      {
        name: ctx.toolName,
        description: 'Return the structured result via this tool.',
        input_schema: toStrictJsonSchema(ctx.jsonSchema),
        strict: true,
      },
    ];
    body.tool_choice = { type: 'tool', name: ctx.toolName };
  }
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': ANTHROPIC_VERSION,
      'x-api-key': ctx.provider.api_key as string,
    },
    body,
  };
}

function buildOllamaRequest(ctx: BuildContext): BuiltRequest {
  const message: Record<string, unknown> = {
    role: 'user',
    content: ctx.prompt,
  };
  if (ctx.images.length > 0) {
    message.images = ctx.images.map((img) => img.base64);
  }
  const body: Record<string, unknown> = {
    model: ctx.model,
    messages: [message],
    stream: false,
  };
  if (ctx.temperature !== undefined) {
    body.options = { temperature: ctx.temperature };
  }
  if (ctx.jsonSchema) {
    body.format = ctx.jsonSchema;
  }
  return {
    url: `${ctx.provider.custom_url}/api/chat`,
    headers: { 'Content-Type': 'application/json' },
    body,
  };
}

function buildRequest(
  family: ProviderFamily,
  ctx: BuildContext,
  parseJson: boolean
): BuiltRequest {
  switch (family) {
    case 'google':
      return buildGoogleRequest(ctx, parseJson);
    case 'openai':
      return buildOpenAiFamilyRequest(ctx);
    case 'anthropic':
      return buildAnthropicRequest(ctx);
    case 'ollama':
      return buildOllamaRequest(ctx);
  }
}

type ExtractResult =
  | { kind: 'text'; text: string }
  | { kind: 'object'; value: unknown }
  | { kind: 'error'; category: DispatchErrorCategory; detail: string };

function extractGoogle(data: unknown): ExtractResult {
  const d = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const parts = d?.candidates?.[0]?.content?.parts;
  const text = parts?.find((p) => typeof p?.text === 'string')?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      kind: 'error',
      category: 'no_content',
      detail:
        'AI service returned no content (possibly blocked by safety filters).',
    };
  }
  return { kind: 'text', text };
}

function extractOpenAiFamily(data: unknown): ExtractResult {
  const d = data as {
    choices?: Array<{
      finish_reason?: string;
      message?: { content?: unknown; refusal?: unknown };
    }>;
  };
  const choice = d?.choices?.[0];
  const message = choice?.message;
  if (message?.refusal) {
    return {
      kind: 'error',
      category: 'refused',
      detail: 'AI service refused the request.',
    };
  }
  const finishReason = choice?.finish_reason;
  if (finishReason === 'content_filter') {
    return {
      kind: 'error',
      category: 'refused',
      detail: 'AI service blocked the response by content filter.',
    };
  }
  if (finishReason === 'length') {
    return {
      kind: 'error',
      category: 'truncated',
      detail: 'AI service truncated the response (finish_reason: length).',
    };
  }
  const content = message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    return {
      kind: 'error',
      category: 'no_content',
      detail: 'AI service returned no content.',
    };
  }
  return { kind: 'text', text: content };
}

function extractAnthropic(
  data: unknown,
  hasSchema: boolean,
  toolName: string
): ExtractResult {
  const d = data as {
    stop_reason?: string;
    content?: Array<{
      type?: string;
      name?: string;
      input?: unknown;
      text?: string;
    }>;
  };
  const stopReason = d?.stop_reason;
  if (stopReason === 'refusal') {
    return {
      kind: 'error',
      category: 'refused',
      detail: 'AI service refused the request.',
    };
  }
  if (stopReason === 'max_tokens') {
    return {
      kind: 'error',
      category: 'truncated',
      detail: 'AI service truncated the response (stop_reason: max_tokens).',
    };
  }
  if (hasSchema) {
    const toolUseBlock = d?.content?.find(
      (block) => block?.type === 'tool_use' && block?.name === toolName
    );
    if (stopReason === 'tool_use') {
      if (
        !toolUseBlock ||
        typeof toolUseBlock.input !== 'object' ||
        toolUseBlock.input === null
      ) {
        return {
          kind: 'error',
          category: 'upstream_error',
          detail: 'AI service returned a malformed tool_use block.',
        };
      }
      // tool_use input arrives already parsed as an object; pass it through
      // verbatim rather than re-stringifying then re-parsing.
      return { kind: 'object', value: toolUseBlock.input };
    }
    if (stopReason === 'end_turn') {
      return {
        kind: 'error',
        category: 'no_content',
        detail: 'AI service returned no tool call (likely safety-blocked).',
      };
    }
    return {
      kind: 'error',
      category: 'upstream_error',
      detail: `AI service returned unexpected stop_reason '${stopReason ?? '<missing>'}'.`,
    };
  }
  const text = d?.content?.find(
    (block) => typeof block?.text === 'string'
  )?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      kind: 'error',
      category: 'no_content',
      detail: 'AI service returned no content.',
    };
  }
  return { kind: 'text', text };
}

function extractOllama(data: unknown): ExtractResult {
  const d = data as { message?: { content?: unknown } };
  const content = d?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    return {
      kind: 'error',
      category: 'no_content',
      detail: 'AI service returned no content.',
    };
  }
  return { kind: 'text', text: content };
}

function extractResponse(
  family: ProviderFamily,
  data: unknown,
  hasSchema: boolean,
  toolName: string
): ExtractResult {
  switch (family) {
    case 'google':
      return extractGoogle(data);
    case 'openai':
      return extractOpenAiFamily(data);
    case 'anthropic':
      return extractAnthropic(data, hasSchema, toolName);
    case 'ollama':
      return extractOllama(data);
  }
}

type HttpOutcome = { data: unknown } | { error: DispatchResult };

function timeoutError(): DispatchResult {
  return {
    ok: false,
    category: 'timeout',
    detail: 'AI service did not respond before the timeout.',
  };
}

async function readResponse(response: Response): Promise<HttpOutcome> {
  if (!response.ok) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      // best-effort; body stays empty
    }
    return {
      error: {
        ok: false,
        category: 'upstream_error',
        status: response.status,
        detail: `AI service returned status ${response.status}${
          body ? `: ${truncateBody(body)}` : ''
        }`,
      },
    };
  }
  try {
    return { data: await response.json() };
  } catch {
    return {
      error: {
        ok: false,
        category: 'upstream_error',
        detail: 'AI service returned a non-JSON response.',
      },
    };
  }
}

async function performFetch(
  built: BuiltRequest,
  timeoutMs: number
): Promise<HttpOutcome> {
  let response: Response;
  try {
    response = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      return { error: timeoutError() };
    }
    return {
      error: {
        ok: false,
        category: 'upstream_error',
        detail: `Failed to reach the AI service: ${(error as Error)?.message ?? 'unknown error'}`,
      },
    };
  }
  return readResponse(response);
}

async function performOllama(
  built: BuiltRequest,
  timeoutMs: number
): Promise<HttpOutcome> {
  // The undici Agent carries the long header/body timeouts Ollama needs; it is
  // passed via the non-standard `dispatcher` fetch option (not in DOM types).
  const agent = new Agent({
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  try {
    let response: Response;
    try {
      response = await fetch(built.url, {
        method: 'POST',
        headers: built.headers,
        body: JSON.stringify(built.body),
        // @ts-expect-error undici dispatcher option is not in fetch DOM types
        dispatcher: agent,
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === 'HeadersTimeoutError' || name === 'BodyTimeoutError') {
        return { error: timeoutError() };
      }
      return {
        error: {
          ok: false,
          category: 'upstream_error',
          detail: `Failed to reach the AI service: ${(error as Error)?.message ?? 'unknown error'}`,
        },
      };
    }
    // Read the body before destroying the agent — destroying first can abort an
    // in-flight body stream.
    return await readResponse(response);
  } finally {
    agent.destroy();
  }
}

function resolveTimeout(req: DispatchRequest, family: ProviderFamily): number {
  if (typeof req.timeoutMs === 'number') return req.timeoutMs;
  if (family === 'ollama') {
    return req.provider.timeout ?? OLLAMA_DEFAULT_TIMEOUT_MS;
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Dispatch a single request to a user-configured AI provider and return a
 * normalized result. Attempts any `service_type` it has a builder for and
 * fails gracefully — no provider allow-list. Final domain validation (Zod)
 * stays with the caller.
 */
export async function dispatchAiRequest(
  req: DispatchRequest
): Promise<DispatchResult> {
  const { provider, prompt, jsonSchema, schemaName, parseJson } = req;
  const serviceType = provider.service_type;

  const family = providerFamily(serviceType);
  if (!family) {
    return {
      ok: false,
      category: 'unsupported_provider',
      detail: `No dispatcher for AI service type '${serviceType}'.`,
    };
  }

  if (serviceType !== 'ollama' && !provider.api_key) {
    return {
      ok: false,
      category: 'api_key_missing',
      detail: `API key missing for AI service type '${serviceType}'.`,
    };
  }

  if (requiresCustomUrl(serviceType) && isBlank(provider.custom_url)) {
    return {
      ok: false,
      category: 'custom_url_missing',
      detail: `A custom URL is required for AI service type '${serviceType}'.`,
    };
  }

  const images = (req.images ?? []).map((img) => ({
    base64: img.base64,
    mimeType: normalizeMimeType(img.mimeType),
  }));
  const hasImages = images.length > 0;

  if (
    serviceType !== 'google' &&
    images.some((img) => HEIC_MIME_TYPES.has(img.mimeType))
  ) {
    return {
      ok: false,
      category: 'unsupported_media',
      detail: `AI service type '${serviceType}' does not support HEIC/HEIF images. Use JPEG, PNG, or WebP.`,
    };
  }

  const model =
    provider.model_name ||
    (hasImages
      ? getDefaultVisionModel(serviceType)
      : getDefaultModel(serviceType));

  const toolName = schemaName ?? DEFAULT_SCHEMA_NAME;
  const built = buildRequest(
    family,
    {
      provider,
      model,
      prompt,
      images,
      jsonSchema,
      toolName,
      temperature: req.temperature,
    },
    Boolean(parseJson)
  );

  const timeoutMs = resolveTimeout(req, family);
  const outcome =
    family === 'ollama'
      ? await performOllama(built, timeoutMs)
      : await performFetch(built, timeoutMs);

  if ('error' in outcome) {
    return outcome.error;
  }

  const extracted = extractResponse(
    family,
    outcome.data,
    Boolean(jsonSchema),
    toolName
  );

  if (extracted.kind === 'error') {
    return {
      ok: false,
      category: extracted.category,
      detail: extracted.detail,
    };
  }

  if (extracted.kind === 'object') {
    return {
      ok: true,
      text: JSON.stringify(extracted.value),
      json: extracted.value,
    };
  }

  const wantsJson = Boolean(jsonSchema) || Boolean(parseJson);
  if (!wantsJson) {
    return { ok: true, text: extracted.text, json: null };
  }

  try {
    const json = JSON.parse(stripCodeFences(extracted.text));
    return { ok: true, text: extracted.text, json };
  } catch {
    return {
      ok: false,
      category: 'parse_error',
      detail: 'AI service returned invalid JSON.',
    };
  }
}

export default {
  dispatchAiRequest,
  toStrictJsonSchema,
};
