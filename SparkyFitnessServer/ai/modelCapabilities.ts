import { log } from '../config/logging.js';

/**
 * Per-model sampling-parameter capabilities.
 *
 * Providers keep shipping models that reject parameters their predecessors
 * accepted — OpenAI's reasoning families (gpt-5.x, o-series) allow only the
 * default `temperature`, and Claude Opus 4.7+ / Sonnet 5 reject it outright.
 * Sending one of those fails the whole request before any work happens.
 *
 * Chasing that with a hardcoded model list alone is a treadmill: every new
 * model family needs a release. So this module has two layers.
 *
 *  1. A static gate for families we already know about. Costs nothing and
 *     avoids a wasted round-trip. Kept deliberately conservative — a missing
 *     entry is caught free by layer 2, whereas a wrong entry silently loses
 *     temperature control.
 *  2. A dynamic gate: when a provider rejects a parameter with a 400, the
 *     caller drops that parameter, retries once, and records the rejection
 *     here. Every later request for that model skips the parameter with no
 *     retry cost, so an unknown future model works on first use without a
 *     code change.
 *
 * Used by both request paths — the raw-fetch dispatcher (providerDispatch.ts)
 * and the AI SDK chat path (chatService.ts).
 */

/**
 * Parameters we are willing to silently drop and retry without.
 *
 * Strictly limited to sampling hints whose absence changes *nothing* about the
 * shape of the response — the model just uses its default. Deliberately
 * excludes `max_tokens` (required by Anthropic; dropping it trades one failure
 * for another) and anything that governs output format such as
 * `response_format`, where a silent drop would return a different shape than
 * the caller parsed for. Those fail loudly instead.
 */
export const DROPPABLE_PARAMS: ReadonlySet<string> = new Set([
  'temperature',
  'top_p',
]);

// Literal patterns for the prose fallback below, kept in step with
// DROPPABLE_PARAMS. Written out rather than built from the set so the
// expressions stay static and auditable.
const DROPPABLE_PARAM_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['temperature', /\btemperature\b/],
  ['top_p', /\btop_p\b/],
];

// Claude Opus 4.7 and later reject `temperature` outright with a 400, and
// Sonnet 5 rejects non-default values. Older models (Sonnet 4.6, Haiku 4.5,
// and earlier) still honor it.
const ANTHROPIC_MODELS_REJECTING_TEMPERATURE =
  /^claude-(opus-(4-7|4-8|5)|sonnet-5|fable-5|mythos-5)/;

// OpenAI reasoning families support only the default temperature of 1.
// Matches gpt-5, gpt-5.6-luna, o1-mini, o3, o4-mini, and so on.
//
// Applied to the canonical 'openai' service type only. An openai_compatible /
// custom / openrouter gateway may serve a same-looking model id through a shim
// that does accept temperature, so those are left to layer 2 rather than
// assumed broken.
const OPENAI_MODELS_REJECTING_TEMPERATURE = /^(gpt-5|o[1-9](-|$))/;

const STATIC_TEMPERATURE_REJECTIONS: Record<string, RegExp> = {
  anthropic: ANTHROPIC_MODELS_REJECTING_TEMPERATURE,
  openai: OPENAI_MODELS_REJECTING_TEMPERATURE,
};

// ---------------------------------------------------------------------------
// Layer 2: learned rejections
// ---------------------------------------------------------------------------

// Model names reach us from user-editable provider settings, so the cache is
// capped and evicts in insertion order — an unbounded Map keyed by arbitrary
// strings would be a slow memory leak.
const MAX_LEARNED_MODELS = 500;

const learnedRejections = new Map<string, Set<string>>();

function cacheKey(serviceType: string, model: string): string {
  return `${serviceType}:${model}`;
}

/**
 * Records that `model` on `serviceType` rejected `param`, so later requests
 * skip it without paying another failed round-trip.
 *
 * Process-local by design: it re-learns cheaply after a restart, needs no
 * migration, and cannot go stale if a provider reverses the behavior.
 */
export function recordRejectedParam(
  serviceType: string,
  model: string,
  param: string
): void {
  const key = cacheKey(serviceType, model);
  const existing = learnedRejections.get(key);
  if (existing) {
    existing.add(param);
    return;
  }
  if (learnedRejections.size >= MAX_LEARNED_MODELS) {
    const oldest = learnedRejections.keys().next();
    if (!oldest.done) {
      learnedRejections.delete(oldest.value);
    }
  }
  learnedRejections.set(key, new Set([param]));
  log(
    'info',
    `[modelCapabilities] '${model}' on '${serviceType}' rejected '${param}'; omitting it from future requests.`
  );
}

