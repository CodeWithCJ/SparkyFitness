import { getSystemClient } from '../db/poolManager.js';

/**
 * Claims one tick of a job: true for the first instance to claim it. Later
 * ticks only: an instance whose clock lags cannot claim one already passed.
 */
async function claimSlot(
  name: string,
  slot: Date,
  instance: string
): Promise<boolean> {
  const client = await getSystemClient();
  try {
    const { rowCount } = await client.query(
      `INSERT INTO system.scheduled_jobs AS job
         (name, last_slot, claimed_by, claimed_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (name) DO UPDATE
         SET last_slot = EXCLUDED.last_slot,
             claimed_by = EXCLUDED.claimed_by,
             claimed_at = EXCLUDED.claimed_at
         WHERE job.last_slot < EXCLUDED.last_slot`,
      [name, slot, instance]
    );
    return rowCount === 1;
  } finally {
    client.release();
  }
}

export default { claimSlot };
