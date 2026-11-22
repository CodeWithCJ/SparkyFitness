import { ApiError } from '../../src/services/api/errors';
import { deleteWaterIntakeLogEntry } from '../../src/services/api/measurementsApi';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../src/offline/collections';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerWaterIntakeHandlers } from '../../src/offline/handlers/waterIntake';
import {
  listUnconfirmedOutbox,
  updateOutboxRow,
} from '../../src/offline/outbox';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import {
  queueWaterDrink,
  removeLatestDrinkOffline,
} from '../../src/offline/waterHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
  deleteWaterIntakeLogEntry: jest.fn(),
}));
const mockInvalidateWater = jest.fn();
const mockInvalidateFood = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateWaterIntake', () => ({
  invalidateWaterIntakeQueries: (...args: unknown[]) =>
    mockInvalidateWater(...args),
}));
jest.mock('../../src/hooks/invalidateFoodCache', () => ({
  invalidateFoodCache: (...args: unknown[]) => mockInvalidateFood(...args),
}));

const mockDelete = deleteWaterIntakeLogEntry as jest.MockedFunction<
  typeof deleteWaterIntakeLogEntry
>;
const DAY = '2026-11-21';
const KEY_A = '11111111-1111-4111-8111-111111111111';
const KEY_B = '22222222-2222-4222-8222-222222222222';
const logEntry = (
  id: string,
  loggedAt: string,
  extra: Record<string, unknown> = {}
) => ({
  id,
  user_id: 'u1',
  entry_date: DAY,
  water_ml: 250,
  container_id: 4,
  container_name: 'Glass',
  source: 'manual',
  created_at: loggedAt,
  logged_at: loggedAt,
  ...extra,
});

describe('taking a drink off with no connection', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    __clearOutboxHandlersForTests();
    registerWaterIntakeHandlers();
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.waterLog, [
      {
        key: DAY,
        payload: [
          logEntry('old', '2026-11-21T08:00:00Z'),
          logEntry('new', '2026-11-21T12:00:00Z', {
            water_ml: 120,
            food_entry_id: 'fe-1',
          }),
          logEntry('synced-by-watch', '2026-11-21T13:00:00Z', {
            source: 'healthkit',
          }),
        ],
      },
    ]);
  });

  afterEach(() => {
    __setOfflineDbForTests(null);
    db.close();
  });

  it('cancels a drink that is still waiting rather than asking the server', async () => {
    await queueWaterDrink(KEY_A, { entryDate: DAY, containerId: 4 });

    expect(await removeLatestDrinkOffline(DAY)).toBe('cancelled');
    expect(await listUnconfirmedOutbox(db, 's1')).toEqual([]);
  });

  it('leaves a waiting drink alone once its upload was tried: the server may have it', async () => {
    await queueWaterDrink(KEY_A, { entryDate: DAY, containerId: 4 });
    const [row] = await listUnconfirmedOutbox(db, 's1');
    await updateOutboxRow(db, row!.id, { attempts: 1 });

    expect(await removeLatestDrinkOffline(DAY)).toBe('busy');
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(1);
  });

  it('otherwise removes the latest manual drink the server has, by its id', async () => {
    expect(await removeLatestDrinkOffline(DAY)).toBe('queued');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.kind).toBe('water.remove');
    expect(row.payload).toEqual({
      entryDate: DAY,
      logEntryId: 'new',
      waterMl: 120,
      foodEntryId: 'fe-1',
    });
  });

  it('takes the next one off the next time, and says when nothing is left', async () => {
    expect(await removeLatestDrinkOffline(DAY)).toBe('queued');
    expect(await removeLatestDrinkOffline(DAY)).toBe('queued');
    expect(
      (await listUnconfirmedOutbox(db, 's1'))
        .map((row) => (row.payload as { logEntryId: string }).logEntryId)
        .sort()
    ).toEqual(['new', 'old']);
    expect(await removeLatestDrinkOffline(DAY)).toBe('none');
  });

  it('lowers the day by what it counted and hides the food entry it made', async () => {
    await removeLatestDrinkOffline(DAY);

    const waiting = await readWaitingForDay(DAY);

    expect(waiting.waterMl).toBe(-120);
    expect(waiting.deletedFoodEntryIds).toEqual(['fe-1']);
  });

  it('uploads by the drink’s id and refreshes, counting one already gone as done', async () => {
    await removeLatestDrinkOffline(DAY);
    mockDelete.mockResolvedValue(undefined);
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockDelete).toHaveBeenCalledWith('new');
    expect(mockInvalidateWater).toHaveBeenCalledWith({}, DAY);
    expect(mockInvalidateFood).toHaveBeenCalledWith({}, DAY);

    await removeLatestDrinkOffline(DAY);
    mockDelete.mockRejectedValue(new ApiError('gone', 404));
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
  });

  it('keeps the removal while the server is away', async () => {
    await removeLatestDrinkOffline(DAY);
    mockDelete.mockRejectedValue(new TypeError('Network request failed'));

    expect(await drainOutbox('manual')).toEqual({ synced: 0, remaining: 1 });
  });

  it('counts a linked container’s drink by its food, as the server will', async () => {
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.waterContainers, [
      {
        key: SINGLE_DOCUMENT_KEY,
        payload: [
          {
            id: 5,
            name: 'Latte',
            volume: 0,
            servings_per_container: 1,
            linked_food_id: 'food-9',
            hydration_factor: 0.9,
            linked_quantity: 1,
            linked_variant_water_ml: 200,
            linked_variant_serving_size: 250,
          },
        ],
      },
    ]);
    await queueWaterDrink(KEY_B, { entryDate: DAY, containerId: 5 });

    expect((await readWaitingForDay(DAY)).waterMl).toBeCloseTo(
      0.9 * ((200 * 1) / 250)
    );
  });
});
