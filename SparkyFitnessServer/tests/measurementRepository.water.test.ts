import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import measurementRepository from '../models/measurementRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

describe('measurementRepository.upsertWaterIntakeSamples', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findQueries = (
    fragment: string
  ): Array<{ text: string; values: any[] }> =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockClient.query.mock.calls
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((call: any[]) => ({ text: call[0], values: call[1] }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((call: any) => call.text.includes(fragment));

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{}] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('never issues a DELETE for keyed samples (no destructive window-replace)', async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
        loggedAt: '2026-08-03T15:00:00.000Z',
      },
    ]);

    const deletes = findQueries('DELETE FROM water_intake_entries');
    expect(deletes).toHaveLength(0);
  });

  // Unkeyed non-manual producers (older mobile apps sending one day-aggregate,
  // CSV imports) re-send the same rows every sync. Without replace-per-day
  // semantics each re-send would plain-INSERT a duplicate and inflate totals.
  it("replaces the day's unkeyed rows once per (date, source) for unkeyed non-manual samples", async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 1000,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: null,
      },
      {
        entryDate: '2026-08-03',
        waterMl: 500,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: null,
      },
    ]);

    const deletes = findQueries('DELETE FROM water_intake_entries');
    // One delete per (date, source) pair — not per sample — so both samples
    // in this batch survive the pre-pass. It clears keyed rows too: an
    // unkeyed day-aggregate is the client's full-day truth for the source,
    // and keyed leftovers beside it would double the total.
    expect(deletes).toHaveLength(1);
    expect(deletes[0].values).toEqual([
      'user-1',
      '2026-08-03',
      'health_connect',
    ]);
  });

  it('does not replace-per-day for unkeyed manual samples (additive insert)', async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'manual',
        source: 'manual',
        sourceId: null,
      },
    ]);

    const deletes = findQueries('DELETE FROM water_intake_entries');
    expect(deletes).toHaveLength(0);
  });

  it('guards adoption so an already-keyed source_id cannot be stamped onto a second unkeyed row', async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
      },
    ]);

    const adoptions = findQueries('SET source_id = $1');
    expect(adoptions).toHaveLength(1);
    expect(adoptions[0].text).toContain('NOT EXISTS');
    expect(adoptions[0].text).toContain('source_id = $1');
  });

  it('upserts a keyed sample using ON CONFLICT (user_id, source, source_id) when no legacy row to adopt', async () => {
    mockClient.query.mockImplementation((text: string) => {
      if (text.includes('SET source_id = $1')) {
        return Promise.resolve({ rows: [] }); // nothing to adopt
      }
      return Promise.resolve({ rows: [{}] });
    });

    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
        loggedAt: '2026-08-03T15:00:00.000Z',
      },
    ]);

    const inserts = findQueries('ON CONFLICT (user_id, source, source_id)');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toContain('hc-record-1');
  });

  // The insert VALUES fill a null loggedAt with NOW(); the conflict update
  // must not copy that via EXCLUDED.logged_at or a timestamp-less re-sync
  // would stamp the retry time over the entry's original logged_at.
  it('preserves the stored logged_at when a keyed re-sync has no timestamp', async () => {
    mockClient.query.mockImplementation((text: string) => {
      if (text.includes('SET source_id = $1')) {
        return Promise.resolve({ rows: [] }); // nothing to adopt
      }
      return Promise.resolve({ rows: [{}] });
    });

    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
        loggedAt: null,
      },
    ]);

    const inserts = findQueries('ON CONFLICT (user_id, source, source_id)');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].text).toContain(
      'logged_at = COALESCE($9, water_intake_entries.logged_at)'
    );
    expect(inserts[0].values[8]).toBeNull();
  });

  it('adopts a pre-existing unkeyed row instead of inserting a duplicate', async () => {
    mockClient.query.mockImplementation((text: string) => {
      if (text.includes('SET source_id = $1')) {
        return Promise.resolve({
          rows: [{ id: 'legacy-row-1', source_id: 'hc-record-1' }],
        });
      }
      return Promise.resolve({ rows: [{}] });
    });

    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
      },
    ]);

    const adoptions = findQueries('SET source_id = $1');
    expect(adoptions).toHaveLength(1);
    expect(adoptions[0].values).toEqual([
      'hc-record-1',
      250,
      null,
      'Health Connect',
      null,
      'user-1',
      'health_connect',
      '2026-08-03',
    ]);
    // No fresh INSERT..ON CONFLICT should run once the legacy row was adopted.
    const inserts = findQueries('ON CONFLICT (user_id, source, source_id)');
    expect(inserts).toHaveLength(0);
  });

  it('falls back to a plain insert (no conflict target) when sourceId is missing', async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'manual',
        source: 'manual',
        sourceId: null,
      },
    ]);

    const keyedInserts = findQueries(
      'ON CONFLICT (user_id, source, source_id)'
    );
    expect(keyedInserts).toHaveLength(0);
  });

  it('recomputes the water_intake aggregate only for dates in this batch', async () => {
    await measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
      {
        entryDate: '2026-08-03',
        waterMl: 250,
        containerName: 'Health Connect',
        source: 'health_connect',
        sourceId: 'hc-record-1',
      },
    ]);

    const sums = findQueries('COALESCE(SUM(water_ml)');
    expect(sums).toHaveLength(1);
    expect(sums[0].values).toEqual(['user-1', '2026-08-03', 'health_connect']);
  });

  it('rolls back the transaction if a write fails', async () => {
    mockClient.query.mockImplementation((text: string) => {
      if (text.includes('BEGIN')) return Promise.resolve();
      if (text.includes('SET source_id = $1'))
        return Promise.resolve({ rows: [] });
      if (text.includes('INSERT INTO water_intake_entries')) {
        return Promise.reject(new Error('boom'));
      }
      return Promise.resolve({ rows: [{}] });
    });

    await expect(
      measurementRepository.upsertWaterIntakeSamples('user-1', 'user-1', [
        {
          entryDate: '2026-08-03',
          waterMl: 250,
          containerName: 'Health Connect',
          source: 'health_connect',
          sourceId: 'hc-record-1',
        },
      ])
    ).rejects.toThrow('boom');

    const rollbacks = findQueries('ROLLBACK');
    expect(rollbacks).toHaveLength(1);
  });
});

