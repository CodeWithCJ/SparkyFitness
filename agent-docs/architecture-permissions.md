# Permission & Domain Architecture

This doc maps how access control works across the system. Understanding this prevents unsafe data access and RLS bugs.

## Permission Types

Grants live in `family_access.access_permissions` (JSONB booleans: `can_manage_diary`, `can_manage_checkin`, `can_manage_medications`, `can_view_reports`, `can_view_food_library`, `calorie`). Route/RLS code uses *logical* permission strings mapped onto those keys in `permissionUtils.ts` (`canAccessUserData`) / SQL `can_access_user_data`.

- **Write:** `diary` (`goals`/`exercise`/`water` alias onto `can_manage_diary`), `checkin`, `medications`.
- **Read:** `reports` (via `can_view_reports`/`can_manage_diary`/`can_manage_checkin`) and `*_read` variants (`diary_read`, `checkin_read`, `medications_read`).
- **Inheritance:** a `reports`/`can_view_reports` (or `calorie`) grant adds *read* on `mood`, `goals`, `exercise`, `fasting`, `sleep`, `water`, `symptoms`; write types are not inherited.
- **Owner-only:** cycle/pregnancy are **not** delegatable (no `checkPermissionMiddleware`; RLS restricts to owner — `routes/v2/cycleRoutes.ts`). There is no `cycle` permission.

Test: `tests/permissionUtils.test.ts`.

## Domain → Permission Mapping

**For the authoritative table-to-permission mapping and RLS tier classification, see [`../docs/content/8.developer/11.database-security-tiers.md`](../docs/content/8.developer/11.database-security-tiers.md).** It lists every table, its permission type, and whether it's Tier 1 (owner-only), Tier 2 (owner-write, delegate-read), or Tier 3 (owner-read, delegate-read, external-read).

Quick reference:
- **Tier 1** — Credentials, auth, admin data (owner-only, RLS is strict)
- **Tier 2** — Diaries, logs, preferences (owner-write, delegates can read)
- **Tier 3** — Public profiles, shared exercise library (everyone can read)

## Data Access Safety Pattern

Every server model that touches user data must follow this pattern:

```typescript
// Get a client scoped to the user's RLS context
const client = getClient(userId, authenticatedUserId);
try {
  // All queries through this client respect RLS
  const result = await client.query('SELECT * FROM foods WHERE user_id = $1', [userId]);
  // ... use result
} finally {
  client.release();
}
```

**Never use** `getSystemClient()` for normal user queries — it bypasses RLS entirely and is only for admin/startup/migration work.

`getClient()` runs `public.set_app_context(userId, authenticatedUserId)`, setting `app.user_id`/`app.authenticated_user_id`. RLS reads them via `current_user_id()`/`authenticated_user_id()` and gates rows with `can_access_user_data(target, permission_type, authenticated_user_id())` or a domain helper (`has_diary_read_access`, `has_checkin_read_access`, `has_medication_access`, `has_family_access`). Policies are usually emitted by generators (`create_shared_owner_policy(table, id_col)`, etc.), not hand-written. See `db/rls_policies.sql`.

## Adding a New Domain

When you add a new domain (e.g., a new feature category):

1. **Decide the permission type** it falls under, or request a new one from the team. See permission matrix above. (If it's owner-only, model it like cycle/pregnancy — no delegation, RLS restricts to the owner.)
2. **Create the RLS policy** in `db/rls_policies.sql`, reusing an existing generator (e.g. `create_shared_owner_policy(...)`) or a domain helper that resolves the permission through `can_access_user_data(...)`.
3. **Create the route** with `checkPermissionMiddleware(permissionType)` guarding delegated write endpoints.
4. **Test delegation** with `permissionUtils.test.ts` patterns — write a test proving that read/write is inherited or blocked correctly.

Example: symptom tracking is guarded by the `medications` permission (`routes/v2/symptomRoutes.ts`), and its RLS resolves through `has_medication_access(user_id)`.
