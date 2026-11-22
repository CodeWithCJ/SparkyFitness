/**
 * True when `error` is a Postgres unique violation raised by the named index.
 * Used to turn a lost race on an idempotency key into "already created".
 */
export function isUniqueViolationOn(
  error: unknown,
  constraint: string
): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, constraint: violated } = error as {
    code?: unknown;
    constraint?: unknown;
  };
  return code === '23505' && violated === constraint;
}
