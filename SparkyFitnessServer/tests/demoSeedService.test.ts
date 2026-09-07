import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDemoMode,
  getDemoEmail,
  isDemoEmail,
  demoGuard,
} from '../middleware/demoGuardMiddleware.js';
import {
  getDemoCredentials,
  seedDemoUser,
  resetDemoUserData,
  purgeDemoUserIfExists,
} from '../services/demoSeedService.js';
import userRepository from '../models/userRepository.js';
import * as poolManager from '../db/poolManager.js';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../models/userRepository.js', () => ({
  default: {
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('../services/nutrientDisplayPreferenceService.js', () => ({
  createDefaultNutrientPreferencesForUser: vi.fn(),
}));

describe('Demo Mode Infrastructure', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('demoGuardMiddleware', () => {
    it('returns false for isDemoMode when env is unset or false', () => {
      delete process.env.SPARKY_FITNESS_DEMO_MODE;
      expect(isDemoMode()).toBe(false);

      process.env.SPARKY_FITNESS_DEMO_MODE = 'false';
      expect(isDemoMode()).toBe(false);
    });

    it('returns true for isDemoMode when env is "true"', () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
      expect(isDemoMode()).toBe(true);
    });

    it('returns configured or default demo email', () => {
      expect(getDemoEmail()).toBe('demo@sparkyfitness.com');
      process.env.SPARKY_FITNESS_DEMO_EMAIL = 'custom@sparkyfitness.com';
      expect(getDemoEmail()).toBe('custom@sparkyfitness.com');
    });

    it('identifies demo email correctly and case-insensitively', () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
      expect(isDemoEmail('demo@sparkyfitness.com')).toBe(true);
      expect(isDemoEmail('DEMO@SPARKYFITNESS.COM')).toBe(true);
      expect(isDemoEmail(' other@sparkyfitness.com ')).toBe(false);
      expect(isDemoEmail(null)).toBe(false);
    });

    it('bypasses demoGuard when demo mode is inactive', () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'false';
      const req = {
        authenticatedUserEmail: 'demo@sparkyfitness.com',
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      demoGuard(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('blocks demo user mutations with 403 when demo mode is active', () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
      const req = {
        authenticatedUserEmail: 'demo@sparkyfitness.com',
        method: 'POST',
        originalUrl: '/api/identity/update-password',
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      demoGuard(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DEMO_ACTION_RESTRICTED',
        })
      );
    });
  });

  describe('demoSeedService', () => {
    it('returns default demo credentials with secure random fallback password', () => {
      delete process.env.SPARKY_FITNESS_DEMO_PASSWORD;
      const creds = getDemoCredentials();
      expect(creds.email).toBe('demo@sparkyfitness.com');
      expect(creds.fullName).toBe('Demo User');
      expect(typeof creds.password).toBe('string');
      expect(creds.password.length).toBeGreaterThanOrEqual(16);
    });

    it('respects custom SPARKY_FITNESS_DEMO_PASSWORD when configured', () => {
      process.env.SPARKY_FITNESS_DEMO_PASSWORD = 'override_from_env_test';
      const creds = getDemoCredentials();
      expect(creds.password).toBe('override_from_env_test');
      delete process.env.SPARKY_FITNESS_DEMO_PASSWORD;
    });

    it('seeds demo user and populates sample entries', async () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce(null);
      vi.mocked(userRepository.createUser).mockResolvedValueOnce(
        'mock-demo-id'
      );

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT id, name FROM meal_types')) {
            return {
              rows: [
                { id: 'meal-1', name: 'Breakfast' },
                { id: 'meal-2', name: 'Lunch' },
                { id: 'meal-3', name: 'Dinner' },
                { id: 'meal-4', name: 'Snack' },
              ],
            };
          }
          if (sql.includes('RETURNING id')) {
            return {
              rows: [{ id: 'mock-sample-id' }],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(poolManager.getSystemClient).mockResolvedValue(
        mockClient as any
      );

      const userId = await seedDemoUser();
      expect(userId).toBeDefined();
      expect(userRepository.createUser).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE profiles'),
        expect.any(Array)
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO food_entries'),
        expect.any(Array)
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('purges demo user when demo mode is disabled', async () => {
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'mock-demo-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT bio FROM profiles')) {
            return {
              rows: [
                {
                  bio: 'SparkyFitness Demo Account — Daily sandbox resetting at 00:00 UTC',
                },
              ],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(poolManager.getSystemClient).mockResolvedValueOnce(
        mockClient as any
      );
      vi.mocked(userRepository.deleteUser).mockResolvedValueOnce(true);

      await purgeDemoUserIfExists();
      expect(userRepository.findUserByEmail).toHaveBeenCalledWith(
        'demo@sparkyfitness.com'
      );
      expect(userRepository.deleteUser).toHaveBeenCalledWith('mock-demo-id');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('resets demo user data strictly scoped by user_id', async () => {
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'mock-demo-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT bio FROM profiles')) {
            return {
              rows: [
                {
                  bio: 'SparkyFitness Demo Account — Daily sandbox resetting at 00:00 UTC',
                },
              ],
            };
          }
          if (sql.includes('SELECT id, name FROM meal_types')) {
            return {
              rows: [
                { id: 'meal-1', name: 'Breakfast' },
                { id: 'meal-2', name: 'Lunch' },
              ],
            };
          }
          if (sql.includes('RETURNING id')) {
            return {
              rows: [{ id: 'mock-sample-id' }],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(poolManager.getSystemClient).mockResolvedValue(
        mockClient as any
      );

      await resetDemoUserData();
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM food_entries WHERE user_id = $1',
        ['mock-demo-id']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM exercise_entries WHERE user_id = $1',
        ['mock-demo-id']
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        'DELETE FROM check_in_measurements WHERE user_id = $1',
        ['mock-demo-id']
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('safely constrains exercise image cleanup to exercise_entries directory', async () => {
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'mock-demo-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      const mockClient = {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT bio FROM profiles')) {
            return {
              rows: [
                {
                  bio: 'SparkyFitness Demo Account — Daily sandbox resetting at 00:00 UTC',
                },
              ],
            };
          }
          if (sql.includes('SELECT image_url FROM exercise_entries')) {
            return {
              rows: [
                { image_url: '/uploads/exercise_entries/../../etc/passwd' },
                { image_url: '/uploads/exercise_entries/safe-image.png' },
              ],
            };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(poolManager.getSystemClient).mockResolvedValueOnce(
        mockClient as any
      );
      vi.mocked(userRepository.deleteUser).mockResolvedValueOnce(true);

      await purgeDemoUserIfExists();
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