describe('measurementRepository.incrementWaterData', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ water_ml: 0 }] }),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clamps the INSERT-path value so a decrement with no existing row cannot go negative', async () => {
    await measurementRepository.incrementWaterData(
      'user-1',
      'user-1',
      -500,
      '2026-08-03',
      'manual'
    );

    const call = mockClient.query.mock.calls[0];
    expect(call[0]).toContain('GREATEST(0::numeric, $3::numeric)');
  });

  // Regression: wrapping $3 in GREATEST(0, $3) made Postgres infer $3 as
  // integer from the untyped 0 literal (previously it was inferred as numeric
  // from the water_ml target column), so fractional ml amounts — which arise
  // whenever a container's volume / servings_per_container isn't a whole
  // number — failed with "invalid input syntax for type integer".
  it('casts the clamped value to numeric so fractional ml amounts are accepted', async () => {
    await measurementRepository.incrementWaterData(
      'user-1',
      'user-1',
      59.147000000000006,
      '2026-08-03',
      'manual'
    );

    const [text, values] = mockClient.query.mock.calls[0];
    // Both $3 occurrences must be explicitly numeric-cast; an untyped 0
    // literal anywhere alongside $3 re-triggers integer inference.
    expect(text).not.toMatch(/GREATEST\(0,/);
    expect(text).toContain('GREATEST(0::numeric, $3::numeric)');
    expect(text).toContain(
      'GREATEST(0::numeric, water_intake.water_ml + $3::numeric)'
    );
    expect(values[2]).toBe(59.147000000000006);
  });
});
