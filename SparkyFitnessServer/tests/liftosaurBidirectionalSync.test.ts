import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import liftosaurService from '../integrations/liftosaur/liftosaurService.js';
import liftosaurDataProcessor from '../integrations/liftosaur/liftosaurDataProcessor.js';
import * as measurementsService from '../integrations/liftosaur/liftosaurMeasurementsService.js';
import * as workoutExportService from '../integrations/liftosaur/liftosaurWorkoutExportService.js';
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
  importMeasurementsFromLiftosaur: vi.fn().mockResolvedValue(3),
  exportMeasurementsToLiftosaur: vi.fn().mockResolvedValue(4),
  parseLiftosaurValue: vi.fn(),
}));
vi.mock('../integrations/liftosaur/liftosaurWorkoutExportService.js', () => ({
  exportWorkoutsToLiftosaur: vi.fn().mockResolvedValue(2),
  getValidatedLiftosaurBaseUrl: vi
    .fn()
    .mockReturnValue('https://www.liftosaur.com'),
  default: {
    exportWorkoutsToLiftosaur: vi.fn().mockResolvedValue(2),
  },
}));

describe('liftosaurBidirectionalSync', () => {
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

  it('coordinates bidirectional sync for workouts and measurements with detailed counts', async () => {
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
    expect(result.workoutsExported).toBe(2);
    expect(result.measurementsImported).toBe(3);
    expect(result.measurementsExported).toBe(4);
    expect(result.processedCount).toBe(10); // 1 + 2 + 3 + 4

    expect(
      liftosaurDataProcessor.processLiftosaurWorkouts
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementsService.importMeasurementsFromLiftosaur
    ).toHaveBeenCalledTimes(1);
    expect(
      workoutExportService.exportWorkoutsToLiftosaur
    ).toHaveBeenCalledTimes(1);
    expect(
      measurementsService.exportMeasurementsToLiftosaur
    ).toHaveBeenCalledTimes(1);

    // Verify last_sync_at update
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE external_data_providers'),
      ['provider-123']
    );
  });
});
