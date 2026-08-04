import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
import customNutrientService from '../services/customNutrientService.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../services/nutrientDisplayPreferenceService.js', () => ({
  default: { removeNutrientFromAllViews: vi.fn().mockResolvedValue(undefined) },
}));

// Deleting a custom nutrient must also scrub the supplement stores (medications.nutrients
// always; medication_entries.nutrients_snapshot only when history is purged) — mirroring how
// food_variants/food_entries are handled. Otherwise a deleted nutrient's supplement
// contributions linger and resurrect if the name is recreated.
describe('customNutrientService.deleteCustomNutrient — supplement JSONB cleanup', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();
  const id = uuidv4();
  const nutrientName = 'Boron';

  beforeEach(() => {
    mockClient = createMockDbClient();
    mockClient.query.mockImplementation((sql: string) =>
      String(sql).includes('SELECT name FROM user_custom_nutrients')
        ? Promise.resolve({ rows: [{ name: nutrientName }] })
        : Promise.resolve({ rows: [] })
    );
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => vi.clearAllMocks());

  const findQuery = (needle: string, needle2?: string) =>
    mockClient.query.mock.calls.find(
      (c: unknown[]) =>
        String(c[0]).includes(needle) &&
        (needle2 === undefined || String(c[0]).includes(needle2))
    );

  it('scrubs medications.nutrients (always) and medication_entries snapshots (history purge) when deleteAllHistory is true', async () => {
    const ok = await customNutrientService.deleteCustomNutrient(
      userId,
      id,
      true
    );
    expect(ok).toBe(true);

    const medDefs = findQuery('UPDATE medications', 'custom_nutrients');
    expect(medDefs).toBeTruthy();
    expect(medDefs![1]).toEqual([nutrientName, userId]);

    const medSnapshots = findQuery(
      'UPDATE medication_entries',
      'nutrients_snapshot'
    );
    expect(medSnapshots).toBeTruthy();
    expect(medSnapshots![1]).toEqual([nutrientName, userId]);
  });

  it('scrubs the medication definitions but NOT the immutable snapshots when deleteAllHistory is false', async () => {
    await customNutrientService.deleteCustomNutrient(userId, id, false);

    expect(findQuery('UPDATE medications', 'custom_nutrients')).toBeTruthy();
    expect(
      findQuery('UPDATE medication_entries', 'nutrients_snapshot')
    ).toBeUndefined();
  });
});
