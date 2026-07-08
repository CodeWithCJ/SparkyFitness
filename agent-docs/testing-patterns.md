# Testing Patterns by Layer

Concrete examples for testing each layer of the application. Use these patterns when adding features or fixing bugs.

---

## Overview: What to Test Where

| Layer | Framework | What | How | Location |
|-------|-----------|------|-----|----------|
| **Route** (endpoint) | Vitest + supertest | Request/response, status codes, validation errors | Mock service layer, test HTTP contract | `SparkyFitnessServer/tests/<domain>Routes.test.ts` |
| **Service** (business logic) | Vitest | Logic, orchestration, error handling | Mock repository, test workflows | `SparkyFitnessServer/tests/<domain>Service.test.ts` |
| **Repository** (database) | Vitest + test DB | SQL queries, RLS filtering, data integrity | Use real test database via `getClient()` | `SparkyFitnessServer/tests/<domain>Repository.test.ts` |
| **RLS Policy** (permissions) | Vitest + test DB | Row filtering, permission inheritance, delegation | Boot server, create delegated session, query | `SparkyFitnessServer/tests/permission*.test.ts` |
| **React Query** (frontend) | Jest + @testing-library | Hook state, cache invalidation, error handling | Mock API responses, test query lifecycle | `SparkyFitnessFrontend/src/tests/hooks/<Domain>/` |
| **Component** (UI) | Jest + @testing-library | Rendering, user interactions, form submission | Mock API hooks, test user flows | `SparkyFitnessFrontend/src/tests/components/` |
| **Integration** (mobile) | Jest (React Native) | API calls, state updates, permissions | Mock API, test with real auth context | `SparkyFitnessMobile/__tests__/<Domain>/` |

---

## Server-Side Testing

### Route Tests (Endpoint Contract)

**What to test:** HTTP request/response, status codes, error handling, validation.

```typescript
// SparkyFitnessServer/tests/medicationRoutes.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../SparkyFitnessServer.js';
import { getSystemClient } from '../db/poolManager.js';

describe('Medication Routes', () => {
  let testUserId: string;
  let testToken: string;

  beforeEach(async () => {
    // Create test user in database
    const client = getSystemClient();
    const result = await client.query(
      `INSERT INTO user (id, email) VALUES ($1, $2) RETURNING id`,
      ['test-user-id', 'test@example.com']
    );
    testUserId = result.rows[0].id;
    client.release();

    // Get auth token (simulated)
    testToken = 'valid-test-token';
  });

  it('POST /api/medications/log should create a medication entry', async () => {
    const response = await request(app)
      .post('/api/medications/log')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        medicationId: 'med-123',
        dosage: '10mg',
        takenAt: '2026-07-08T10:00:00Z',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    expect(response.body.medicationId).toBe('med-123');
  });

  it('POST /api/medications/log should reject invalid dosage', async () => {
    const response = await request(app)
      .post('/api/medications/log')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        medicationId: 'med-123',
        dosage: '', // invalid
        takenAt: '2026-07-08T10:00:00Z',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('dosage');
  });

  it('GET /api/medications should return only user\'s medications', async () => {
    // Create a medication entry for the test user
    const client = getSystemClient();
    await client.query(
      `INSERT INTO medications (id, user_id, name) VALUES ($1, $2, $3)`,
      ['med-1', testUserId, 'Insulin']
    );
    client.release();

    const response = await request(app)
      .get('/api/medications')
      .set('Authorization', `Bearer ${testToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe('Insulin');
  });

  afterEach(async () => {
    // Clean up test data
    const client = getSystemClient();
    await client.query(`DELETE FROM medications WHERE user_id = $1`, [testUserId]);
    await client.query(`DELETE FROM user WHERE id = $1`, [testUserId]);
    client.release();
  });
});
```

**Key patterns:**
- Use `supertest` for HTTP testing
- Mock auth with test tokens
- Create test data in `beforeEach`, clean up in `afterEach`
- Test both success and error paths
- Verify response structure and status codes

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

### Repository Tests with RLS (Database Queries)

**What to test:** SQL queries, RLS filtering, data integrity.

```typescript
// SparkyFitnessServer/tests/medicationRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import medicationRepository from '../models/medicationRepository.js';
import { getClient, getSystemClient } from '../db/poolManager.js';

