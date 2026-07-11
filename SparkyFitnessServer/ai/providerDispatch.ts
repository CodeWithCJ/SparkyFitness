import undici from 'undici';
import convert from 'heic-convert';
import { log } from '../config/logging.js';
import { getDefaultModel, getDefaultVisionModel } from './config.js';
import {
  createGuardedDispatcher,
  createGuardedFetch,
  assertOutboundUrlShapeAndLiteralAllowed,
  getOutboundUrlBlockedError,
  OutboundUrlShapeError,
  PUBLIC_ONLY_AI_NETWORK_POLICY,
  requiresUserSuppliedAiUrl,
  type AiNetworkPolicy,
} from '../utils/outboundUrlPolicy.js';

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
  networkPolicy?: AiNetworkPolicy;
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
  | 'private_network_forbidden' // custom URL resolved to a blocked internal/private address
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

const MAX_FETCH_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Gemini embeds the wait time in the error body: "Please retry in 11.69562819s"
function parseRetryAfterMs(body: string): number | null {
  const match = body.match(/retry in (\d+(?:\.\d+)?)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 500;
  }
  return null;
}

type ProviderFamily = 'google' | 'openai' | 'anthropic' | 'ollama';

// iPhones default to HEIC/HEIF, and provider support for it is inconsistent and
// shifts as providers and models change. Rather than track which providers
// accept it, we transcode HEIC/HEIF to JPEG for every provider (see
// normalizeImagesForDispatch), which they all accept, so uploads "just work"
// regardless of provider or client; only if transcoding fails do we surface
// `unsupported_media` rather than an opaque provider 502. This set is the
// fallback signal when byte-sniffing can't identify an image (see
// normalizeImagesForDispatch); the primary HEIC decision is made from the bytes.
const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

// OpenAI-family providers that reliably support strict `response_format.json_schema`.
// Others (openai_compatible/custom) fall back to `json_object` with the schema
// embedded in the prompt, since arbitrary compatible servers may not support it.
const STRICT_SCHEMA_PROVIDERS = new Set([
  'openai',
  'mistral',
  'groq',
  'openrouter',
  'xai',
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
    case 'xai':
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

// Local / self-hosted server types (LM Studio, llama.cpp, Ollama) commonly run
// without an API key, so a blank key must not hard-fail them. Cloud providers
// always need one. This mirrors the chat path, which sends `api_key || 'no-key'`
// for these same types instead of rejecting the request.
export function requiresApiKey(serviceType: string): boolean {
  return (
    serviceType !== 'ollama' &&
    serviceType !== 'openai_compatible' &&
    serviceType !== 'custom'
  );
}

// Canonicalize an image MIME type before it drives any downstream decision.
// MIME types are case-insensitive and may carry stray whitespace (RFC 2045), so
// lowercase and trim first — otherwise `image/HEIC` would slip past both the
// HEIC transcode check and its unsupported_media fallback and reach a provider
// that rejects it opaquely. Also map the non-standard 'image/jpg' to the
// canonical 'image/jpeg', which Anthropic's Messages API requires. This is the
// single normalization point for every provider builder, so it lives here.
// dispatch is reached via untyped external JSON (api-fitness, MCP), so guard
// against a non-string mimeType rather than trusting the static type — a bare
// .trim() on null/undefined would crash the request.
function normalizeMimeType(mimeType: string | undefined | null): string {
  if (typeof mimeType !== 'string') return '';
  const normalized = mimeType.trim().toLowerCase();
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized;
}

// JPEG re-encode quality for transcoded HEIC. High enough to be invisible to a
// vision model, low enough to keep the base64 payload modest.
const HEIC_JPEG_QUALITY = 0.9;

// ISO-BMFF `ftyp` brands that denote a HEIF-family still image (HEIC/HEIF).
const HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'heim',
  'heis',
  'hevc',
  'hevx',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
  'heif',
]);

/**
 * Identify an image's real format from its leading magic bytes, independent of
 * any client-declared mime type. Returns a canonical mime, or null if the bytes
 * are unrecognized. Only the first bytes are inspected, so a small prefix of the
 * decoded image is enough.
 */
