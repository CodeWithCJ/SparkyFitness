import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Bind positions of health_activity_type (#1750) in the two writers.
const CREATE_PARAM = 18;
const UPDATE_PROVIDED_PARAM = 17;
const UPDATE_VALUE_PARAM = 18;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lastQuery(mockClient: any): [string, unknown[]] {
  return mockClient.query.mock.calls[mockClient.query.mock.calls.length - 1];
}

describe('exercise health_activity_type writers', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createExercise', () => {
    async function captureCreate(value: unknown) {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });
      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Walking into Mordor',
        category: 'Cardio',
        health_activity_type: value,
      });
      const [sql, params] = lastQuery(mockClient);
      expect(sql).toContain('health_activity_type');
      return params[CREATE_PARAM];
    }

    it('stores a known key', async () => {
      expect(await captureCreate('walking')).toBe('walking');
    });

    it('stores null (Automatic) when omitted, blank or unknown', async () => {
      expect(await captureCreate(undefined)).toBeNull();
      expect(await captureCreate('')).toBeNull();
      expect(await captureCreate('automatic')).toBeNull();
      expect(await captureCreate('moonwalking')).toBeNull();
    });
  });

  describe('updateExercise', () => {
    async function captureUpdate(updateData: Record<string, unknown>) {
      const id = uuidv4();
      mockClient.query.mockResolvedValueOnce({ rows: [{ id }] });
      await exerciseDb.updateExercise(id, uuidv4(), updateData);
      const [sql, params] = lastQuery(mockClient);
      expect(sql).toContain(
        'health_activity_type = CASE WHEN $18::boolean THEN $19::text'
      );
      expect(params[params.length - 1]).toBe(id);
      return [params[UPDATE_PROVIDED_PARAM], params[UPDATE_VALUE_PARAM]];
    }

    it('keeps the stored value when the field is omitted', async () => {
      expect(await captureUpdate({ name: 'Renamed' })).toEqual([false, null]);
    });

    it('sets a known key', async () => {
      expect(await captureUpdate({ health_activity_type: 'hiking' })).toEqual([
        true,
        'hiking',
      ]);
    });

    it('clears back to Automatic for null, blank or "automatic"', async () => {
      for (const value of [null, '', 'automatic']) {
        expect(await captureUpdate({ health_activity_type: value })).toEqual([
          true,
          null,
        ]);
      }
    });

    it('ignores an unknown key rather than failing the CHECK', async () => {
      expect(
        await captureUpdate({ health_activity_type: 'moonwalking' })
      ).toEqual([false, null]);
    });
  });
});
