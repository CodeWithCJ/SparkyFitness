# Testing Patterns by Layer

Concrete examples for testing each layer of the application. Use these patterns when adding features or fixing bugs.

---

## Overview: What to Test Where

| Layer | Framework | What | How | Location |
|-------|-----------|------|-----|----------|
| **Route** (endpoint) | Vitest + supertest | Request/response, status codes, validation errors | Mock service layer, test HTTP contract | `SparkyFitnessServer/tests/<domain>Routes.test.ts` |
| **Service** (business logic) | Vitest | Logic, orchestration, error handling | Mock repository, test workflows | `SparkyFitnessServer/tests/<domain>Service.test.ts` |
| **Repository** (database) | Vitest | SQL query shape, mapping | Mock `poolManager` (`getClient`) with a fake client, assert queries | `SparkyFitnessServer/tests/<domain>Repository.test.ts` |
| **RLS Policy** (permissions) | Vitest + real test DB | Row filtering, permission inheritance, delegation | Connect via `getClient()` as the app role, seed delegated grants, query (gated on a live DB probe) | `SparkyFitnessServer/tests/rlsPermissionMatrix.integration.test.ts` |
| **React Query** (frontend) | Jest + @testing-library | Hook state, cache invalidation, error handling | Mock API module with `jest.mock`, test query lifecycle | `SparkyFitnessFrontend/src/tests/hooks/*.test.tsx` (flat) |
| **Component** (UI) | Jest + @testing-library | Rendering, user interactions, form submission | Mock API hooks, test user flows | `SparkyFitnessFrontend/src/tests/components/` |
| **Integration** (mobile) | Jest (jest-expo) | API calls, state updates, permissions | Mock `apiFetch`, test with real auth context | `SparkyFitnessMobile/__tests__/services/` (organized by layer) |

> Note: the server suite is **Vitest**; the frontend (`ts-jest`/jsdom) and mobile (`jest-expo`) suites are **Jest** — use `jest.mock`/`jest.fn`, not `vi.*`, in those. Most repository tests **mock** `poolManager`; the only real-database + RLS round-trip is `rlsPermissionMatrix.integration.test.ts`. The examples below are illustrative — open the referenced real test for the exact harness.

---

## Server-Side Testing

### Route Tests (Endpoint Contract)

**What to test:** HTTP request/response, status codes, error handling, validation.

Real route tests do **not** boot the whole server or touch a database. They build a throwaway `express()` app that mounts only the router under test, then `vi.mock(...)` the repository/service layer and the auth/permission middleware so the test isolates the HTTP contract. (Real reference: `SparkyFitnessServer/tests/medicationRoutes.test.ts`.)

```typescript
// SparkyFitnessServer/tests/medicationRoutes.test.ts (shape)
import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import medicationRepository from '../models/medicationRepository.js';
import medicationRoutes from '../routes/v2/medicationRoutes.js';

vi.mock('../models/medicationRepository.js');
// Guards are stubbed to pass-through so the test exercises the handler, not auth:
vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(() => (_req, _res, next) => next()),
}));
vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (_req, _res, next) => next(),
}));

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).userId = 'user-1'; next(); });
app.use('/api/v2/medications', medicationRoutes);

describe('Medication Routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('POST creates a medication entry', async () => {
    vi.mocked(medicationRepository.create).mockResolvedValue({ id: 'med-123' });

    const response = await request(app)
      .post('/api/v2/medications')
      .send({ name: 'Insulin', dosage: '10mg' });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('med-123');
  });

  it('rejects an invalid body with 400', async () => {
    const response = await request(app)
      .post('/api/v2/medications')
      .send({ dosage: '' }); // fails the Zod route schema
    expect(response.status).toBe(400);
  });
});
```

