# Permission & Domain Architecture

This doc maps how access control works across the system. Understanding this prevents unsafe data access and RLS bugs.

## Permission Types

Three permission types control delegation in the family-sharing model:

- **`diary`** — read/write food, meal, exercise, health entries and measurements. Unlocks personal diary.
- **`checkin`** — read/write check-in measurements (weight, mood, custom measurements). Unlocks health tracking.
- **`medications`** — read/write medication logging, schedules, and symptom tracking.
- **`cycle`** — read/write menstrual cycle and pregnancy tracking.
- **`reports`** — read-only access to all analytics, trends, and reports. No write permission.

Permission inheritance: read-only access to reports requires at least one of `diary`, `checkin`, `medications`, or `cycle` (so delegated users see relevant trends). Write access to any specific permission does NOT inherit from reports-only access.

Test reference: `SparkyFitnessServer/tests/permissionUtils.test.ts` proves the inheritance matrix.

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

The magic: `getClient()` calls `public.set_app_context(userId, authenticatedUserId)`, which PostgreSQL RLS policies check on every query. The policies are in `SparkyFitnessServer/db/rls_policies.sql`.

## Adding a New Domain

When you add a new domain (e.g., a new feature category):

1. **Decide the permission type** it falls under, or request a new one from the team. See permission matrix above.
2. **Create RLS policy** in `db/rls_policies.sql` that checks the permission type via `public.get_permission(user_id, authenticated_user_id, permission_type)`.
3. **Create the route** with `checkPermissionMiddleware(permissionType)` guarding it.
4. **Test delegation** with `permissionUtils.test.ts` patterns — write a test proving that read/write is inherited or blocked correctly.

Example: if you add "symptom tracking" under `checkin` permission, an RLS policy checks `public.get_permission(..., 'checkin')` before allowing rows through.
