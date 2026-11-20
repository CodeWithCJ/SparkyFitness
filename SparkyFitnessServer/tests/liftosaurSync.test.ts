import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import liftosaurService from '../integrations/liftosaur/liftosaurService.js';
import liftosaurDataProcessor from '../integrations/liftosaur/liftosaurDataProcessor.js';
import * as measurementsService from '../integrations/liftosaur/liftosaurMeasurementsService.js';
import { getSystemClient } from '../db/poolManager.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../security/encryption.js', () => ({
  decrypt: vi.fn().mockResolvedValue('lftsk_mock_api_key'),
  ENCRYPTION_KEY: 'mock_key',
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../integrations/liftosaur/liftosaurDataProcessor.js', () => ({
  default: {
    processLiftosaurWorkouts: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../integrations/liftosaur/liftosaurMeasurementsService.js', () => ({
  importMeasurementsFromLiftosaur: vi
    .fn()
    .mockResolvedValue({ imported: 3, failedKeys: [], failedRecords: 0 }),
  parseLiftosaurValue: vi.fn(),
}));

describe('liftosaurSync', () => {
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: 'provider-123',
            is_active: true,
            encrypted_app_key: 'enc_key',
            app_key_iv: 'iv',
            app_key_tag: 'tag',
          },
        ],
      }),
      release: vi.fn(),
    };
    vi.mocked(getSystemClient).mockResolvedValue(mockClient);
  });

  it('coordinates synchronization for workouts and measurements with detailed counts', async () => {
    const mockedAxiosGet = vi.mocked(axios.get);
    mockedAxiosGet.mockResolvedValueOnce({
      data: {
        data: {
          records: [
            {
              id: 1,
              text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
            },
          ],
          hasMore: false,
        },
      },
    });

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    expect(result.success).toBe(true);
    expect(result.workoutsImported).toBe(1);
    expect(result.measurementsImported).toBe(3);
    expect(result.processedCount).toBe(4); // 1 + 3

    expect(
      liftosaurDataProcessor.processLiftosaurWorkouts
    ).toHaveBeenCalledTimes(1);
    // Muscles are looked up through a resolver bound to the user's API key.
    expect(
      vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
        .calls[0]![5]
    ).toEqual(expect.any(Function));
    expect(
      measurementsService.importMeasurementsFromLiftosaur
    ).toHaveBeenCalledTimes(1);

    // Verify last_sync_at update
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE id = $1 AND user_id = $2'),
      ['provider-123', 'user-1']
    );
  });

  it('limits an incremental sync to the last 7 days and keys workouts by record id', async () => {
    const before = Date.now();
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          records: [
            {
              id: 1772359200123,
              text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
            },
          ],
          hasMore: false,
        },
      },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    const params = vi.mocked(axios.get).mock.calls[0]![1]!.params as {
      startDate?: string;
    };
    // Whole days: from the start of the (UTC, here) day 7 days ago.
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const startDay = new Date(before - sevenDaysMs).toISOString().slice(0, 10);
    expect(params.startDate).toBe(`${startDay}T00:00:00.000Z`);

    const call = vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
      .calls[0]!;
    expect(call[2][0]!.id).toBe(1772359200123);
    // Reconciles the whole window, today included.
    expect(call[4]).toEqual({
      startDate: startDay,
      endDate: new Date().toISOString().slice(0, 10),
    });
  });

  it('counts the window in calendar days across a clock change', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 2 Nov 2026, 23:30 in New York, the day after clocks went back.
    vi.setSystemTime(new Date('2026-11-03T04:30:00Z'));
    vi.mocked(loadUserTimezone).mockResolvedValueOnce('America/New_York');
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });
    try {
      await liftosaurService.syncLiftosaurData(
        'user-1',
        'user-1',
        false,
        'provider-123'
      );
    } finally {
      vi.useRealTimers();
    }

    const params = vi.mocked(axios.get).mock.calls[0]![1]!.params as {
      startDate?: string;
    };
    // Start of 26 Oct in New York (still on daylight time, UTC-4).
    expect(params.startDate).toBe('2026-10-26T04:00:00.000Z');
    expect(
      vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
        .calls[0]![4]
    ).toEqual({ startDate: '2026-10-26', endDate: '2026-11-02' });
  });

  it('reconciles the window even when Liftosaur returns no workouts', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    const call = vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
      .calls[0]!;
    expect(call[2]).toEqual([]);
    expect(call[4]).toEqual(
      expect.objectContaining({ endDate: expect.any(String) })
    );
  });

  it('deletes nothing when a record does not parse', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          records: [{ id: 3, text: 'not a liftohistory record' }],
          hasMore: false,
        },
      },
    });

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    // Nothing parsed and no cleanup allowed: the processor is not called.
    expect(
      liftosaurDataProcessor.processLiftosaurWorkouts
    ).not.toHaveBeenCalled();
    expect(result.skippedCount).toBeGreaterThan(0);
  });

  it('imports the parsed workouts but deletes nothing when another record fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          records: [
            {
              id: 1,
              text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
            },
            { id: 2, text: 'garbled' },
          ],
          hasMore: false,
        },
      },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    const call = vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
      .calls[0]!;
    expect(call[2]).toHaveLength(1);
    expect(call[4]).toBeNull();
  });

  it('imports one workout per record and deletes nothing when a record holds more', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          records: [
            {
              id: 4,
              text: [
                '2026-03-01T10:00:00Z / exercises: {',
                '  Squat / 3x5 100kg',
                '}',
                '2026-03-02T10:00:00Z / exercises: {',
                '  Curl / 3x10 10kg',
                '}',
              ].join('\n'),
            },
          ],
          hasMore: false,
        },
      },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    const call = vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
      .calls[0]!;
    expect(call[2]).toHaveLength(1);
    expect(call[2][0]!.id).toBe(4);
    expect(call[4]).toBeNull();
  });

  it('reconciles exactly the requested days of a Sync Range', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123',
      '2026-03-01',
      '2026-03-05'
    );

    expect(
      vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
        .calls[0]![4]
    ).toEqual({ startDate: '2026-03-01', endDate: '2026-03-05' });
  });

  it('sends no startDate on a full sync', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    const params = vi.mocked(axios.get).mock.calls[0]![1]!.params as {
      startDate?: string;
    };
    expect(params.startDate).toBeUndefined();
    // No window and nothing fetched: nothing to reconcile, no processing.
    expect(
      liftosaurDataProcessor.processLiftosaurWorkouts
    ).not.toHaveBeenCalled();
  });

  it('stops paginating when a full sync reports more pages without advancing the cursor', async () => {
    // A full sync has no date window to end the loop, so an unchanged cursor
    // has to, or the sync re-fetches the same page forever.
    vi.mocked(axios.get).mockResolvedValue({
      data: {
        data: {
          records: [
            {
              id: 1,
              text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
            },
          ],
          hasMore: true,
          nextCursor: 7,
        },
      },
    });

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    expect(result.success).toBe(true);
    // First page, then one more for the cursor that did not move.
    expect(vi.mocked(axios.get)).toHaveBeenCalledTimes(2);
    expect(result.workoutsImported).toBe(2);
    // The fetch stopped before the last page: import, but delete nothing and
    // leave last_sync_at so the sync is retried.
    expect(
      vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
        .calls[0]![4]
    ).toBeNull();
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      expect.anything()
    );
  });

  it('deletes nothing when an empty page arrives while Liftosaur still reports more', async () => {
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        data: {
          data: {
            records: [
              {
                id: 1,
                text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
              },
            ],
            hasMore: true,
            nextCursor: 5,
          },
        },
      })
      .mockResolvedValueOnce({
        data: { data: { records: [], hasMore: true, nextCursor: 9 } },
      });

    await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      true,
      'provider-123'
    );

    expect(
      vi.mocked(liftosaurDataProcessor.processLiftosaurWorkouts).mock
        .calls[0]![4]
    ).toBeNull();
  });

  it('keeps imported workouts but leaves last_sync_at alone when measurements fail', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        data: {
          records: [
            {
              id: 1,
              text: '2026-03-01T10:00:00Z / exercises: {\n  Squat / 3x5 100kg\n}',
            },
          ],
          hasMore: false,
        },
      },
    });
    vi.mocked(
      measurementsService.importMeasurementsFromLiftosaur
    ).mockRejectedValueOnce(new Error('Liftosaur unavailable'));

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    expect(result.success).toBe(true);
    expect(result.workoutsImported).toBe(1);
    expect(result.measurementsImported).toBe(0);
    expect(
      liftosaurDataProcessor.processLiftosaurWorkouts
    ).toHaveBeenCalledTimes(1);
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      expect.anything()
    );
  });

  it('saves the measurements it got but leaves last_sync_at alone when a key fails', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });
    vi.mocked(
      measurementsService.importMeasurementsFromLiftosaur
    ).mockResolvedValueOnce({
      imported: 2,
      failedKeys: ['waist'],
      failedRecords: 0,
    });

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    expect(result.success).toBe(true);
    expect(result.measurementsImported).toBe(2);
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      expect.anything()
    );
  });

  it('counts only saved measurements and leaves last_sync_at alone when a record is rejected', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { data: { records: [], hasMore: false } },
    });
    vi.mocked(
      measurementsService.importMeasurementsFromLiftosaur
    ).mockResolvedValueOnce({ imported: 1, failedKeys: [], failedRecords: 1 });

    const result = await liftosaurService.syncLiftosaurData(
      'user-1',
      'user-1',
      false,
      'provider-123'
    );

    expect(result.measurementsImported).toBe(1);
    expect(result.processedCount).toBe(1);
    expect(mockClient.query).not.toHaveBeenCalledWith(
      expect.stringContaining('last_sync_at'),
      expect.anything()
    );
  });
});
