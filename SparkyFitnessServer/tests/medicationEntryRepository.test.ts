import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';
import medicationEntryRepository from '../models/medicationEntryRepository.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('medicationEntryRepository.createEntry — nutrient snapshot', () => {
  let mockClient: MockDbClient;
  const userId = uuidv4();
  const medicationId = uuidv4();
  const entryId = uuidv4();

  beforeEach(() => {
    mockClient = createMockDbClient();
    mockClient.query.mockReset();
    vi.mocked(getClient).mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('snapshots the medication nutrients for a supplement entry', async () => {
    const nutrients = { calcium: 500, custom_nutrients: { boron: 3 } };
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Cal-Mag',
            display_name: 'Cal-Mag',
            dose_amount: 1,
            dose_unit: 'tablet',
            is_supplement: true,
            nutrients,
          },
        ],
      }) // medication lookup
      .mockResolvedValueOnce({
        rows: [{ id: entryId, nutrients_snapshot: nutrients }],
      }); // INSERT

    const result = await medicationEntryRepository.createEntry(userId, {
      medication_id: medicationId,
      status: 'taken',
    });

    // The med lookup must fetch is_supplement + nutrients.
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('m.is_supplement, m.nutrients'),
      [medicationId, userId, null]
    );
    // The INSERT must persist the snapshot as a JSON string in the last param.
    const insertCall = mockClient.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO medication_entries')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![0]).toContain('nutrients_snapshot');
    const insertParams = insertCall![1] as unknown[];
    expect(insertParams[insertParams.length - 1]).toBe(
      JSON.stringify(nutrients)
    );
    expect(result.id).toBe(entryId);
  });

  it('leaves nutrients_snapshot NULL for a non-supplement entry', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Ozempic',
            display_name: 'Ozempic',
            dose_amount: 0.5,
            dose_unit: 'mg',
            is_supplement: false,
            nutrients: {},
          },
        ],
      }) // medication lookup
      .mockResolvedValueOnce({ rows: [{ id: entryId }] }); // INSERT

    await medicationEntryRepository.createEntry(userId, {
      medication_id: medicationId,
      status: 'taken',
    });

    const insertCall = mockClient.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO medication_entries')
    );
    const insertParams = insertCall![1] as unknown[];
    expect(insertParams[insertParams.length - 1]).toBeNull();
  });

  it('forces a supplement dose_amount_snapshot from the medication, ignoring a client-supplied value', async () => {
    const nutrients = { calcium: 500 };
    mockClient.query
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Cal-Mag',
            display_name: 'Cal-Mag',
            dose_amount: 2, // authoritative COALESCE(ms.dose_amount, m.dose_amount)
            dose_unit: 'dose',
            is_supplement: true,
            nutrients,
          },
        ],
      }) // medication lookup
      .mockResolvedValueOnce({
        rows: [{ id: entryId, nutrients_snapshot: nutrients }],
      }); // INSERT

    await medicationEntryRepository.createEntry(userId, {
      medication_id: medicationId,
      status: 'taken',
      dose_amount_snapshot: 99, // hostile/stale client value — must be ignored for supplements
    });

    const insertCall = mockClient.query.mock.calls.find((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO medication_entries')
    );
    const insertParams = insertCall![1] as unknown[];
    // dose_amount_snapshot is the 9th INSERT column (index 8).
    expect(insertParams[8]).toBe(2);
  });
});
