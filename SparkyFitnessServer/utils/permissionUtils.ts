import { getClient } from '../db/poolManager.js';
/**
 * Whether `authenticatedUserId` may use `permissionType` on `targetUserId`'s
 * data: always for their own data, otherwise only through an active Family
 * Access grant. A matching email address never stands in for a grant: emails
 * are stored case-sensitively, so `Victim@x.com` and `victim@x.com` can be two
 * different accounts, and treating them as one person let either act as the
 * other without being granted anything.
 *
 * `targetUserId` is often a raw query parameter, which Express can hand over
 * as an array or an object (`?userId[]=a&userId[]=b`); anything but a single
 * id string is refused rather than passed into the query.
 */
async function canAccessUserData(
  targetUserId: unknown,
  permissionType: string,
  authenticatedUserId: string
): Promise<boolean> {
  if (typeof targetUserId !== 'string' || targetUserId === '') {
    return false;
  }
  // If accessing own data, always allow
  if (targetUserId === authenticatedUserId) {
    return true;
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
           ($3 = 'diary' AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE)
           OR
            -- Handle mapping for 'goals' permission to 'can_manage_diary' key (goals are part of diary)
            ($3 = 'goals' AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE)
            OR
            -- Handle mapping for 'exercise' permission to 'can_manage_diary' key
            ($3 = 'exercise' AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE)
            OR
            -- Handle mapping for 'water' permission to 'can_manage_diary' key
            ($3 = 'water' AND (fa.access_permissions->>'can_manage_diary')::boolean = TRUE)
            OR
            -- Handle mapping for 'checkin' permission to 'can_manage_checkin' key
            ($3 = 'checkin' AND (fa.access_permissions->>'can_manage_checkin')::boolean = TRUE)
            OR
            -- Handle mapping for 'medications' permission to 'can_manage_medications' key
            ($3 = 'medications' AND (fa.access_permissions->>'can_manage_medications')::boolean = TRUE)
            OR
            -- Handle mapping for 'medications_read' permission (read-only medications data)
            ($3 = 'medications_read' AND (
              (fa.access_permissions->>'can_manage_medications')::boolean = TRUE OR
              (fa.access_permissions->>'can_view_reports')::boolean = TRUE
            ))
            OR
            -- Handle mapping for 'symptoms' permission to 'can_manage_symptoms' key
            ($3 = 'symptoms' AND (fa.access_permissions->>'can_manage_symptoms')::boolean = TRUE)
            OR
            -- Handle mapping for 'symptoms_read' permission (read-only symptom data)
            ($3 = 'symptoms_read' AND (
              (fa.access_permissions->>'can_manage_symptoms')::boolean = TRUE OR
              (fa.access_permissions->>'can_view_reports')::boolean = TRUE
            ))
            OR
            -- Handle mapping for 'checkin_read' permission (read-only check-in data)
            ($3 = 'checkin_read' AND (
              (fa.access_permissions->>'can_manage_checkin')::boolean = TRUE OR
              (fa.access_permissions->>'can_view_reports')::boolean = TRUE OR
              (fa.access_permissions->>'can_manage_diary')::boolean = TRUE
            ))
            OR
            -- Handle mapping for 'reports' permission to 'can_view_reports', 'can_manage_diary', or 'can_manage_checkin' key
            ($3 = 'reports' AND (
              (fa.access_permissions->>'can_view_reports')::boolean = TRUE OR
              (fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR
              (fa.access_permissions->>'can_manage_checkin')::boolean = TRUE
            ))
            OR
            -- Handle mapping for 'diary_read' permission (read-only diary data)
            ($3 = 'diary_read' AND (
              (fa.access_permissions->>'can_manage_diary')::boolean = TRUE OR
              (fa.access_permissions->>'can_view_reports')::boolean = TRUE OR
              (fa.access_permissions->>'can_view_food_library')::boolean = TRUE OR
              (fa.access_permissions->>'calorie')::boolean = TRUE
            ))
            OR
            -- Inheritance: reports permission grants read access to read-only permission types only.
            -- Write-level permission types (diary, checkin, medications, symptoms) are NOT inherited from reports.
            ($3 IN ('mood', 'goals', 'exercise', 'fasting', 'sleep', 'water') AND (
               ((fa.access_permissions->>'reports')::boolean = TRUE OR (fa.access_permissions->>'can_view_reports')::boolean = TRUE)
               OR
               ((fa.access_permissions->>'calorie')::boolean = TRUE)
             ))
          )
      `,
      [authenticatedUserId, targetUserId, permissionType]
    );
    return (result.rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}
export { canAccessUserData };
export default {
  canAccessUserData,
};
