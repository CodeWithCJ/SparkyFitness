import { createHash } from 'node:crypto';
import os from 'node:os';

type PoolName = 'owner' | 'app' | 'auth';

const APPLICATION_NAME_PREFIX = 'sparkyfitness-';
// PostgreSQL keeps the first NAMEDATALEN - 1 bytes of application_name.
const MAX_APPLICATION_NAME_LENGTH = 63;
// Ends a shortened name; never part of a hostname, so a shortened name cannot
// equal a full one.
const HASH_SEPARATOR = '#';
const HASH_LENGTH = 10;

/**
 * Names this process's sessions in pg_stat_activity, so an operator can tell
 * which replica and which pool a connection belongs to, and the restore guard
 * can tell this process's sessions from every other's. A name that does not
 * fit is cut short and ends in a hash of the whole host:pid, because the part
 * that tells replicas apart (a pod's suffix, the pid) comes last.
 */
function applicationName(
  pool: PoolName,
  hostname = os.hostname(),
  pid = process.pid
): string {
  // PostgreSQL turns anything but printable ASCII into '?'; doing it here
  // keeps the length in bytes and the name this process compares against
  // identical to what the server stores.
  const identity = `${hostname}:${pid}`;
  const full = `${APPLICATION_NAME_PREFIX}${pool}@${identity}`.replace(
    /[^\x20-\x7e]/g,
    '?'
  );
  if (full.length <= MAX_APPLICATION_NAME_LENGTH) return full;
  const hash = createHash('sha256')
    .update(identity)
    .digest('hex')
    .slice(0, HASH_LENGTH);
  const suffix = `${HASH_SEPARATOR}${hash}`;
  return full.slice(0, MAX_APPLICATION_NAME_LENGTH - suffix.length) + suffix;
}

/** Every name this process's own sessions carry. */
function ownApplicationNames(): string[] {
  return (['owner', 'app', 'auth'] as const).map((pool) =>
    applicationName(pool)
  );
}

export { applicationName, ownApplicationNames, APPLICATION_NAME_PREFIX };