**Key patterns:**
- Mount only the router under test on a local `express()` app (don't import `SparkyFitnessServer.ts`)
- `vi.mock` the repository/service layer and the auth/permission middleware — no real DB, no real tokens
- v2 routes are mounted under `/api/v2/...`; auth is a `userId=` cookie in the real middleware (stubbed here)
- Test both the success path and Zod validation (400) errors

---

### Service Tests (Business Logic)

**What to test:** Logic, calculations, error handling, orchestration.

```typescript
// SparkyFitnessServer/tests/medicationService.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import medicationService from '../services/medicationService.js';
import medicationRepository from '../models/medicationRepository.js';

// Mock the repository
vi.mock('../models/medicationRepository.js');

describe('Medication Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should calculate next dose time correctly', async () => {
    const result = medicationService.calculateNextDoseTime({
      scheduleType: 'daily',
      lastDoseTime: new Date('2026-07-08T08:00:00Z'),
      dosageIntervalHours: 12,
    });

    expect(result).toEqual(new Date('2026-07-08T20:00:00Z'));
  });

  it('should validate dosage before creating entry', async () => {
    vi.spyOn(medicationRepository, 'create').mockResolvedValue({
      id: 'med-123',
      dosage: '10mg',
    });

    const result = await medicationService.logMedication(
      'user-1',
      { medicationId: 'med-1', dosage: '10mg', takenAt: new Date() }
    );

    expect(medicationRepository.create).toHaveBeenCalled();
    expect(result.dosage).toBe('10mg');
  });

  it('should reject invalid dosage', async () => {
    const invalidDosage = {
      medicationId: 'med-1',
      dosage: 'invalid-format',
      takenAt: new Date(),
    };

    await expect(
      medicationService.logMedication('user-1', invalidDosage)
    ).rejects.toThrow('Invalid dosage format');
  });

  it('should handle repository errors gracefully', async () => {
    vi.spyOn(medicationRepository, 'create').mockRejectedValue(
      new Error('Database error')
    );

    await expect(
      medicationService.logMedication('user-1', {
        medicationId: 'med-1',
        dosage: '10mg',
        takenAt: new Date(),
      })
    ).rejects.toThrow('Failed to log medication');
  });
});
```

**Key patterns:**
- Mock repository layer (don't call DB)
- Test pure logic, calculations, validation
- Test error cases with `.rejects.toThrow()`
- Verify repository was called with correct arguments

---

### Repository & RLS Tests (Database Queries)

There are **two** distinct kinds here:

1. **Plain repository tests** (`<domain>Repository.test.ts`) — the common case. They `vi.mock('../db/poolManager.js')` with a fake `{ query: vi.fn() }` client and assert the SQL/params and row-mapping. No database runs. (Reference: `tests/measurementRepository.test.ts`.)
2. **RLS integration test** (`rlsPermissionMatrix.integration.test.ts`) — the only real-database test. It connects as the non-superuser app role via `getClient()`, seeds users + delegated `family_access` grants, and asserts row filtering. It is **gated on a live DB probe** and skips when no database is reachable; it does **not** boot the server.

The RLS integration shape (note the real `family_access` column names and the quoted reserved `user` table):

```typescript
// SparkyFitnessServer/tests/rlsPermissionMatrix.integration.test.ts (shape)
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import medicationRepository from '../models/medicationRepository.js';
import { getClient, getSystemClient } from '../db/poolManager.js';

describe('Medication Repository (with RLS)', () => {
  let userId: string;
  let otherUserId: string;
  let medicationId: string;

  beforeEach(async () => {
    const systemClient = getSystemClient();

    // Create test users ("user" is a reserved word — must be quoted)
    const users = await systemClient.query(
      `INSERT INTO "user" (id, email) VALUES ($1, $2), ($3, $4) RETURNING id`,
      ['user-1', 'user1@test.com', 'user-2', 'user2@test.com']
    );
    userId = users.rows[0].id;
    otherUserId = users.rows[1].id;

    // Create medication for user 1
    const meds = await systemClient.query(
      `INSERT INTO medications (id, user_id, name) VALUES ($1, $2, $3) RETURNING id`,
      ['med-123', userId, 'Insulin']
    );
    medicationId = meds.rows[0].id;

    systemClient.release();
  });

  it('should return only user\'s medications (RLS enforced)', async () => {
    // Query as user 1
    const client = getClient(userId, userId);
    const result = await medicationRepository.findByUserId(userId, client);
    client.release();

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Insulin');
  });

  it('should NOT return other user\'s medications (RLS enforced)', async () => {
    // Query as user 2 requesting user 1's medications
    const client = getClient(otherUserId, otherUserId);
    const result = await medicationRepository.findByUserId(userId, client);
    client.release();

    // RLS policy should filter this — result should be empty
    expect(result).toHaveLength(0);
  });

  it('should allow family delegate to read with permission', async () => {
    const systemClient = getSystemClient();

    // Grant family access. Columns are owner_user_id / family_user_id, and the
    // permissions are a JSONB boolean map — not a permission_type string.
    await systemClient.query(
      `INSERT INTO family_access (owner_user_id, family_user_id, access_permissions, is_active)
       VALUES ($1, $2, $3, TRUE)`,
      [userId, otherUserId, { can_manage_medications: true }]
    );
    systemClient.release();

    // Query as user 2 with delegation
    const client = getClient(userId, otherUserId); // active context = user 1, authenticated = user 2
    const result = await medicationRepository.findByUserId(userId, client);
    client.release();

    // Delegate with can_manage_medications should see the owner's medications
    expect(result).toHaveLength(1);
  });

  afterEach(async () => {
    const systemClient = getSystemClient();
    await systemClient.query(`DELETE FROM medications WHERE id = $1`, [medicationId]);
    await systemClient.query(`DELETE FROM family_access WHERE owner_user_id = $1`, [userId]);
    await systemClient.query(`DELETE FROM "user" WHERE id IN ($1, $2)`, [userId, otherUserId]);
    systemClient.release();
  });
});
```

**Key patterns:**
- Use `getClient(userId, authenticatedUserId)` to set RLS context
- Test owner-only access
- Test family delegation with permissions
- Verify RLS filters correctly (user 2 should NOT see user 1's data)
- Use `getSystemClient()` only for setup/teardown

---

## Frontend Testing

### React Query Hook Tests

**What to test:** Hook state, cache invalidation, error handling.

Frontend tests use **Jest** (`ts-jest`/jsdom), so use `jest.mock`/`jest.mocked` — not `vi.*`. Hook tests are flat files in `src/tests/hooks/` with a `.tsx` extension (JSX won't compile under ts-jest in a `.ts` file). Real reference: `src/tests/hooks/useOnboarding.test.tsx`.

```typescript
// SparkyFitnessFrontend/src/tests/hooks/useMedications.test.tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { useMedications } from '@/hooks/useMedications';
import * as medicationsApi from '@/api/Medications/medications';

// Mock the API module (jest globals are ambient — no import needed)
jest.mock('@/api/Medications/medications');

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe('useMedications hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch medications on mount', async () => {
    jest.mocked(medicationsApi.fetchMedications).mockResolvedValue([
      { id: 'med-1', name: 'Insulin' },
      { id: 'med-2', name: 'Aspirin' },
    ]);

    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMedications(), { wrapper });

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    // Wait for data
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0].name).toBe('Insulin');
  });

  it('should handle fetch errors', async () => {
    jest.mocked(medicationsApi.fetchMedications).mockRejectedValue(new Error('API Error'));

    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMedications(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe('API Error');
  });
});
```

**Key patterns:**
- Wrap hooks with `QueryClientProvider` in tests
- Mock API calls
- Test loading/success/error states
- Use `waitFor` for async updates

---

### Component Tests

**What to test:** Rendering, user interactions, form submission.

```typescript
// SparkyFitnessFrontend/src/tests/components/MedicationForm.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MedicationForm from '@/pages/Medications/MedicationForm';
import * as medicationsApi from '@/api/Medications/medications';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

jest.mock('@/api/Medications/medications');

describe('MedicationForm component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render form fields', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MedicationForm />
      </QueryClientProvider>
    );

    expect(screen.getByLabelText(/medication name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/dosage/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('should submit form with valid data', async () => {
    jest.mocked(medicationsApi.createMedication).mockResolvedValue({ id: 'med-123', name: 'Insulin' });

    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    
    render(
      <QueryClientProvider client={queryClient}>
        <MedicationForm />
      </QueryClientProvider>
    );

    await user.type(screen.getByLabelText(/medication name/i), 'Insulin');
    await user.type(screen.getByLabelText(/dosage/i), '10mg');
    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(medicationsApi.createMedication).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Insulin', dosage: '10mg' })
      );
    });
  });

  it('should show validation error for empty name', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    
    render(
      <QueryClientProvider client={queryClient}>
        <MedicationForm />
      </QueryClientProvider>
    );

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByText(/medication name is required/i)).toBeInTheDocument();
    });
  });
});
```

**Key patterns:**
- Render component wrapped in providers (QueryClientProvider, etc.)
- Use `userEvent` for realistic user interactions
- Test both success and validation error paths
- Verify API was called with correct data

---

## Mobile Testing

### React Native Hook & API Tests

**What to test:** API calls, state updates, health data sync.

Mobile tests use **Jest** (`jest-expo`) and **relative** imports (the `@/` alias is configured but unused in `src/`). The HTTP helper export is `apiFetch` (there is no `apiClient` export). Tests are organized by layer under `__tests__/services/`, `__tests__/hooks/`, etc. (Medications is not implemented on mobile — this uses the real `mealsApi`.)

```typescript
// SparkyFitnessMobile/__tests__/services/mealsApi.test.ts
import { fetchMeals } from '../../src/services/api/mealsApi';
import * as apiClient from '../../src/services/api/apiClient';

jest.mock('../../src/services/api/apiClient');

describe('meals API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fetches meals via apiFetch', async () => {
    jest.mocked(apiClient.apiFetch).mockResolvedValue([{ id: 'meal-1' }]);

    const result = await fetchMeals();

    expect(apiClient.apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/meals') })
    );
    expect(result).toHaveLength(1);
  });

  it('propagates auth errors', async () => {
    jest.mocked(apiClient.apiFetch).mockRejectedValue({ status: 401 });
    await expect(fetchMeals()).rejects.toMatchObject({ status: 401 });
  });
});
```

**Key patterns:**
- Mock the `apiClient` module and assert on `apiFetch` (it takes an options object, not positional args)
- Use relative imports, `jest.mock`/`jest.mocked` — this is a Jest project, not Vitest
- Test both success and error responses

---

## Summary: When to Use What

| Situation | Use | Avoid |
|-----------|-----|-------|
| Testing HTTP contract (status, response shape) | Route test (Vitest + supertest) | Service test (doesn't test HTTP) |
| Testing business logic | Service test (mock repo) | Route test (too coupled to HTTP) |
| Testing SQL query shape | Repository test (mock `poolManager`) | Service test (wrong layer) |
| Testing RLS row filtering | `rlsPermissionMatrix.integration.test.ts` (real DB) | Service/route test (can't verify RLS) |
| Testing React hook state | Hook test (renderHook) | Component test (too much setup) |
| Testing component rendering & interactions | Component test (render + userEvent) | Hook test (doesn't test UI) |
| Testing family access permissions | RLS integration test (getClient with delegation) | Route test (can't verify RLS filtering) |

---

## Running Tests

**Server:**
```bash
cd SparkyFitnessServer
pnpm test                                    # Run all tests
pnpm exec vitest run tests/medication*.test.ts  # Run specific tests
pnpm run test:coverage                       # Coverage report
```

**Frontend (Jest):**
```bash
cd SparkyFitnessFrontend
pnpm test                                    # Run all tests
pnpm test -- useMedications                  # Filter by test name/path
```

**Mobile (Jest / jest-expo):**
```bash
cd SparkyFitnessMobile
pnpm test:run -- --watchman=false --runInBand    # Run all tests
pnpm exec jest --watchman=false __tests__/services  # A layer folder
```
