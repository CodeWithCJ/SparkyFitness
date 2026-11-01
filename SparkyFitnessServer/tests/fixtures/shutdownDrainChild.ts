/**
 * A minimal server process for shutdownDrain.integration.test.ts: claims a
 * provider row for a sync, installs the real shutdown handlers, prints
 * CLAIMED, and waits for a signal.
 *
 * Usage: shutdownDrainChild.ts <userId> <providerId> <wedged|finishes-in-ms> <shutdown-timeout-ms>
 */
import http from 'node:http';
import { enableRequestConnectRetry } from '../../db/connectRetry.js';
import { getSystemClient } from '../../db/poolManager.js';
import { startProviderSync } from '../../services/providerSyncClaim.js';
import { installShutdownHandlers } from '../../utils/gracefulShutdown.js';

// A stand-in for a production server, which retries connects.
enableRequestConnectRetry();

const [userId, providerId, mode, timeoutMs] = process.argv.slice(2) as [
  string,
  string,
  string,
  string,
];

const server = http.createServer((_req, res) => {
  res.end('ok');
});
await new Promise<void>((resolve) => server.listen(0, resolve));
installShutdownHandlers(server, Number(timeoutMs));

const started = await startProviderSync({ userId, providerId }, async () => {
  if (mode === 'wedged') {
    // A provider call that never answers.
    await new Promise(() => {});
  }
  await new Promise((resolve) => setTimeout(resolve, Number(mode)));
  const client = await getSystemClient();
  try {
    await client.query(
      'UPDATE external_data_providers SET last_sync_at = now() WHERE id = $1',
      [providerId]
    );
  } finally {
    client.release();
  }
});
if (!started) throw new Error('claim refused');
started.running.catch(() => {});
process.stdout.write('CLAIMED\n');
