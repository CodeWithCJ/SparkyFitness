/**
 * Whether a provider rejected a fetch for lack of permission. People can
 * deselect individual scopes when connecting, so this repeats on every run and
 * must not count as a failed required fetch: last_sync_at would never move.
 */
function isPermissionRejection(error: unknown): boolean {
  const status = (error as { response?: { status?: number } } | null)?.response
    ?.status;
  return status === 401 || status === 403;
}

export { isPermissionRejection };
