const { getClient } = require('../db/poolManager');

async function canAccessUserData(targetUserId, permissionType, authenticatedUserId) {
  // If accessing own data, always allow
  if (targetUserId === authenticatedUserId) {
    return true;
  }

  // Check if authenticated user has family access with the required permission
  const client = await getClient(familyUserId); // User-specific operation
  try {
    const result = await client.query(
      `SELECT 1
       FROM family_access fa
       WHERE fa.family_user_id = $1
         AND fa.owner_user_id = $2
         AND fa.is_active = TRUE
         AND (fa.access_end_date IS NULL OR fa.access_end_date > NOW())
         AND (
           (fa.access_permissions->>$3)::boolean = TRUE
           OR
           -- Inheritance: reports permission grants read access to calorie, checkin, and mood
           ($3 IN ('calorie', 'checkin', 'mood') AND (fa.access_permissions->>'reports')::boolean = TRUE)
           OR
           -- Inheritance: food_list permission grants read access to calorie data (foods table)
           ($3 = 'calorie' AND (fa.access_permissions->>'food_list')::boolean = TRUE)
         )`,
      [authenticatedUserId, targetUserId, permissionType]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}

module.exports = {
  canAccessUserData,
};