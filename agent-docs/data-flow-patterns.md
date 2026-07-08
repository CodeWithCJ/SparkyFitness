# Data Flow Patterns

Quick reference for how data moves through the system. Follows this pattern across all domains:

## Frontend → Server → Database Flow

```
User Action (React component)
  ↓
API Hook (TanStack Query: useFoodsQuery, useMealsMutation, etc.)
  ↓
apiCall() helper (src/api/api.ts)
  ↓
Domain API client (src/api/Foods/foodService.ts, etc.)
  ↓
Server route (routes/v2/foodRoutes.ts or routes/foodRoutes.ts)
  ↓
Route-level validation (Zod schema for v2, express-validator for legacy)
  ↓
Service layer (services/foodService.ts, orchestration + business logic)
  ↓
Repository layer (models/foodRepository.ts, persistence only)
  ↓
Database query with RLS context (client.query() via getClient())
  ↓
RLS policy check (db/rls_policies.sql)
  ↓
Database returns rows
```

## Critical Points for Agents

1. **Shared schemas are the contract source of truth**:
   - `shared/src/schemas/database/<Table>.zod.ts` — table shape
   - `shared/src/schemas/api/<Name>.api.zod.ts` — request/response shape
   - Server Zod route schemas in `schemas/` reference shared schemas
   - Frontend and mobile must validate against the same shared schemas

2. **Permission checks happen at the route layer**:
   ```typescript
   app.post('/api/medications/log', checkPermissionMiddleware('medications'), medicationController);
   ```
   The middleware prevents unauthenticated or underdelegated users from reaching the handler.

3. **RLS is the final safety gate**:
   ```typescript
   const client = getClient(userId, authenticatedUserId); // Sets RLS context
   // Even if a user ID is forged in the query, RLS checks ownership
   const rows = await client.query('SELECT * FROM food_entries WHERE user_id = $1', [WRONG_USER_ID]);
   // Returns empty if WRONG_USER_ID is not accessible to userId
   ```
   If a route forgets `getClient()` or uses `getSystemClient()` incorrectly, RLS still catches it.

4. **Query caches must invalidate on mutations**:
   - React Query key: mutations invalidate related query keys
   - Example: create a food → invalidate `foodsQueryKey`, recent foods, search results
   - See `useInvalidateKeys.ts` for standard patterns

5. **Cross-package contract changes need coordination**:
   - Shared schema change → update server routes + mobile + frontend in same PR
   - API contract change → test in all three consumers
   - Don't deploy partial changes where shared is updated but server/frontend aren't aligned

## Auth Context

- `req.userId` — the actively-logged-in user (might be viewing another user's data via delegation)
- `req.authenticatedUserId` — the account owner (never changes during a session)
- `req.activeUserId` — alias for `req.userId`; used when acting as a delegate
- If family-access is active, `req.userId ≠ req.authenticatedUserId` and RLS checks both

## Testing Data Flows

1. **Route-level**: use `supertest` in Vitest; mock the database or use a test database
2. **RLS-level**: boot the server with test data, create a delegated session, query, verify row filtering
3. **Cross-package**: after shared schema changes, run `pnpm run validate` in server, frontend, and mobile

See `SparkyFitnessServer/tests/` for patterns.
