/**
 * A second server instance for onlineRestoreGuard.integration.test.ts: opens
 * a pool session the way a serving instance does, prints READY and holds it
 * until killed.
 */
import { getRawOwnerPool } from '../../db/poolManager.js';

const client = await getRawOwnerPool().connect();
await client.query('SELECT 1');
process.stdout.write('READY\n');
setInterval(() => {}, 60_000);
