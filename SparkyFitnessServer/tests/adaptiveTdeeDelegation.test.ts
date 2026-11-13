import express, { type RequestHandler } from 'express';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { createRequire } from 'node:module';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { z } from 'zod';

const mocks = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getUserPreferences: vi.fn(),
  getMeasurements: vi.fn(),
  getLatestMeasurement: vi.fn(),
  getNutritionData: vi.fn(),
  canAccessUserData: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: async () => [] },
}));
vi.mock('../models/userRepository.js', () => ({
  default: {
    getUserProfile: mocks.getUserProfile,
    ensureUserInitialization: vi.fn().mockResolvedValue(undefined),
    updateUserLastLogin: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: { getUserPreferences: mocks.getUserPreferences },
}));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    getCheckInMeasurementsByDateRange: mocks.getMeasurements,
    getLatestMeasurement: mocks.getLatestMeasurement,
  },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: { getNutritionData: mocks.getNutritionData },
}));
vi.mock('../services/bmrService.js', () => ({
  default: {
    calculateBmr: () => 1800,
    ActivityMultiplier: { moderate: 1.55 },
  },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: mocks.canAccessUserData,
}));
vi.mock('../auth.js', () => ({
  auth: {
    api: { getSession: mocks.getSession },
    options: {
      advanced: { cookiePrefix: 'sparky', useSecureCookies: false },
      secret: 'test-secret',
    },
  },
}));

import { dbContextStorage } from '../db/poolManager.js';
import {
  calculateAdaptiveTdee,
  calculateAdaptiveTdeeRange,
  clearUserTdeeCache,
  type AdaptiveTdeeResult,
} from '../services/AdaptiveTdeeService.js';
import adaptiveTdeeRoutes from '../routes/adaptiveTdeeRoutes.js';

const adaptiveTdeeResponseSchema = z.object({
  tdee: z.number(),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  isFallback: z.boolean(),
  fallbackReason: z.string().optional(),
  daysOfData: z.number(),
  lastCalculated: z.string(),
  weightTrend: z.number().nullable().optional(),
  startWeightTrend: z.number().optional(),
  endWeightTrend: z.number().optional(),
  weightChangeKg: z.number().optional(),
  dailyWeightChangeKg: z.number().optional(),
  weightChangeCalories: z.number().optional(),
  rawTdee: z.number().optional(),
});

const owner = 'adaptive-access-owner';
const diaryDelegate = 'adaptive-access-diary';
const checkinDelegate = 'adaptive-access-checkin';
const diaryCheckinDelegate = 'adaptive-access-diary-checkin';
const reportsDelegate = 'adaptive-access-reports';
const medicationDelegate = 'adaptive-access-medications';
const day = '2026-09-29';
const measurements = Array.from({ length: 28 }, (_, index) => ({
  entry_date: `2026-09-${String(index + 1).padStart(2, '0')}`,
  weight: 80,
}));
let measurementReaders: Set<string>;

const cookieParser = createRequire(import.meta.url)(
  'cookie-parser'
) as () => RequestHandler;
const app = express();
app.use(cookieParser());
app.use('/api/adaptive-tdee', adaptiveTdeeRoutes);
let server: Server | undefined;
let baseUrl = '';

beforeAll(async () => {
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  const runningServer = server;
  if (!runningServer) return;
  runningServer.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    runningServer.close((error) => (error ? reject(error) : resolve()));
  });
});

async function getAdaptiveResponse(actor: string): Promise<{
  status: number;
  body: unknown;
}> {
  const response = await fetch(`${baseUrl}/api/adaptive-tdee?date=${day}`, {
    headers: {
      cookie: `test_session_actor=${actor}; sparky_active_user_id=${owner}`,
    },
    signal: AbortSignal.timeout(5000),
  });
  return { status: response.status, body: await response.json() };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearUserTdeeCache(owner);
  measurementReaders = new Set([
    owner,
    checkinDelegate,
    diaryCheckinDelegate,
    reportsDelegate,
  ]);
  const canReadMeasurements = () =>
    measurementReaders.has(
      dbContextStorage.getStore()?.authenticatedUserId ?? owner
    );
  const nutritionReaders = new Set([
    owner,
    diaryDelegate,
    diaryCheckinDelegate,
    reportsDelegate,
  ]);
  const grants: Record<string, readonly string[]> = {
    [diaryDelegate]: ['reports', 'diary', 'checkin_read'],
    [checkinDelegate]: ['reports', 'checkin', 'checkin_read'],
    [diaryCheckinDelegate]: ['reports', 'diary', 'checkin', 'checkin_read'],
    [reportsDelegate]: ['reports', 'checkin_read'],
    [medicationDelegate]: ['medications'],
  };
  // Stub only session lookup. The real authentication middleware parses the
  // switched profile cookie and supplies the authenticated actor to storage.
  mocks.getSession.mockImplementation(
    async ({ headers }: { headers: Headers }) => {
      const actor = /(?:^|;\s*)test_session_actor=([^;]+)/.exec(
        headers.get('cookie') ?? ''
      )?.[1];
      if (!actor || (actor !== owner && !grants[actor])) return null;
      return {
        user: { id: actor, lastLoginAt: new Date().toISOString() },
        session: { id: `test-session-${actor}` },
      };
    }
  );
  mocks.getUserProfile.mockResolvedValue({
    date_of_birth: '1990-01-01',
    gender: 'male',
  });
  mocks.getUserPreferences.mockResolvedValue({
    activity_level: 'moderate',
    use_external_bmr: false,
    calorie_goal_adjustment_mode: 'dynamic',
    goal_mode_calculation_method: 'adaptive',
    adaptive_activity_separate: false,
  });
  // Model the database's measurement visibility independently of the cache.
  mocks.getMeasurements.mockImplementation(async () =>
    canReadMeasurements() ? measurements : []
  );
  mocks.getLatestMeasurement.mockImplementation(async () =>
    canReadMeasurements() ? { weight: 80, height: 180 } : null
  );
  mocks.getNutritionData.mockImplementation(async () =>
    nutritionReaders.has(
      dbContextStorage.getStore()?.authenticatedUserId ?? owner
    )
      ? measurements.map(({ entry_date }) => ({
          date: entry_date,
          calories: 2600,
        }))
      : []
  );
  // The existing read permission includes diary delegates; RLS still filters
  // their measurements. Medication-only access does not include check-ins.
  mocks.canAccessUserData.mockImplementation(
    async (target: string, permission: string, actor: string) =>
      target === owner &&
      (actor === owner || (grants[actor]?.includes(permission) ?? false))
  );
});

