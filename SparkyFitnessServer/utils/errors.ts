export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** A custom category with this name already exists for the user. */
export class CustomCategoryExistsError extends Error {
  constructor(name: string) {
    super(`A category named "${name}" already exists.`);
    this.name = 'CustomCategoryExistsError';
  }
}

const sqlState = /^[0-9A-Z]{5}$/;

interface InternalErrorFields {
  message?: unknown;
  code?: unknown;
  severity?: unknown;
  errno?: unknown;
  syscall?: unknown;
  errors?: unknown;
  cause?: unknown;
}

/** A pg error (SQLSTATE code and severity) or a Node system error. */
function isRawInternal(value: InternalErrorFields): boolean {
  return (
    (typeof value.code === 'string' &&
      sqlState.test(value.code) &&
      typeof value.severity === 'string') ||
    (typeof value.errno === 'number' && typeof value.syscall === 'string')
  );
}

/** Database and system errors found through `cause` and `errors[]`. */
function rawInternalCauses(err: InternalErrorFields): InternalErrorFields[] {
  const found: InternalErrorFields[] = [];
  const queue: { value: unknown; depth: number }[] = [
    ...(Array.isArray(err.errors) ? err.errors : []),
    err.cause,
  ].map((value) => ({ value, depth: 1 }));
  while (queue.length > 0 && found.length < 20) {
    const { value, depth } = queue.shift()!;
    if (typeof value !== 'object' || value === null || depth > 5) continue;
    const fields = value as InternalErrorFields;
    if (isRawInternal(fields)) found.push(fields);
    for (const next of [
      ...(Array.isArray(fields.errors) ? fields.errors : []),
      fields.cause,
    ]) {
      queue.push({ value: next, depth: depth + 1 });
    }
  }
  return found;
}

/**
 * Whether an error's own message or code would show a client the text of a
 * database or system error, which names hosts, tables and SQL. That is the
 * error itself, or an error repeating the message or code of one it wraps
 * (`Failed to load: column "x" does not exist`, or an `AggregateError` of
 * refused connections). An app message that only keeps the database error as
 * its `cause`, such as "A goal preset with this name already exists.", is not
 * internal.
 */
export function isInternalError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const fields = err as InternalErrorFields;
  if (isRawInternal(fields)) return true;
  const message = typeof fields.message === 'string' ? fields.message : '';
  return rawInternalCauses(fields).some(
    (cause) =>
      (typeof cause.message === 'string' &&
        cause.message.trim() !== '' &&
        message.includes(cause.message.trim())) ||
      (typeof cause.code === 'string' && cause.code === fields.code)
  );
}

/**
 * The message a hand-written 5xx response may show the client: the error's
 * own message, or `fallback` when that would leak a database or system error
 * (see `isInternalError`) or is missing.
 */
export function publicErrorMessage(
  error: unknown,
  fallback = 'Internal Server Error'
): string {
  if (isInternalError(error)) return fallback;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' && message ? message : fallback;
}

// A thrown value only has to be renderable, not an Error, and `error.message`
// on its own is not always enough to diagnose one. Node's Happy Eyeballs
// connector rejects with an `AggregateError` whose `message` is the empty
// string and whose real causes sit in `errors[]`. axios already flattens that
// case into its own message, so the axios paths are covered without this; what
// is not covered is everything else that reaches a `${error.message}` log line
// -- native fetch/undici rejections, database errors, and values that are not
// Errors at all. Interpolating one of those can still produce a bare
// `Error exchanging Withings code for tokens:` with nothing after it, which is
// what issue #2285 reported before the axios upgrade. Unwrap the aggregate and
// the `cause` chain, fall back to the syscall `code`, and never return an
// empty string.
const MAX_CAUSE_DEPTH = 3;
const MAX_CAUSES_PER_LEVEL = 4;

interface ErrorLike {
  message?: unknown;
  code?: unknown;
  errors?: unknown;
  cause?: unknown;
}

function collectCauses(candidate: ErrorLike, depth: number): unknown[] {
  if (depth >= MAX_CAUSE_DEPTH) {
    return [];
  }
  // AggregateError carries siblings in `errors`; everything else chains
  // through the single `cause` added in ES2022.
  if (Array.isArray(candidate.errors)) {
    return candidate.errors.slice(0, MAX_CAUSES_PER_LEVEL);
  }
  return candidate.cause === undefined || candidate.cause === null
    ? []
    : [candidate.cause];
}

function describeErrorAtDepth(error: unknown, depth: number): string {
  if (typeof error !== 'object' || error === null) {
    return String(error ?? '').trim() || 'unknown error';
  }
  const candidate = error as ErrorLike;
  const message =
    typeof candidate.message === 'string' ? candidate.message.trim() : '';
  const code = typeof candidate.code === 'string' ? candidate.code.trim() : '';
  const head = [message, code && !message.includes(code) ? `(${code})` : '']
    .filter(Boolean)
    .join(' ');

  const detail = collectCauses(candidate, depth)
    .map((cause) => describeErrorAtDepth(cause, depth + 1))
    .filter((text) => text && text !== 'unknown error')
    .join('; ');

  if (head && detail) {
    return `${head} [${detail}]`;
  }
  return (
    head || detail || (error instanceof Error && error.name) || 'unknown error'
  );
}

/**
 * Renders any thrown value as a log-safe, always non-empty string.
 * Prefer this over `error.message` when logging a failure that may have come
 * from an outbound network call.
 */
function describeError(error: unknown): string {
  return describeErrorAtDepth(error, 0);
}

export { describeError };
