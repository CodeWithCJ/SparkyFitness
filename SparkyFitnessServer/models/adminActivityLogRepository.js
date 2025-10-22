const { getSystemClient } = require('../db/poolManager');

async function createAdminActivityLog(adminUserId, targetUserId, actionType, details) {
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

module.exports = {
  createAdminActivityLog,
};