import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFoodDeletionImpact } from '../models/food.js';
import { getClient, getSystemClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const AUTH_USER = 'me-1';
const FOOD_ID = 'food-1';
const FOOD_OWNER = 'someone-else-2'; // != AUTH_USER, so the family-access block is skipped

const zeroCount = { rows: [{ count: '0' }] };

// The RLS-scoped client only ever sees the current user's own rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function currentUserQuery(sql: string): any {
  if (sql.includes('food_entries')) {
    return {
      rows: [
        { id: 'mine-1', entry_date: '2026-07-01', meal_type_id: 'breakfast' },
      ],
    };
  }
  return zeroCount;
}

// The system client bypasses RLS — it can see other users' rows, which must be
// counted but never returned to the caller.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function systemQuery(sql: string): any {
  if (sql.includes('shared_with_public')) {
    return { rows: [{ shared_with_public: false }] };
  }
  if (sql.includes('user_id FROM foods')) {
    return { rows: [{ user_id: FOOD_OWNER }] };
  }
  if (sql.includes('food_entries')) {
    return {
      rows: [
        { id: 'other-1', entry_date: '2026-06-01', meal_type_id: 'lunch' },
        { id: 'other-2', entry_date: '2026-06-02', meal_type_id: 'dinner' },
      ],
    };
  }
  return zeroCount;
}

describe('getFoodDeletionImpact', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let systemClient: any;

  beforeEach(() => {
    client = {
      query: vi.fn((sql: string) => Promise.resolve(currentUserQuery(sql))),
      release: vi.fn(),
    };
    systemClient = {
      query: vi.fn((sql: string) => Promise.resolve(systemQuery(sql))),
      release: vi.fn(),
    };
    // @ts-expect-error mocked function
    getClient.mockResolvedValue(client);
    // @ts-expect-error mocked function
    getSystemClient.mockResolvedValue(systemClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("never returns other users' diary rows, but still counts them", async () => {
    const impact = await getFoodDeletionImpact(FOOD_ID, AUTH_USER);

    // Only the caller's own entry is returned; no other-user rows leak.
    expect(impact.foodEntries).toHaveLength(1);
    expect(impact.foodEntries[0].id).toBe('mine-1');
    expect(
      impact.foodEntries.some(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => e.id === 'other-1' || e.id === 'other-2'
      )
    ).toBe(false);
    expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      impact.foodEntries.every((e: any) => e.isCurrentUser === true)
    ).toBe(true);

    // The aggregate impact still reflects the other users' usage.
    expect(impact.foodEntriesCount).toBe(3);
    expect(impact.otherUserReferences).toBe(2);
    expect(impact.currentUserReferences).toBe(1);
  });
});