function sniffImageMime(head: Buffer): string | null {
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    head.length >= 8 &&
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    head.length >= 12 &&
    head.toString('ascii', 0, 4) === 'RIFF' &&
    head.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (
    head.length >= 12 &&
    head.toString('ascii', 4, 8) === 'ftyp' &&
    HEIF_BRANDS.has(head.toString('ascii', 8, 12).toLowerCase())
  ) {
    return 'image/heic';
  }
  return null;
}

/**
 * Normalize each image for dispatch, trusting the actual bytes over the
 * client-declared mime type. Client mimes are unreliable — Android's photo
 * picker in particular hands the app a decoded JPEG while still labelling it
 * `image/heic`, which would send a valid photo down the HEIC decode path and
 * fail. So we sniff the real format: transcode true HEIC/HEIF to JPEG (which
 * every provider accepts) and pass everything else through with a corrected
 * mime. Only genuine HEIC that fails to decode is left as HEIC, so the caller
 * detects the leftover mime and fails loud with `unsupported_media`.
 */
async function normalizeImagesForDispatch(
  images: DispatchImage[]
): Promise<DispatchImage[]> {
  return Promise.all(
    images.map(async (img) => {
      // 48 bytes (64 base64 chars, a whole-quantum slice) covers every magic
      // number we check, including the HEIF `ftyp` brand at offset 8.
      const sniffed = sniffImageMime(
        Buffer.from(img.base64.slice(0, 64), 'base64')
      );

      // Treat as HEIC when the bytes say so, or when we cannot identify the
      // bytes but the client flagged HEIC (covers exotic HEIF brands we do not
      // enumerate). A JPEG mislabeled as HEIC sniffs as JPEG and skips this.
      const looksHeic =
        sniffed === 'image/heic' ||
        (sniffed === null && HEIC_MIME_TYPES.has(img.mimeType));

      if (!looksHeic) {
        // Prefer the sniffed real format so a mislabeled image reaches the
        // provider with an accurate media type; otherwise keep the client mime.
        return sniffed ? { base64: img.base64, mimeType: sniffed } : img;
      }

      const input = Buffer.from(img.base64, 'base64');
      const startedAt = Date.now();
      try {
        const output = await convert({
          buffer: input,
          format: 'JPEG',
          quality: HEIC_JPEG_QUALITY,
        });
        const jpeg = Buffer.from(output);
        // Log the decode cost: this WASM transcode runs on the main thread, so
        // the timing here is the signal to watch if offloading to a worker pool
        // is ever warranted under concurrent load.
        log(
          'info',
          `providerDispatch: HEIC->JPEG transcode ok in ${Date.now() - startedAt}ms (${input.length}B HEIC -> ${jpeg.length}B JPEG)`
        );
        return {
          base64: jpeg.toString('base64'),
          mimeType: 'image/jpeg',
        };
      } catch (error) {
        log(
          'warn',
          `providerDispatch: HEIC->JPEG transcode failed, falling back to unsupported_media: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        // Correct the mime to what the bytes actually are (HEIC when sniffed,
        // else the client's HEIC label) so the leftover-HEIC check below catches
        // it and returns unsupported_media. Returning img unchanged would keep a
        // mislabeled `image/jpeg` and let undecodable bytes reach the provider.
        return { base64: img.base64, mimeType: sniffed ?? img.mimeType };
      }
    })
  );
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
    case 'xai':
      return 'https://api.x.ai/v1/chat/completions';
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
      // Local/self-hosted types may have no key; send the chat path's `no-key`
      // sentinel so a keyless server sees the same header from both paths.
      Authorization: `Bearer ${ctx.provider.api_key || 'no-key'}`,
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
  timeoutMs: number,
  networkPolicy?: AiNetworkPolicy
): Promise<HttpOutcome> {
  let response: Response | undefined;
  const fetchImpl = networkPolicy ? createGuardedFetch(networkPolicy) : fetch;

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    try {
      response = await fetchImpl(built.url, {
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
      const blockedError = getOutboundUrlBlockedError(error);
      if (blockedError) {
        return {
          error: {
            ok: false,
            category: 'private_network_forbidden',
            status: 403,
            detail: blockedError.message,
          },
        };
      }
      return {
        error: {
          ok: false,
          category: 'upstream_error',
          detail: `Failed to reach the AI service: ${(error as Error)?.message ?? 'unknown error'}`,
        },
      };
    }

    if (response.status === 429 && attempt < MAX_FETCH_RETRIES) {
      let body = '';
      try {
        body = await response.text();
      } catch {
        // best-effort
      }
      await sleep(
        parseRetryAfterMs(body) ?? INITIAL_BACKOFF_MS * Math.pow(2, attempt)
      );
      continue;
    }

    break;
  }

  return readResponse(response!);
}

async function performOllama(
  built: BuiltRequest,
  timeoutMs: number,
  networkPolicy?: AiNetworkPolicy
): Promise<HttpOutcome> {
  // The undici Agent carries the long header/body timeouts Ollama needs; it is
  // passed via the non-standard `dispatcher` fetch option (not in DOM types).
  const agent = networkPolicy
    ? createGuardedDispatcher(networkPolicy, {
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
      })
    : new Agent({
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
        redirect: 'manual',
        // @ts-expect-error undici dispatcher option is not in fetch DOM types
        dispatcher: agent,
      });
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === 'HeadersTimeoutError' || name === 'BodyTimeoutError') {
        return { error: timeoutError() };
      }
      const blockedError = getOutboundUrlBlockedError(error);
      if (blockedError) {
        return {
          error: {
            ok: false,
            category: 'private_network_forbidden',
            status: 403,
            detail: blockedError.message,
          },
        };
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
  const networkPolicy = requiresUserSuppliedAiUrl(serviceType)
    ? (req.networkPolicy ?? PUBLIC_ONLY_AI_NETWORK_POLICY)
    : undefined;

  const family = providerFamily(serviceType);
  if (!family) {
    return {
      ok: false,
      category: 'unsupported_provider',
      detail: `No dispatcher for AI service type '${serviceType}'.`,
    };
  }

  if (requiresApiKey(serviceType) && !provider.api_key) {
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

  if (networkPolicy && provider.custom_url) {
    try {
      assertOutboundUrlShapeAndLiteralAllowed(
        provider.custom_url,
        networkPolicy
      );
    } catch (error) {
      const blockedError = getOutboundUrlBlockedError(error);
      if (blockedError) {
        return {
          ok: false,
          category: 'private_network_forbidden',
          status: 403,
          detail: blockedError.message,
        };
      }
      if (error instanceof OutboundUrlShapeError) {
        // A stored URL fetch could never use (malformed, wrong scheme, embedded
        // credentials) is a provider-config failure, not a policy block.
        return {
          ok: false,
          category: 'upstream_error',
          detail: error.message,
        };
      }
      throw error;
    }
  }

  let images = (req.images ?? []).map((img) => ({
    // dispatch is reached via untyped external JSON (api-fitness, MCP), so a
    // malformed element (null, or a non-string base64) must not crash the map.
    base64: img && typeof img.base64 === 'string' ? img.base64 : '',
    mimeType: normalizeMimeType(img?.mimeType),
  }));
  const hasImages = images.length > 0;

  // Normalize images by their real bytes: transcode true HEIC/HEIF to JPEG for
  // every provider (rather than tracking which ones accept HEIC) and correct the
  // mime for anything the client mislabeled. The sub-second decode runs on an
  // upload already awaiting a multi second vision call. If a genuine HEIC fails
  // to convert the image stays HEIC and we fail loud below rather than shipping
  // bytes the provider might reject.
  if (hasImages) {
    images = await normalizeImagesForDispatch(images);
    if (images.some((img) => HEIC_MIME_TYPES.has(img.mimeType))) {
      return {
        ok: false,
        category: 'unsupported_media',
        detail:
          'HEIC/HEIF images are not supported and automatic conversion to JPEG failed. Use JPEG, PNG, or WebP.',
      };
    }
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
      ? await performOllama(built, timeoutMs, networkPolicy)
      : await performFetch(built, timeoutMs, networkPolicy);

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
