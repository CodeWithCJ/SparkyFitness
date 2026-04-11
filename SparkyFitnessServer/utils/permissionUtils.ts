import { getClient, getSystemClient } from '../db/poolManager.js';
async function canAccessUserData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  targetUserId: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  permissionType: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authenticatedUserId: any
) {
  // If accessing own data, always allow
  if (targetUserId === authenticatedUserId) {
    return true;
  }
  // Check if target and authenticated user are effectively the same (same email)
  const systemClient = await getSystemClient();
  try {
    const emailCheckResult = await systemClient.query(
      `SELECT 
        (SELECT email FROM "user" WHERE id = $1) as target_email,
        (SELECT email FROM "user" WHERE id = $2) as auth_email`,
      [targetUserId, authenticatedUserId]
    );
    const emails = emailCheckResult.rows[0];
    if (
      emails &&
      emails.target_email &&
      emails.auth_email &&
      emails.target_email.toLowerCase() === emails.auth_email.toLowerCase()
    ) {
      return true;
    }
  } catch (error) {
    console.error('Error checking same-email permission:', error);
  } finally {
    systemClient.release();
  }
  // Check if authenticated user has family access with the required permission
  const client = await getClient(authenticatedUserId); // User-specific operation
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
           -- Handle mapping for 'diary' permission to 'can_manage_diary' key in JSON
           ($3 = 'diary' AND ((fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR (fa.access_permissions->>'can manage diary')::boolean = TRUE))
           OR
            -- Handle mapping for 'goals' permission to 'can_manage_diary' key (goals are part of diary)
            ($3 = 'goals' AND ((fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR (fa.access_permissions->>'can manage diary')::boolean = TRUE))
            OR
            -- Handle mapping for 'exercise' permission to 'can_manage_diary' key
            ($3 = 'exercise' AND ((fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR (fa.access_permissions->>'can manage diary')::boolean = TRUE))
            OR
            -- Handle mapping for 'water' permission to 'can_manage_diary' key
            ($3 = 'water' AND ((fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR (fa.access_permissions->>'can manage diary')::boolean = TRUE))
            OR
            -- Handle mapping for 'checkin' permission to 'can_manage_checkin' key
            ($3 = 'checkin' AND ((fa.access_permissions->>'can_manage_checkin')::boolean = TRUE OR (fa.access_permissions->>'can manage checkin')::boolean = TRUE))
            OR
            -- Handle mapping for 'reports' permission to 'can_view_reports' key
            ($3 = 'reports' AND ((fa.access_permissions->>'can_view_reports')::boolean = TRUE OR (fa.access_permissions->>'can view reports')::boolean = TRUE))
            OR
            -- Inheritance: reports permission grants read access to all diary and wellness data
            ($3 IN ('diary', 'checkin', 'mood', 'goals', 'exercise', 'fasting', 'sleep', 'water') AND (
               ((fa.access_permissions->>'reports')::boolean = TRUE OR (fa.access_permissions->>'can_view_reports')::boolean = TRUE OR (fa.access_permissions->>'can view reports')::boolean = TRUE)
               OR 
               ((fa.access_permissions->>'calorie')::boolean = TRUE)
             ))
            OR
            -- Inheritance: food_list permission grants read access to calorie data (foods table)
            ($3 = 'diary' AND (
               ((fa.access_permissions->>'food_list')::boolean = TRUE OR (fa.access_permissions->>'can_view_food_library')::boolean = TRUE OR (fa.access_permissions->>'can view food library')::boolean = TRUE)
             ))
          )
      `,
      [authenticatedUserId, targetUserId, permissionType]
    );
    return result.rowCount > 0;
  } finally {
    client.release();
  }
}
export { canAccessUserData };
export default {
  canAccessUserData,
};
