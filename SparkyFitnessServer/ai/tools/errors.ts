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

  DB_ERROR: () =>
    toolError(
      'DB_ERROR',
      'A database error occurred. Please try again.',
      'If the issue persists, contact support.'
    ),

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
