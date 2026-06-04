# High-Level Design Document: User Management Bug Fixes

## Overview
This document analyzes and outlines the proposed fixes for two related bugs under **Admin > User Management** (Issue #1436):
1. **Unable to De-activate a User**: Unticking the "Active" checkbox throws a SQL parameter error (`could not determine data type of parameter $1`).
2. **Last Login shows as N/A**: The `Last Login` column displays `N/A` for all users, even if they have successfully logged in.

---

## 1. Unable to De-activate a User

### Analysis
* **Route**: `PUT /api/admin/users/:userId/status` handles the status update by calling `userRepository.updateUserStatus(userId, isActive)`.
* **Repository Method**: [updateUserStatus](file:///C:/SparkyApps/SparkyFitness/SparkyFitnessServer/models/userRepository.ts#L401-L412) runs the following query:
  ```typescript
  await client.query(
    'UPDATE "user" SET updated_at = now() WHERE id = $2 RETURNING id',
    [isActive, userId]
  );
  ```
* **Issues identified**:
  1. The query values are `[isActive, userId]`. This means `$1` maps to `isActive` and `$2` maps to `userId`. However, the query text does not contain `$1`. Postgres errors out with `could not determine data type of parameter $1` when parameters are passed but not referenced.
  2. Better Auth represents user activation status using a `banned` boolean column (`true` if inactive/banned, `false` if active). The SQL query does not attempt to update the `banned` status column at all.
  3. [getAllUsers](file:///C:/SparkyApps/SparkyFitness/SparkyFitnessServer/models/userRepository.ts#L353-L381) hardcodes the active status to `true as is_active` rather than retrieving it from the database:
     ```sql
     SELECT
       u.id,
       u.email,
       u.role,
       true as is_active,
       u.created_at,
       p.full_name
     FROM "user" u
     ```

### Proposed Fix
1. Modify `updateUserStatus` to map `isActive` to `banned = !isActive` and correctly construct the SQL query to update the `banned` column using both `$1` and `$2`:
   ```typescript
   async function updateUserStatus(userId: any, isActive: any) {
     const client = await getSystemClient();
     try {
       const banned = !isActive;
       const result = await client.query(
         'UPDATE "user" SET banned = $1, updated_at = now() WHERE id = $2 RETURNING id',
         [banned, userId]
       );
       return result.rowCount > 0;
     } finally {
       client.release();
     }
   }
   ```
2. Modify `getAllUsers` in the repository to retrieve the real status:
   ```sql
   NOT COALESCE(u.banned, false) as is_active
   ```

---

## 2. Last Login shows as N/A

### Analysis
* **Database Schema**: The current `public."user"` table (introduced during the Better Auth migration) does not have a `last_login_at` column.
* **Repository Method**: [updateUserLastLogin](file:///C:/SparkyApps/SparkyFitness/SparkyFitnessServer/models/userRepository.ts#L341-L351) is defined and exported but is **never called** anywhere in the codebase. Furthermore, it only updates `updated_at` rather than a specific `last_login_at` column.
* **Frontend**: The user management table in [UserManagement.tsx](file:///C:/SparkyApps/SparkyFitness/SparkyFitnessFrontend/src/pages/Admin/UserManagement.tsx#L409-L411) expects a `last_login_at` property:
  ```typescript
  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'N/A'}
  ```

### Proposed Fix
1. **Database Migration**: Create a migration `SparkyFitnessServer/db/migrations/20260604120600_add_user_last_login_at.sql` to add the `last_login_at` column:
   ```sql
   ALTER TABLE public."user" ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

   -- Populate existing users with their last session's creation time (if available)
   UPDATE public."user" u
   SET last_login_at = (
       SELECT MAX(created_at)
       FROM public.session
       WHERE user_id = u.id
   )
   WHERE last_login_at IS NULL;
   ```
2. **Schema Backup**: Update `db_schema_backup.sql` for the `public."user"` table definition to include `last_login_at timestamp with time zone`.
3. **Better Auth Lifecycle Hook**: In [SparkyFitnessServer/auth.ts](file:///C:/SparkyApps/SparkyFitness/SparkyFitnessServer/auth.ts), invoke `updateUserLastLogin` when a new session is successfully created:
   ```typescript
   session: {
     create: {
       after: async (session) => {
         try {
           await userRepository.updateUserLastLogin(session.userId);
         } catch (error) {
           log('error', `Failed to update user last login:`, error);
         }
         // Existing group sync code...
       }
     }
   }
   ```
4. **Repository Updates**:
   * Update `updateUserLastLogin` to save the timestamp:
     ```typescript
     await client.query(
       'UPDATE "user" SET last_login_at = now(), updated_at = now() WHERE id = $1',
       [userId]
     );
     ```
   * Update `getAllUsers` to select `u.last_login_at`:
     ```sql
     SELECT
       u.id,
       u.email,
       u.role,
       NOT COALESCE(u.banned, false) as is_active,
       u.created_at,
       u.last_login_at,
       p.full_name
     ...
     ```

---

## Verification Plan
1. Run `pnpm run build` and `pnpm run validate` to ensure TypeScript passes.
2. Verify user list contains the correct active status matching database bans.
3. Test toggling active/inactive status from the admin panel and ensure it updates `banned` correctly without errors.
4. Verify user logins update the `last_login_at` column and display properly in the UI.
