import { getSystemClient } from '../db/poolManager.js';
async function createAdminActivityLog(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actionType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any
) {
  const client = await getSystemClient(); // System-level operation
  try {
    const result = await client.query(
      `INSERT INTO admin_activity_logs (admin_user_id, target_user_id, action_type, details, created_at)
       VALUES ($1, $2, $3, $4, now()) RETURNING *`,
      [adminUserId, targetUserId, actionType, details]
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}
export { createAdminActivityLog };
export default {
  createAdminActivityLog,
};
