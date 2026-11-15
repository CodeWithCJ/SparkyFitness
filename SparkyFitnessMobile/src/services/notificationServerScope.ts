import { getActiveServerConfig } from './storage';

/** The active saved server's id, or null when none is set or it can't be read. */
export async function currentServerId(): Promise<string | null> {
  try {
    return (await getActiveServerConfig())?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * A notification stamped with a server is acted on only while that server is
 * the active one. A copy of a server (a restored backup) has the same user and
 * entry ids but another server id. Notifications without a stamp (scheduled by
 * an older build) count as the active server's.
 */
export function belongsToOtherServer(
  serverId: string | null | undefined,
  activeServerId: string | null
): boolean {
  return Boolean(serverId) && serverId !== activeServerId;
}
