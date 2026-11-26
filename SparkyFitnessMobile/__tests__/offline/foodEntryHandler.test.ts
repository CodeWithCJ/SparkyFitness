import { ApiError } from '../../src/services/api/errors';
import { createFoodEntry } from '../../src/services/api/foodEntriesApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerFoodEntryHandlers } from '../../src/offline/handlers/foodEntry';
import { listUnconfirmedOutbox } from '../../src/offline/outbox';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  isQueueableFoodEntry,
  queueFoodEntry,
} from '../../src/offline/foodEntryHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));
jest.mock('../../src/services/api/foodEntriesApi', () => ({
  createFoodEntry: jest.fn(),
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockCreate = createFoodEntry as jest.MockedFunction<
  typeof createFoodEntry
>;

const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';
const entry = {
  meal_type_id: 'meal-1',
  quantity: 2,
  unit: 'serving',
  entry_date: '2026-11-21',
  entry_time: '08:30',
  food_id: 'food-1',
  variant_id: 'variant-1',
};
const created = { id: 'e1' } as Awaited<ReturnType<typeof createFoodEntry>>;

describe('food entry upload handler', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerFoodEntryHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
  });

  afterEach(() => db.close());

  it('sends each entry once with its own key and refreshes the day', async () => {
    await queueFoodEntry(KEY_A, entry);
    await queueFoodEntry(KEY_B, { ...entry, quantity: 1 });
    mockCreate.mockResolvedValue(created);

    const summary = await drainOutbox('manual');

    expect(summary).toEqual({ synced: 2, remaining: 0 });
    const sent = mockCreate.mock.calls.map(([payload]) => payload);
    expect(sent.map((payload) => payload.client_id).sort()).toEqual([
      KEY_A,
      KEY_B,
    ]);
    // The entry date and time travel as the person logged them.
    for (const payload of sent) {
      expect(payload).toMatchObject({
        entry_date: '2026-11-21',
        entry_time: '08:30',
        food_id: 'food-1',
        variant_id: 'variant-1',
      });
    }
    expect(mockInvalidate).toHaveBeenCalledWith({}, '2026-11-21');
  });

  it('keeps the entry and stops the run while the server is away', async () => {
    await queueFoodEntry(KEY_A, entry);
    await queueFoodEntry(KEY_B, entry);
    mockCreate.mockRejectedValue(new TypeError('Network request failed'));

    expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 2 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('sends the same key again after a lost answer', async () => {
    await queueFoodEntry(KEY_A, entry);
    mockCreate.mockRejectedValueOnce(new ApiError('Bad gateway', 502));
    await drainOutbox('manual');
    mockCreate.mockResolvedValue(created);
    await drainOutbox('manual');

    expect(mockCreate.mock.calls.map(([payload]) => payload.client_id)).toEqual(
      [KEY_A, KEY_A]
    );
  });

  it.each([400, 404])(
    'parks an entry the server answers %i for',
    async (code) => {
      await queueFoodEntry(KEY_A, entry);
      mockCreate.mockRejectedValue(new ApiError('no', code));

      await drainOutbox('manual');

      const [row] = await listUnconfirmedOutbox(db, 's1');
      expect(row.status).toBe('failed');
      expect(row.lastError).toContain(String(code));
    }
  );

  it('waits for a sign-in on a 401', async () => {
    await queueFoodEntry(KEY_A, entry);
    mockCreate.mockRejectedValue(new ApiError('no', 401));

    await drainOutbox('manual');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('needs_sign_in');
  });
});

describe('isQueueableFoodEntry', () => {
  const base = {
    meal_type_id: 'm',
    quantity: 1,
    unit: 'serving',
    entry_date: '2026-11-21',
  };

  it('accepts a food and serving the server already has', () => {
    expect(
      isQueueableFoodEntry({ ...base, food_id: 'f', variant_id: 'v' })
    ).toBe(true);
  });
  it('accepts a quick-add that carries its own name and calories', () => {
    expect(
      isQueueableFoodEntry({ ...base, food_name: 'Snack', calories: 0 })
    ).toBe(true);
  });
  it('refuses a food without its serving, a meal and a nameless entry', () => {
    expect(isQueueableFoodEntry({ ...base, food_id: 'f' })).toBe(false);
    expect(isQueueableFoodEntry({ ...base, variant_id: 'v' })).toBe(false);
    expect(
      isQueueableFoodEntry({
        ...base,
        food_id: 'f',
        variant_id: 'v',
        meal_id: 'x',
      })
    ).toBe(false);
    expect(isQueueableFoodEntry({ ...base, calories: 100 })).toBe(false);
  });
});
