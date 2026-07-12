import type { ZodError } from 'zod';

/**
 * Creates a standardized error message for a chatbot tool result.
 * Security: Never exposes internal details (stack traces, SQL errors).
 */
export function toolError(
  code: string,
  message: string,
  suggestion?: string
): string {
  return suggestion
    ? `Error [${code}]: ${message}\n\nSuggestion: ${suggestion}`
    : `Error [${code}]: ${message}`;
}

// Postgres error fields that are safe to show: the SQLSTATE class and the name
// of the violated constraint. Both are schema metadata — they identify WHICH
// rule was broken without revealing row data, SQL text, or internals.
function describeDbError(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const pg = error as { code?: unknown; constraint?: unknown };
  const code = typeof pg.code === 'string' ? pg.code : null;
  const constraint = typeof pg.constraint === 'string' ? pg.constraint : null;

  const kind =
    code === '23514'
      ? 'check constraint'
      : code === '23505'
        ? 'unique constraint'
        : code === '23503'
          ? 'foreign key constraint'
          : code === '23502'
            ? 'not-null constraint'
            : null;

  if (constraint && kind) return `${kind} ${constraint}`;
  if (constraint) return `constraint ${constraint}`;
  if (code) return `SQLSTATE ${code}`;
  return null;
}

// Standard error builders
export const ERRORS = {
  INVALID_DATE: (val: string) =>
    toolError(
      'INVALID_DATE',
      `'${val}' is not a valid date. Use YYYY-MM-DD format.`,
      'Example: 2025-01-15'
    ),

  NOT_FOUND: (resource: string, id: string) =>
    toolError(
      'NOT_FOUND',
      `${resource} with ID '${id}' not found.`,
      'Check the ID and try again.'
    ),

  VALIDATION: (details: string) => toolError('VALIDATION', details),

  MISSING_PARAMS: (params: string[]) =>
    toolError(
      'MISSING_PARAMS',
      `Missing required parameters: ${params.join(', ')}`,
      'Provide all required parameters and try again.'
    ),

  /**
   * `error` is the caught exception. Only a non-sensitive discriminator is
   * surfaced (the Postgres SQLSTATE and the violated constraint name — schema
   * metadata, never row data, SQL text, or a stack trace); the full error is
   * still logged by the caller.
   *
   * Without it, a deterministic failure like a CHECK-constraint violation
   * reaches the chat as "a database error occurred", and the only way to learn
   * what actually broke is to grep the server log.
   */
  DB_ERROR: (error?: unknown) => {
    const detail = describeDbError(error);
    return toolError(
      'DB_ERROR',
      detail
        ? `The database rejected this write (${detail}).`
        : 'A database error occurred.',
      // Never invite a blind retry: these failures are deterministic, so an
      // identical retry fails identically (and can double-write if an earlier
      // step in the operation succeeded).
      'Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.'
    );
  },

  UNAUTHORIZED: () =>
    toolError('UNAUTHORIZED', 'Authentication required. Please reconnect.'),

  FORBIDDEN: (reason: string) => toolError('FORBIDDEN', reason),

  INVALID_ACTION: (action: string, validActions: string[]) =>
    toolError(
      'INVALID_ACTION',
      `Unknown action '${action}'.`,
      `Valid actions: ${validActions.join(', ')}`
    ),
};

// Every registry tool failure goes through toolError(), so the "Error [CODE]:"
// prefix is a stable machine-checkable contract. The MCP adapter uses it to
// set isError on tool results; keep it in sync with toolError above.
const TOOL_ERROR_PREFIX = /^Error \[[A-Z_]+\]: /;

/**
 * True when a registry tool's returned text is a toolError() failure string.
 */
export function isToolErrorText(text: string): boolean {
  return TOOL_ERROR_PREFIX.test(text);
}

/**
 * Renders a zod parse failure as a chat-visible VALIDATION error,
 * formatted as "path: message; path2: message2".
 */
export function formatZodError(error: ZodError): string {
  return ERRORS.VALIDATION(
    error.issues
      .map((i) =>
        i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message
      )
      .join('; ')
  );
}
