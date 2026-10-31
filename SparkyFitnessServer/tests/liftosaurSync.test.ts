import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
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
    .mockResolvedValue({ imported: 3, failedKeys: [] }),
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
    expect(
      measurementsService.importMeasurementsFromLiftosaur
    ).toHaveBeenCalledTimes(1);

    // Verify last_sync_at update
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE external_data_providers'),
      ['provider-123']
    );
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
    ).mockResolvedValueOnce({ imported: 2, failedKeys: ['waist'] });

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
});
