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

### ✅ RIGHT: Create the table AND the policy

```sql
CREATE TABLE user_symptom_logs (id UUID, user_id UUID, symptom TEXT);

ALTER TABLE user_symptom_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY symptom_logs_user_access ON user_symptom_logs
  USING (
    user_id = ANY(ARRAY[
      public.get_user_id(),
      public.get_authenticated_user_id()
    ])
    AND public.get_permission(
      public.get_user_id(),
      public.get_authenticated_user_id(),
      'checkin'  -- or the relevant permission type
    )
  );
```

**Reference:** `SparkyFitnessServer/db/rls_policies.sql` — every table there has both the CREATE and the ALTER/ENABLE/CREATE POLICY.

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
    queryKey: mealsQueryKey(),
  });
  queryClient.invalidateQueries({
    queryKey: mealDetailQueryKey(mealId),
  });
  queryClient.invalidateQueries({
    queryKey: dailySummaryQueryKey(date),
  });
}
```

**Pattern:** See `useInvalidateKeys.ts` in mobile and frontend for the standard key patterns.

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
import { apiCall } from '@/api/api'; // Frontend
// or
import { apiClient } from '@/services/api/apiClient'; // Mobile

const meals = await apiCall('/api/meals'); // Uses proxy, injects auth
```

**Pattern:** `apiCall()` handles base URL, auth headers, error toasts. See `SparkyFitnessFrontend/src/api/api.ts` and `SparkyFitnessMobile/src/services/api/apiClient.ts`.

---

## Cross-Package Contracts

### ❌ WRONG: Changing a shared schema and only updating the server

```typescript
// shared/src/schemas/api/Meal.api.zod.ts
export const MealSchema = z.object({
  name: z.string(),
  calories: z.number(),
  newField: z.string(), // ADDED
});

// SparkyFitnessServer/routes/mealRoutes.ts updated ✓
// SparkyFitnessFrontend — NOT UPDATED ✗
// SparkyFitnessMobile — NOT UPDATED ✗
```

**Result:** Type safety is broken, frontend request sends old contract, mobile gets unexpected field. CI doesn't catch it if packages are validated separately.

### ✅ RIGHT: Update all consumers in one commit

```
Commit: "Add meal.newField: shared schema + server route + frontend form + mobile UI"
- shared/src/schemas/api/Meal.api.zod.ts
- SparkyFitnessServer/routes/mealRoutes.ts + tests
- SparkyFitnessFrontend/src/pages/Meals/MealForm.tsx + hook
- SparkyFitnessMobile/src/screens/MealEditScreen.tsx + API
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