describe('Medication Repository (with RLS)', () => {
  let userId: string;
  let otherUserId: string;
  let medicationId: string;

  beforeEach(async () => {
    const systemClient = getSystemClient();

    // Create test users
    const users = await systemClient.query(
      `INSERT INTO user (id, email) VALUES ($1, $2), ($3, $4) RETURNING id`,
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

    // Grant family access: user 2 can read user 1's diary (which includes medications)
    await systemClient.query(
      `INSERT INTO family_access (owner_id, delegate_id, permission_type) VALUES ($1, $2, $3)`,
      [userId, otherUserId, 'diary']
    );
    systemClient.release();

    // Query as user 2 with delegation
    const client = getClient(userId, otherUserId); // active context = user 1, authenticated = user 2
    const result = await medicationRepository.findByUserId(userId, client);
    client.release();

    // Delegate with 'diary' permission should see medications
    expect(result).toHaveLength(1);
  });

  afterEach(async () => {
    const systemClient = getSystemClient();
    await systemClient.query(`DELETE FROM medications WHERE id = $1`, [medicationId]);
    await systemClient.query(`DELETE FROM family_access WHERE owner_id = $1`, [userId]);
    await systemClient.query(`DELETE FROM user WHERE id IN ($1, $2)`, [userId, otherUserId]);
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

```typescript
// SparkyFitnessFrontend/src/tests/hooks/Medications/useMedicationsLibrary.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import useMedicationsLibrary from '@/hooks/Medications/useMedicationsLibrary';

// Mock the API
vi.mock('@/api/Medications', () => ({
  fetchMedications: vi.fn(),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe('useMedicationsLibrary hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch medications on mount', async () => {
    const { fetchMedications } = await import('@/api/Medications');
    vi.mocked(fetchMedications).mockResolvedValue([
      { id: 'med-1', name: 'Insulin' },
      { id: 'med-2', name: 'Aspirin' },
    ]);

    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMedicationsLibrary(), { wrapper });

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
    const { fetchMedications } = await import('@/api/Medications');
    vi.mocked(fetchMedications).mockRejectedValue(new Error('API Error'));

    const wrapper = ({ children }: any) => (
      <QueryClientProvider client={createTestQueryClient()}>
        {children}
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMedicationsLibrary(), { wrapper });

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
// SparkyFitnessFrontend/src/tests/components/Medications/MedicationForm.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MedicationForm from '@/pages/Medications/MedicationForm';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';

vi.mock('@/api/Medications', () => ({
  createMedication: vi.fn(),
}));

describe('MedicationForm component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    const { createMedication } = await import('@/api/Medications');
    vi.mocked(createMedication).mockResolvedValue({ id: 'med-123', name: 'Insulin' });

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
      expect(createMedication).toHaveBeenCalledWith(
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

```typescript
// SparkyFitnessMobile/__tests__/Medications/medicationsApi.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { medicationsApi } from '@/services/api/medicationsApi';

vi.mock('@/services/api/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

describe('Medications API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log medication with correct payload', async () => {
    const { apiClient } = await import('@/services/api/apiClient');
    vi.mocked(apiClient.post).mockResolvedValue({ id: 'med-entry-123' });

    const result = await medicationsApi.logMedication({
      medicationId: 'med-1',
      dosage: '10mg',
      takenAt: new Date('2026-07-08T10:00:00Z'),
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/medications/log', {
      medicationId: 'med-1',
      dosage: '10mg',
      takenAt: expect.any(String),
    });
    expect(result.id).toBe('med-entry-123');
  });

  it('should handle auth errors', async () => {
    const { apiClient } = await import('@/services/api/apiClient');
    vi.mocked(apiClient.post).mockRejectedValue({
      status: 401,
      message: 'Unauthorized',
    });

    await expect(
      medicationsApi.logMedication({
        medicationId: 'med-1',
        dosage: '10mg',
        takenAt: new Date(),
      })
    ).rejects.toMatchObject({ status: 401 });
  });
});
```

**Key patterns:**
- Mock `apiClient` for HTTP calls
- Test both success and error responses
- Verify correct headers/payload sent
- Test timeout and retry behavior

---

## Summary: When to Use What

| Situation | Use | Avoid |
|-----------|-----|-------|
| Testing HTTP contract (status, response shape) | Route test (Vitest + supertest) | Service test (doesn't test HTTP) |
| Testing business logic | Service test (mock repo) | Route test (too coupled to HTTP) |
| Testing SQL queries & RLS | Repository test (real test DB) | Service test (can't verify RLS) |
| Testing React hook state | Hook test (renderHook) | Component test (too much setup) |
| Testing component rendering & interactions | Component test (render + userEvent) | Hook test (doesn't test UI) |
| Testing family access permissions | Permission test (getClient with delegation) | Route test (can't verify RLS filtering) |

---

## Running Tests

**Server:**
```bash
cd SparkyFitnessServer
pnpm test                                    # Run all tests
pnpm exec vitest run tests/medication*.test.ts  # Run specific tests
pnpm run test:coverage                       # Coverage report
```

**Frontend:**
```bash
cd SparkyFitnessFrontend
pnpm test                                    # Run all tests
pnpm test -- hooks/Medications/             # Run specific folder
```

**Mobile:**
```bash
cd SparkyFitnessMobile
pnpm test:run -- --watchman=false --runInBand  # Run all tests
pnpm exec jest --watchman=false __tests__/Medications/  # Specific tests
```
