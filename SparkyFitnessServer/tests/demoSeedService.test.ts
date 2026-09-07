import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isDemoMode,
  getDemoEmail,
  isDemoEmail,
  demoGuard,
  demoRestrictionGuard,
  demoLoginRateLimit,
  resetDemoLoginRateLimit,
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
        user: { email: 'demo@sparkyfitness.com' },
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
        user: { email: 'demo@sparkyfitness.com' },
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

  describe('demo marker safety (fails closed)', () => {
    // A normally-created profile is inserted without a bio, so an absent marker
    // is the default state of every real account — never a licence to wipe one.
    function clientWithBio(bio: string | null) {
      return {
        query: vi.fn().mockImplementation(async (sql: string) => {
          if (sql.includes('SELECT bio FROM profiles')) {
            return { rows: [{ bio }] };
          }
          return { rows: [] };
        }),
        release: vi.fn(),
      };
    }

    it.each([
      ['a null bio', null],
      ['an empty bio', ''],
      ['someone else’s bio', 'Just here to track my runs'],
    ])('refuses to purge an account with %s', async (_label, bio) => {
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'real-user-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const mockClient = clientWithBio(bio);
      vi.mocked(poolManager.getSystemClient).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockClient as any
      );

      await purgeDemoUserIfExists();

      expect(userRepository.deleteUser).not.toHaveBeenCalled();
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        expect.anything()
      );
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('refuses to seed over an existing account with no marker', async () => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'real-user-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const mockClient = clientWithBio(null);
      vi.mocked(poolManager.getSystemClient).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockClient as any
      );

      await expect(seedDemoUser()).rejects.toThrow(/not marked as a demo/i);
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "account" SET password'),
        expect.anything()
      );
    });

    it('skips the daily reset when the marker is absent', async () => {
      vi.mocked(userRepository.findUserByEmail).mockResolvedValueOnce({
        id: 'real-user-id',
        email: 'demo@sparkyfitness.com',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      const mockClient = clientWithBio(null);
      vi.mocked(poolManager.getSystemClient).mockResolvedValueOnce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockClient as any
      );

      await resetDemoUserData();

      expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('demoRestrictionGuard', () => {
    function run(
      path: string,
      method = 'GET',
      headers: Record<string, string> = {}
    ) {
      const req = {
        path,
        method,
        originalUrl: path,
        headers,
        user: { email: 'demo@sparkyfitness.com' },
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;
      demoRestrictionGuard(req, res, next);
      return { res, next };
    }

    beforeEach(() => {
      process.env.SPARKY_FITNESS_DEMO_MODE = 'true';
    });

    it.each([
      '/api/chat',
      '/api/chat/stream',
      '/api/ai/convert',
      '/mcp',
      '/api/admin/global-settings',
      '/api/integrations/strava/connect',
      '/api/withings/link',
      '/api/external-providers',
    ])('blocks %s on any method', (path) => {
      const { res, next } = run(path);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('blocks mutations under /api/identity but allows reads', () => {
      const write = run('/api/identity/profiles', 'PUT');
      expect(write.next).not.toHaveBeenCalled();
      expect(write.res.status).toHaveBeenCalledWith(403);

      const read = run('/api/identity/profiles', 'GET');
      expect(read.next).toHaveBeenCalled();
      expect(read.res.status).not.toHaveBeenCalled();
    });

    it('blocks multipart uploads on any route', () => {
      const { res, next } = run('/api/foods/image', 'POST', {
        'content-type': 'multipart/form-data; boundary=x',
      });
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('allows ordinary demo activity through', () => {
      const { res, next } = run('/api/food-entries', 'POST');
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('does not touch requests from non-demo users', () => {
      const req = {
        path: '/api/chat',
        method: 'POST',
        originalUrl: '/api/chat',
        headers: {},
        user: { email: 'real-user@example.com' },
      } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn() as NextFunction;

      demoRestrictionGuard(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('demoLoginRateLimit', () => {
    beforeEach(() => {
      resetDemoLoginRateLimit();
    });

    it('allows a burst then returns 429', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const req = { ip: '203.0.113.5' } as unknown as Request;

      for (let i = 0; i < 10; i++) {
        const next = vi.fn() as NextFunction;
        demoLoginRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
      }

      const blocked = vi.fn() as NextFunction;
      demoLoginRateLimit(req, res, blocked);
      expect(blocked).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(429);
    });

    it('tracks callers independently', () => {
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;

      for (let i = 0; i < 11; i++) {
        demoLoginRateLimit(
          { ip: '203.0.113.5' } as unknown as Request,
          res,
          vi.fn() as NextFunction
        );
      }

      const next = vi.fn() as NextFunction;
      demoLoginRateLimit(
        { ip: '198.51.100.9' } as unknown as Request,
        res,
        next
      );
      expect(next).toHaveBeenCalled();
    });
  });
});
