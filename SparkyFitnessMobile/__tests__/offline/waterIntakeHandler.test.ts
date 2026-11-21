import { ApiError } from '../../src/services/api/errors';
import { changeWaterIntake } from '../../src/services/api/measurementsApi';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { __clearOutboxHandlersForTests } from '../../src/offline/handlers/registry';
import { registerWaterIntakeHandlers } from '../../src/offline/handlers/waterIntake';
import { getOutboxRow, listUnconfirmedOutbox } from '../../src/offline/outbox';
import { putCacheRows } from '../../src/offline/cacheStore';
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
