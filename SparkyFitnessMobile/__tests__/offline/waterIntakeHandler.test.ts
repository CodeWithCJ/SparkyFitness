import { ApiError } from '../../src/services/api/errors';
import { changeWaterIntake } from '../../src/services/api/measurementsApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerWaterIntakeHandlers } from '../../src/offline/handlers/waterIntake';
import { getOutboxRow, listUnconfirmedOutbox } from '../../src/offline/outbox';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../src/offline/collections';
import { readWaitingForDay } from '../../src/offline/dailySummaryOverlay';
import {
  applyWaitingToRawData,
  buildDailySummary,
} from '../../src/services/dailySummaryService';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
  drainOutbox,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { queueWaterDrink } from '../../src/offline/waterHandOver';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  changeWaterIntake: jest.fn(),
}));
const mockInvalidate = jest.fn();
jest.mock('../../src/hooks/queryClient', () => ({ queryClient: {} }));
jest.mock('../../src/hooks/invalidateWaterIntake', () => ({
  invalidateWaterIntakeQueries: (...args: unknown[]) => mockInvalidate(...args),
}));

const mockChange = changeWaterIntake as jest.MockedFunction<
  typeof changeWaterIntake
>;

const PRESS_A = '11111111-1111-4111-8111-111111111111';
const PRESS_B = '22222222-2222-4222-8222-222222222222';

describe('water drink upload handler', () => {
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
  });

  afterEach(() => db.close());

  it('keeps two presses as two rows and sends each with its own key', async () => {
    await queueWaterDrink(PRESS_A, { entryDate: '2026-11-21', containerId: 4 });
    await queueWaterDrink(PRESS_B, { entryDate: '2026-11-21', containerId: 4 });
    expect(await listUnconfirmedOutbox(db, 's1')).toHaveLength(2);

    mockChange.mockResolvedValue({
      id: 'x',
      water_ml: 500,
      entry_date: '2026-11-21',
    });
    const summary = await drainOutbox('manual');

    expect(summary).toEqual({ synced: 2, remaining: 0 });
    // Drinks are independent, so the order they go in does not matter; each
    // carries its own press's key.
    const sent = mockChange.mock.calls.map(([args]) => args);
    expect(sent.map((args) => args.clientId).sort()).toEqual([
      PRESS_A,
      PRESS_B,
    ]);
    for (const args of sent) {
      expect(args).toMatchObject({
        entryDate: '2026-11-21',
        changeDrinks: 1,
        containerId: 4,
      });
    }
    expect(mockInvalidate).toHaveBeenCalledWith({}, '2026-11-21');
  });

  it('on a day with no saved summary, shows a food-linked drink as waiting and uploads it once after reconnecting', async () => {
    const DAY = '2026-11-18';
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
          },
        ],
      },
    ]);
    await putCacheRows(db, 's1', CACHE_COLLECTIONS.food, [
      {
        key: 'food-9',
        payload: {
          id: 'food-9',
          name: 'Latte',
          default_variant: {
            id: 'v9',
            serving_size: 1,
            serving_unit: 'cup',
            calories: 120,
          },
        },
      },
    ]);
    await queueWaterDrink(PRESS_A, { entryDate: DAY, containerId: 5 });

    // Offline, no saved summary: the day is built from what is waiting.
    const waiting = await readWaitingForDay(DAY);
    const summary = buildDailySummary(
      DAY,
      applyWaitingToRawData(
        {
          goals: {
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            dietary_fiber: 0,
          },
          foodEntries: [],
          exerciseEntries: [],
          waterIntake: { water_ml: 0 },
          stepCalories: 0,
        },
        waiting
      )
    );
    expect(summary.foodEntries).toHaveLength(1);
    expect(summary.calorieGoal).toBe(0);

    // Back online: it goes up once, under its key, and nothing is left waiting.
    mockChange.mockResolvedValue({ id: 'x', water_ml: 0, entry_date: DAY });
    expect(await drainOutbox('manual')).toEqual({ synced: 1, remaining: 0 });
    expect(mockChange).toHaveBeenCalledTimes(1);
    expect(mockChange.mock.calls[0][0]).toMatchObject({
      entryDate: DAY,
      containerId: 5,
      clientId: PRESS_A,
    });
    expect((await readWaitingForDay(DAY)).foodEntries).toEqual([]);
  });

  it('keeps the drink and stops the run while the server is away', async () => {
    await queueWaterDrink(PRESS_A, { entryDate: '2026-11-21', containerId: 4 });
    await queueWaterDrink(PRESS_B, { entryDate: '2026-11-21', containerId: 4 });
    mockChange.mockRejectedValue(new TypeError('Network request failed'));

    const summary = await drainOutbox('manual');

    expect(summary).toEqual({ synced: 0, remaining: 2 });
    // Oldest first, and the second drink was not tried behind the first.
    expect(mockChange).toHaveBeenCalledTimes(1);
    const [first] = await listUnconfirmedOutbox(db, 's1');
    expect(first.status).toBe('pending');
    expect(first.attempts).toBe(1);
  });

  it('sends the same key again after a lost answer', async () => {
    await queueWaterDrink(PRESS_A, { entryDate: '2026-11-21', containerId: 4 });
    mockChange.mockRejectedValueOnce(new ApiError('Bad gateway', 502));
    await drainOutbox('manual');
    mockChange.mockResolvedValue({
      id: 'x',
      water_ml: 250,
      entry_date: '2026-11-21',
    });
    await drainOutbox('manual');

    const keys = mockChange.mock.calls.map(([args]) => args.clientId);
    expect(keys).toEqual([PRESS_A, PRESS_A]);
  });

  it('parks a drink the server refuses for the person', async () => {
    await queueWaterDrink(PRESS_A, { entryDate: '2026-11-21', containerId: 4 });
    mockChange.mockRejectedValue(new ApiError('bad', 400));

    await drainOutbox('manual');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('failed');
    expect((await getOutboxRow(db, row.id))?.lastError).toContain('400');
  });

  it('asks the person to sign in again on a 401', async () => {
    await queueWaterDrink(PRESS_A, { entryDate: '2026-11-21', containerId: 4 });
    mockChange.mockRejectedValue(new ApiError('no', 401));

    await drainOutbox('manual');

    const [row] = await listUnconfirmedOutbox(db, 's1');
    expect(row.status).toBe('needs_sign_in');
  });
});