type Calculation = 'single' | 'range';

async function calculate(
  method: Calculation,
  actor: string
): Promise<AdaptiveTdeeResult> {
  return dbContextStorage.run({ authenticatedUserId: actor }, async () => {
    if (method === 'single') return calculateAdaptiveTdee(owner, day);
    const result = (await calculateAdaptiveTdeeRange(owner, day, day))[day];
    if (!result) throw new Error('Missing calculated day');
    return result;
  });
}

function expectMeasurementsHidden(result: AdaptiveTdeeResult): void {
  expect(result.isFallback).toBe(true);
  expect(result.weightTrend).toBeNull();
  expect(result.startWeightTrend).toBeUndefined();
  expect(result.endWeightTrend).toBeUndefined();
  expect(result.weightChangeKg).toBeUndefined();
  expect(result.dailyWeightChangeKg).toBeUndefined();
  expect(result.weightChangeCalories).toBeUndefined();
  expect(result.rawTdee).toBeUndefined();
}

describe.each<Calculation>(['single', 'range'])(
  '%s adaptive TDEE cache',
  (method) => {
    it('does not reuse the owner result in a restricted delegate context', async () => {
      const original = await calculate(method, owner);
      expect(original.startWeightTrend).toBe(80);
      expectMeasurementsHidden(await calculate(method, diaryDelegate));
      expect(await calculate(method, owner)).toEqual(original);
      expect(mocks.getMeasurements).toHaveBeenCalledTimes(2);
    });

    it('does not let a restricted delegate populate the owner cache', async () => {
      expectMeasurementsHidden(await calculate(method, diaryDelegate));
      const original = await calculate(method, owner);
      expect(original.isFallback).toBe(false);
      expect(original.startWeightTrend).toBe(80);
    });

    it('rechecks RLS after a delegate measurement grant is revoked', async () => {
      expect(
        (await calculate(method, diaryCheckinDelegate)).startWeightTrend
      ).toBe(80);
      measurementReaders.delete(diaryCheckinDelegate);
      expectMeasurementsHidden(await calculate(method, diaryCheckinDelegate));
      expect(mocks.getMeasurements).toHaveBeenCalledTimes(2);
    });
  }
);

describe.each(['cold', 'owner-warmed'])(
  'adaptive TDEE endpoint (%s cache)',
  (cache) => {
    beforeEach(async () => {
      if (cache === 'owner-warmed') {
        const response = await getAdaptiveResponse(owner);
        expect(response.status).toBe(200);
        expect(
          adaptiveTdeeResponseSchema.parse(response.body).startWeightTrend
        ).toBe(80);
      }
    });

    it('does not disclose measurements to a diary-only delegate', async () => {
      const response = await getAdaptiveResponse(diaryDelegate);
      expect(response.status).toBe(200);
      expectMeasurementsHidden(adaptiveTdeeResponseSchema.parse(response.body));
      expect(mocks.getUserProfile).toHaveBeenLastCalledWith(owner);
    });

    it('rejects delegates without check-in read access', async () => {
      const response = await getAdaptiveResponse(medicationDelegate);
      expect(response.status).toBe(403);
    });

    it('uses a calorie-history fallback for a check-in-only delegate', async () => {
      const response = await getAdaptiveResponse(checkinDelegate);
      expect(response.status).toBe(200);
      const result = adaptiveTdeeResponseSchema.parse(response.body);
      expect(result.isFallback).toBe(true);
      expect(result.daysOfData).toBe(0);
      expect(result.weightTrend).toBe(80);
      expect(result.confidence).toBe('LOW');
      expect(result.fallbackReason).toContain('Insufficient calorie logs');
      expect(result.startWeightTrend).toBeUndefined();
      expect(result.endWeightTrend).toBeUndefined();
    });

    it.each([owner, diaryCheckinDelegate, reportsDelegate])(
      'preserves authorized access for %s',
      async (actor) => {
        const response = await getAdaptiveResponse(actor);
        expect(response.status).toBe(200);
        expect(
          adaptiveTdeeResponseSchema.parse(response.body).startWeightTrend
        ).toBe(80);
      }
    );
  }
);
