import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import {
  exportWorkoutsToLiftosaur,
  getValidatedLiftosaurBaseUrl,
} from '../integrations/liftosaur/liftosaurWorkoutExportService.js';
import { getClient } from '../db/poolManager.js';

vi.mock('axios');
vi.mock('../db/poolManager.js');
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('liftosaurWorkoutExportService', () => {
  let mockClient: any;
  const originalEnvUrl = process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
    delete process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL;
  });

  afterEach(() => {
    if (originalEnvUrl !== undefined) {
      process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL = originalEnvUrl;
    } else {
      delete process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL;
    }
  });

  describe('getValidatedLiftosaurBaseUrl', () => {
    it('returns default HTTPS URL when environment variable is not set', () => {
      delete process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL;
      expect(getValidatedLiftosaurBaseUrl()).toBe('https://www.liftosaur.com');
    });

    it('accepts a valid secure HTTPS override URL and trims trailing slashes', () => {
      process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL =
        'https://custom.api.liftosaur.com/api///';
      expect(getValidatedLiftosaurBaseUrl()).toBe(
        'https://custom.api.liftosaur.com/api'
      );
    });

    it('rejects an insecure HTTP override URL to prevent transmitting API keys over plaintext HTTP', () => {
      process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL =
        'http://insecure.liftosaur.com';
      expect(() => getValidatedLiftosaurBaseUrl()).toThrow(
        /Insecure Liftosaur API base URL rejected/
      );
    });

    it('rejects an invalid URL format', () => {
      process.env.SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL = 'not_a_valid_url';
      expect(() => getValidatedLiftosaurBaseUrl()).toThrow(
        /Invalid SPARKY_FITNESS_LIFTOSAUR_API_BASE_URL/
      );
    });
  });

  describe('exportWorkoutsToLiftosaur', () => {
    it('queries non-Liftosaur workouts, obtains durable claim, posts with idempotency key, and finalizes claim', async () => {
      mockClient.query.mockImplementation((sql: string, params?: any[]) => {
        if (sql.includes('FROM exercise_entries ee')) {
          expect(sql).toContain("LOWER(ee.source) != 'liftosaur'");
          expect(sql).toContain('[liftosaur_exported');
          return Promise.resolve({
            rows: [
              {
                id: 'entry-1',
                user_id: 'user-1',
                exercise_name: 'Bench Press',
                entry_date: '2026-03-01',
                entry_time: '10:00',
                duration_minutes: 30,
                notes: 'Felt strong',
                source: 'manual',
                exercise_preset_entry_id: 'preset-entry-1',
                preset_name: 'Push Day',
              },
              {
                id: 'entry-2',
                user_id: 'user-1',
                exercise_name: 'Overhead Press',
                entry_date: '2026-03-01',
                entry_time: '10:30',
                duration_minutes: 20,
                notes: null,
                source: 'manual',
                exercise_preset_entry_id: 'preset-entry-1',
                preset_name: 'Push Day',
              },
            ],
          });
        }

        if (sql.includes('FROM exercise_entry_sets')) {
          if (params?.[0] === 'entry-1') {
            return Promise.resolve({
              rows: [
                {
                  set_number: 1,
                  set_type: 'working',
                  reps: 5,
                  weight: 100,
                  rpe: 8,
                  duration: null,
                  notes: null,
                },
              ],
            });
          }
          return Promise.resolve({
            rows: [
              {
                set_number: 1,
                set_type: 'working',
                reps: 8,
                weight: 50,
                rpe: 8.5,
                duration: null,
                notes: null,
              },
            ],
          });
        }

        // Claim acquisition UPDATE ... RETURNING id
        if (
          sql.includes('UPDATE exercise_entries') &&
          sql.includes('RETURNING id')
        ) {
          return Promise.resolve({
            rows: [{ id: 'entry-1' }, { id: 'entry-2' }],
          });
        }

        // Finalization UPDATE
        if (
          sql.includes('UPDATE exercise_entries') &&
          sql.includes('[liftosaur_exported:')
        ) {
          return Promise.resolve({ rowCount: 2 });
        }

        return Promise.resolve({ rows: [] });
      });

      const mockedPost = vi.mocked(axios.post);
      mockedPost.mockResolvedValueOnce({ status: 201 });

      const exported = await exportWorkoutsToLiftosaur(
        'user-1',
        'test-key',
        'UTC',
        '2026-03-01',
        '2026-03-01'
      );

      expect(exported).toBe(1);
      expect(mockedPost).toHaveBeenCalledTimes(1);
      expect(mockedPost).toHaveBeenCalledWith(
        'https://www.liftosaur.com/api/v1/history',
        expect.objectContaining({
          text: expect.stringContaining('Push Day'),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key',
            'Idempotency-Key': expect.any(String),
          }),
          timeout: 10000,
        })
      );
    });

    it('releases durable claim if the HTTP POST to Liftosaur fails', async () => {
      let releasedClaim = false;

      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM exercise_entries ee')) {
          return Promise.resolve({
            rows: [
              {
                id: 'entry-1',
                user_id: 'user-1',
                exercise_name: 'Squat',
                entry_date: '2026-03-01',
                entry_time: '10:00',
                duration_minutes: 30,
                notes: null,
                source: 'manual',
                exercise_preset_entry_id: null,
                preset_name: null,
              },
            ],
          });
        }
        if (sql.includes('FROM exercise_entry_sets')) {
          return Promise.resolve({
            rows: [
              {
                set_number: 1,
                set_type: 'working',
                reps: 5,
                weight: 120,
                rpe: 8,
                duration: null,
                notes: null,
              },
            ],
          });
        }
        if (
          sql.includes('UPDATE exercise_entries') &&
          sql.includes('RETURNING id')
        ) {
          return Promise.resolve({ rows: [{ id: 'entry-1' }] });
        }
        if (
          sql.includes('UPDATE exercise_entries') &&
          sql.includes('regexp_replace(notes, ')
        ) {
          releasedClaim = true;
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rows: [] });
      });

      vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network error'));

      const exported = await exportWorkoutsToLiftosaur(
        'user-1',
        'test-key',
        'UTC'
      );
      expect(exported).toBe(0);
      expect(releasedClaim).toBe(true);
    });

    it('skips workout session if claim cannot be acquired (concurrent process claimed it)', async () => {
      mockClient.query.mockImplementation((sql: string) => {
        if (sql.includes('FROM exercise_entries ee')) {
          return Promise.resolve({
            rows: [
              {
                id: 'entry-1',
                user_id: 'user-1',
                exercise_name: 'Squat',
                entry_date: '2026-03-01',
                entry_time: '10:00',
                duration_minutes: 30,
                notes: null,
                source: 'manual',
                exercise_preset_entry_id: null,
                preset_name: null,
              },
            ],
          });
        }
        if (sql.includes('FROM exercise_entry_sets')) {
          return Promise.resolve({
            rows: [
              {
                set_number: 1,
                set_type: 'working',
                reps: 5,
                weight: 120,
                rpe: 8,
                duration: null,
                notes: null,
              },
            ],
          });
        }
        // Claim UPDATE returns 0 rows (locked by concurrent worker)
        if (
          sql.includes('UPDATE exercise_entries') &&
          sql.includes('RETURNING id')
        ) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      });

      const exported = await exportWorkoutsToLiftosaur(
        'user-1',
        'test-key',
        'UTC'
      );
      expect(exported).toBe(0);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('returns 0 when there are no eligible entries', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const exported = await exportWorkoutsToLiftosaur(
        'user-1',
        'test-key',
        'UTC'
      );
      expect(exported).toBe(0);
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
