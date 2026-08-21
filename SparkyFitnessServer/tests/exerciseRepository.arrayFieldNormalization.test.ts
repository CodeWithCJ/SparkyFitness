/**
 * Regression coverage for the models/exercise.ts write chokepoint: every
 * caller of createExercise/updateExercise (route JSON body, CSV import via
 * exerciseEntryService.ts, external-provider import) must land on the same
 * JSON-array-of-strings shape in the database, even when a caller sends a
 * bare string instead of an array (e.g. exerciseEntryService.ts's CSV import
 * passes entryGroup.exercise_equipment straight through with only a truthy
 * check, no shape normalization). normalizeToStringArray is applied right
 * before JSON.stringify so this holds regardless of caller.
 */
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

// Bind positions of the array fields in the two writer statements.
const CREATE_PARAM = {
  equipment: 6,
  primary_muscles: 7,
  secondary_muscles: 8,
  instructions: 9,
  images: 11,
};
const UPDATE_PARAM = {
  equipment: 9,
  primary_muscles: 10,
  secondary_muscles: 11,
  instructions: 12,
  images: 13,
};

function lastQuery(mockClient: MockDbClient): [string, unknown[]] {
  const calls = mockClient.query.mock.calls;
  return calls[calls.length - 1] as [string, unknown[]];
}

describe('exercise array-field normalization at the write chokepoint', () => {
  let mockClient: MockDbClient;

  beforeEach(() => {
    mockClient = createMockDbClient();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createExercise', () => {
    it('wraps a bare string (e.g. from CSV import) into a one-item JSON array instead of a JSON-encoded bare string', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
        equipment: 'Barbell, Dumbbell',
        primary_muscles: 'chest',
        secondary_muscles: 'triceps',
        instructions: 'Lie on the bench, then press.',
        images: 'exercises/test.jpg',
      });

      const params = lastQuery(mockClient)[1];
      expect(params[CREATE_PARAM.equipment]).toBe(
        JSON.stringify(['Barbell, Dumbbell'])
      );
      expect(params[CREATE_PARAM.primary_muscles]).toBe(
        JSON.stringify(['chest'])
      );
      expect(params[CREATE_PARAM.secondary_muscles]).toBe(
        JSON.stringify(['triceps'])
      );
      expect(params[CREATE_PARAM.instructions]).toBe(
        JSON.stringify(['Lie on the bench, then press.'])
      );
      expect(params[CREATE_PARAM.images]).toBe(
        JSON.stringify(['exercises/test.jpg'])
      );
    });

    it('passes an already-correct array through unchanged', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
        equipment: ['Barbell', 'Dumbbell'],
      });

      expect(lastQuery(mockClient)[1][CREATE_PARAM.equipment]).toBe(
        JSON.stringify(['Barbell', 'Dumbbell'])
      );
    });

    it('binds null for an omitted array field', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.createExercise({
        user_id: uuidv4(),
        name: 'Test Exercise',
      });

      expect(lastQuery(mockClient)[1][CREATE_PARAM.equipment]).toBeNull();
    });
  });

  describe('updateExercise', () => {
    it('wraps a bare string into a one-item JSON array instead of a JSON-encoded bare string', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.updateExercise(uuidv4(), uuidv4(), {
        equipment: 'Barbell, Dumbbell',
        instructions: "Don't lock your elbows.",
      });

      const params = lastQuery(mockClient)[1];
      expect(params[UPDATE_PARAM.equipment]).toBe(
        JSON.stringify(['Barbell, Dumbbell'])
      );
      expect(params[UPDATE_PARAM.instructions]).toBe(
        JSON.stringify(["Don't lock your elbows."])
      );
    });

    // COALESCE($N, column) keeps the stored value when the bind is null.
    it('binds null for an omitted array field so the existing column value is preserved', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

      await exerciseDb.updateExercise(uuidv4(), uuidv4(), {
        name: 'Renamed',
      });

      expect(lastQuery(mockClient)[1][UPDATE_PARAM.equipment]).toBeNull();
    });
  });
});
