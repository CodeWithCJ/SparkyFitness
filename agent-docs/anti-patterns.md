# Anti-Patterns & Common Pitfalls

Mistakes that burn tokens in code review. Avoid these and you'll ship faster.

## Server Data Access

### ❌ WRONG: Using getSystemClient() for user queries

```typescript
const client = getSystemClient(); // BYPASSES RLS!
const meals = await client.query('SELECT * FROM foods WHERE user_id = $1', [userId]);
```

**Why it's wrong:** RLS is completely bypassed. If userId is forged, the query succeeds anyway. Family-access delegation is ignored.

### ✅ RIGHT: Use getClient() to enforce RLS

```typescript
const client = getClient(userId, authenticatedUserId); // Sets RLS context
try {
  const meals = await client.query('SELECT * FROM foods WHERE user_id = $1', [userId]);
} finally {
  client.release();
}
```

**Exception:** `getSystemClient()` is only for startup, migrations, admin, and RLS policy management. All user data queries use `getClient()`.

---

## Migration & RLS

### ❌ WRONG: Creating a table without RLS policies

```sql
CREATE TABLE user_symptom_logs (id UUID, user_id UUID, symptom TEXT);
-- No RLS policy!
```

**Result:** Any authenticated user can query any other user's symptoms. Family-access delegates bypass their permission checks.

### ✅ RIGHT: Enable RLS and reuse a policy generator

The table is created by a migration; `rls_policies.sql` enables RLS and applies a policy via a generator (not hand-written `USING` clauses):

```sql
-- In the migration: CREATE TABLE user_symptom_logs (...);

-- In rls_policies.sql:
ALTER TABLE user_symptom_logs ENABLE ROW LEVEL SECURITY;

-- Symptom data is delegated under the `medications` permission, so reuse that generator.
-- It builds read/write policies backed by has_medication_read_access() / has_medication_access().
SELECT create_medication_policy('user_symptom_logs');
```

Generators by domain: `create_owner_policy` (owner-only), `create_shared_owner_policy` (owner-write/delegate-read), `create_diary_policy`, `create_checkin_policy`, `create_medication_policy`, `create_library_policy`. They resolve delegation via `can_access_user_data(...)` / `has_*_access(user_id)` reading `current_user_id()`/`authenticated_user_id()` — there is no `get_user_id`/`get_authenticated_user_id`/`get_permission`.

**Reference:** `db/rls_policies.sql` — `CREATE TABLE` lives in migrations; this file holds `ENABLE ROW LEVEL SECURITY` + `create_*_policy(...)` calls.

---

## React Query (Frontend & Mobile)

### ❌ WRONG: Mutation doesn't invalidate the cache

```typescript
async function deleteMeal(mealId: string) {
  await apiCall(`/api/meals/${mealId}`, { method: 'DELETE' });
  // Cache still shows the deleted meal!
}
```

**Result:** User sees stale data, confusion, requests get sent to deleted endpoints.

### ✅ RIGHT: Mutation invalidates related queries

```typescript
async function deleteMeal(mealId: string) {
  await apiCall(`/api/meals/${mealId}`, { method: 'DELETE' });
  
  queryClient.invalidateQueries({
    queryKey: mealsQueryKey, // a const array, not a function
  });
  queryClient.invalidateQueries({
    queryKey: mealDetailQueryKey(mealId), // parameterized keys are functions
  });
  queryClient.invalidateQueries({
    queryKey: dailySummaryQueryKey(date),
  });
}
```

**Pattern:** Query keys live in `SparkyFitnessMobile/src/hooks/queryKeys.ts` (mobile) and `SparkyFitnessFrontend/src/api/keys/*.ts` (frontend) — note some are plain const arrays and some are functions. The frontend also exposes invalidation hooks in `src/hooks/useInvalidateKeys.ts` (`useMealInvalidation`, `useDiaryInvalidation`, …).

---

## Dates & Timezones

### ❌ WRONG: Using toISOString().split('T')[0] for user-facing dates

```typescript
const today = new Date().toISOString().split('T')[0]; // "2026-07-08"
// But if the user is in UTC-8 and it's 23:00 on July 7, this gives "2026-07-08" (wrong day!)
```

**Result:** Date boundaries are wrong. Fasting logs, measurements, food entries end up in the wrong calendar day. Hard to debug.

