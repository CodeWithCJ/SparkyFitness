/**
 * Regression test: exerciseService.ts used to pre-JSON.stringify `images`
 * before handing off to models/exercise.ts's createExercise/updateExercise.
 * Once that DB-layer chokepoint started JSON.stringify-ing images itself
 * (so CSV import and other untyped write paths get the same normalization),
 * the service-level pre-encoding double-encoded it: a real image-path array
 * became a JSON string, and that string then got wrapped into a one-item
 * array and re-stringified — corrupting every normal image upload. This
 * drives exerciseService.createExercise/updateExercise (real functions,
 * only the DB client mocked) and asserts `images` is encoded exactly once.
 */
import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseService from '../services/exerciseService.js';
import { getClient } from '../db/poolManager.js';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

// Bind positions of `images` in the two writer statements
// (models/exercise.ts's createExercise/updateExercise).
const CREATE_IMAGES_PARAM = 11;
const UPDATE_IMAGES_PARAM = 13;

function lastQuery(mockClient: MockDbClient): [string, unknown[]] {
  const calls = mockClient.query.mock.calls;
  return calls[calls.length - 1] as [string, unknown[]];
}

describe('exercise images are JSON-encoded exactly once', () => {
  let mockClient: MockDbClient;

  beforeEach(() => {
    mockClient = createMockDbClient();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('createExercise stores images as a single JSON array, not a nested encoded string', async () => {
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: uuidv4() }] });

    await exerciseService.createExercise(uuidv4(), {
      name: 'Bench Press',
      images: ['exercises/bench_press/0.jpg', 'exercises/bench_press/1.jpg'],
    });

    const params = lastQuery(mockClient)[1];
    expect(params[CREATE_IMAGES_PARAM]).toBe(
      JSON.stringify([
        'exercises/bench_press/0.jpg',
        'exercises/bench_press/1.jpg',
      ])
    );
    // The regression: images ends up double-encoded, e.g.
    // '["[\\"exercises/bench_press/0.jpg\\",...]"]'.
    expect(params[CREATE_IMAGES_PARAM]).not.toContain('\\"');
  });

  it('updateExercise stores images as a single JSON array, not a nested encoded string', async () => {
    const exerciseId = uuidv4();
    const userId = uuidv4();
    // getExerciseOwnerId's query, then the UPDATE itself.
    mockClient.query
      .mockResolvedValueOnce({ rows: [{ user_id: userId }] })
      .mockResolvedValueOnce({ rows: [{ id: exerciseId }] });

    await exerciseService.updateExercise(userId, exerciseId, {
      images: ['exercises/bench_press/0.jpg'],
    });

    const params = lastQuery(mockClient)[1];
    expect(params[UPDATE_IMAGES_PARAM]).toBe(
      JSON.stringify(['exercises/bench_press/0.jpg'])
    );
    expect(params[UPDATE_IMAGES_PARAM]).not.toContain('\\"');
  });
});