export function isParamRejected(
  serviceType: string,
  model: string,
  param: string
): boolean {
  return (
    learnedRejections.get(cacheKey(serviceType, model))?.has(param) ?? false
  );
}

/** Test-only: drops everything layer 2 has learned. */
export function resetLearnedRejections(): void {
  learnedRejections.clear();
}

// ---------------------------------------------------------------------------
// Combined gate
// ---------------------------------------------------------------------------

/**
 * Whether `temperature` may be sent to this model. False when either the
 * static family gate matches or the provider has already rejected it once.
 */
export function supportsTemperature(
  serviceType: string,
  model: string
): boolean {
  if (isParamRejected(serviceType, model, 'temperature')) return false;
  const pattern = STATIC_TEMPERATURE_REJECTIONS[serviceType];
  return !(pattern && pattern.test(model));
}

// ---------------------------------------------------------------------------
// Rejection detection
// ---------------------------------------------------------------------------

// OpenAI-style machine-readable codes for "this parameter/value isn't allowed".
const REJECTION_CODES = new Set([
  'unsupported_value',
  'unsupported_parameter',
  'invalid_value',
]);

// Fallback for providers that return prose without a `param` field.
const REJECTION_PHRASES =
  /does not support|unsupported value|unsupported parameter|not supported|only the default|extra inputs are not permitted|not permitted/i;

// A body big enough to be a payload rather than an error isn't worth scanning.
const MAX_SCANNED_BODY_CHARS = 8_000;

interface ProviderErrorShape {
  message?: unknown;
  param?: unknown;
  code?: unknown;
  type?: unknown;
}

function parseProviderError(rawBody: string): ProviderErrorShape | null {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object') return null;
    // Most providers nest under `error`; a few return the fields at top level.
    const error = (parsed as { error?: unknown }).error;
    const candidate =
      error && typeof error === 'object' ? error : (parsed as object);
    return candidate as ProviderErrorShape;
  } catch {
    return null;
  }
}

/**
 * Identifies which request parameter a provider's 400 is complaining about, or
 * null when the error is something else (bad key, unknown model, rate limit).
 *
 * Only ever names a parameter in `DROPPABLE_PARAMS`; a rejection of anything
 * else returns null so the caller surfaces the failure instead of silently
 * changing the request.
 */
export function detectRejectedParam(
  status: number,
  rawBody: string
): string | null {
  if (status !== 400) return null;
  if (!rawBody || rawBody.length > MAX_SCANNED_BODY_CHARS) return null;

  const error = parseProviderError(rawBody);
  const message = typeof error?.message === 'string' ? error.message : rawBody;

  // Preferred path: the provider names the parameter outright.
  if (typeof error?.param === 'string' && error.param) {
    const named = error.param;
    if (!DROPPABLE_PARAMS.has(named)) return null;
    const code = typeof error.code === 'string' ? error.code : '';
    if (REJECTION_CODES.has(code) || REJECTION_PHRASES.test(message)) {
      return named;
    }
    return null;
  }

  // Fallback: no `param` field (Anthropic and some gateways), so look for a
  // droppable parameter named in prose that reads like a rejection.
  if (!REJECTION_PHRASES.test(message)) return null;
  for (const [param, pattern] of DROPPABLE_PARAM_PATTERNS) {
    if (pattern.test(message)) return param;
  }
  return null;
}

/**
 * The parameter a 400 is complaining about even when we cannot safely drop it
 * — used only to turn a raw JSON body into a readable message for the user.
 */
export function describeRejectedParam(
  status: number,
  rawBody: string
): string | null {
  if (status !== 400) return null;
  if (!rawBody || rawBody.length > MAX_SCANNED_BODY_CHARS) return null;
  const error = parseProviderError(rawBody);
  const message = typeof error?.message === 'string' ? error.message : '';
  if (!message || !REJECTION_PHRASES.test(message)) return null;
  const named = typeof error?.param === 'string' ? error.param : null;
  return named || null;
}

export default {
  DROPPABLE_PARAMS,
  supportsTemperature,
  recordRejectedParam,
  isParamRejected,
  resetLearnedRejections,
  detectRejectedParam,
  describeRejectedParam,
};