### ✅ RIGHT: Use shared timezone helpers

```typescript
import { todayInZone, instantToDay } from '@workspace/shared';

const userTz = 'America/Los_Angeles';
const today = todayInZone(userTz); // "2026-07-07" (correct calendar day)
```

**Pattern:** Boot timezone early, fetch user's IANA timezone from `GET /api/daily-summary` or `GET /api/preferences`, use shared helpers. See `SparkyFitnessServer/utils/timezoneLoader.ts` and `shared/src/utils/` for the full suite.

---

## Architecture & Layering

### ❌ WRONG: Business logic in the route handler

```typescript
app.post('/api/meals/:mealId/copy', (req, res) => {
  // Validate
  // Query the database
  // Transform the data
  // Invalidate caches
  // Return
  // 200 lines in one function
});
```

**Result:** Hard to test, logic is duplicated if used from another route, service layer patterns are broken.

### ✅ RIGHT: Route handler delegates to service

```typescript
app.post('/api/meals/:mealId/copy', async (req, res) => {
  const copySchema = z.object({ targetDate: z.string() });
  const { targetDate } = copySchema.parse(req.body);
  const meal = await mealService.copyMeal(req.userId, req.mealId, targetDate);
  res.json(meal);
});
```

**Pattern:** Routes validate and route, services orchestrate, repositories persist. See any domain service/repository pair in `SparkyFitnessServer/services/` and `models/` for examples.

---

## Frontend & Mobile

### ❌ WRONG: Hardcoded API URLs or auth headers

```typescript
const response = await fetch('http://localhost:3010/api/meals');
```

**Result:** Won't work in production, doesn't use the proxy, breaks in self-hosted environments.

### ✅ RIGHT: Use the API helper with auth injection

```typescript
// Frontend
import { apiCall } from '@/api/api';
const meals = await apiCall('/api/meals'); // Uses proxy, injects auth

// Mobile — the export is `apiFetch` (there is no `apiClient` export), and mobile uses relative imports
import { apiFetch } from '../services/api/apiClient';
const meals = await apiFetch<Meal[]>({ url: '/api/meals' });
```

**Pattern:** the helper handles base URL, auth headers, and errors. See `SparkyFitnessFrontend/src/api/api.ts` (`apiCall`) and `SparkyFitnessMobile/src/services/api/apiClient.ts` (`apiFetch`).

---

## Cross-Package Contracts

### ❌ WRONG: Changing a shared schema and only updating the server

```typescript
// shared/src/schemas/api/FoodEntries.api.zod.ts
export const foodEntryResponseSchema = z.object({
  // ...existing fields...
  newField: z.string(), // ADDED
});

// SparkyFitnessServer/routes/foodEntryRoutes.ts updated ✓
// SparkyFitnessFrontend — NOT UPDATED ✗
// SparkyFitnessMobile — NOT UPDATED ✗
```

**Result:** Type safety is broken, frontend request sends old contract, mobile gets unexpected field. CI doesn't catch it if packages are validated separately.

### ✅ RIGHT: Update all consumers in one commit

```
Commit: "Add foodEntry.newField: shared schema + server route + frontend + mobile"
- shared/src/schemas/api/FoodEntries.api.zod.ts
- SparkyFitnessServer/routes/foodEntryRoutes.ts + tests
- SparkyFitnessFrontend/src/api/Diary/ + the consuming page/hook
- SparkyFitnessMobile/src/services/api/foodEntriesApi.ts + the consuming screen
- Run `pnpm run validate` in all three packages before pushing
```

**Pattern:** Check the shared schema change checklist: does it need server, frontend, mobile validation? If yes, they're all in one PR.

---

## What To Do Instead

- **Need to customize behavior per package?** Put the logic in the service layer, not the schema.
- **Need parallel abstractions?** You don't. The domain → route → service → repository pattern covers every case.
- **Need to bypass RLS to debug?** Use `getSystemClient()` in a test, not in production code. CI runs, so production RLS stays enforced.
- **Date logic needs timezone awareness?** The helper already exists. Use it.
- **Cache invalidation is complex?** You're probably doing too much in one mutation. Break it up and use query key hierarchies.

Read the architecture docs before writing, test locally before pushing, and you'll avoid these all.
