import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import exerciseDb from '../models/exercise.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging', () => ({
  log: vi.fn(),
}));

/** Pairs each INSERT column with the value bound to it. */
function columnBinds(sql: string, params: unknown[]): Record<string, unknown> {
  const columns = sql
    .match(/INSERT INTO exercises \(([^)]*)\)/)![1]
    .split(',')
    .map((c) => c.trim());
  const values = sql
    .match(/VALUES \(([^)]*\)?[^)]*)\)/)![1]
    .split(',')
    .map((v) => v.trim());
  return Object.fromEntries(
    columns.map((column, i) => {
      const bind = values[i].match(/^\$(\d+)$/);
      return [column, bind ? params[Number(bind[1]) - 1] : values[i]];
    })
  );
}

describe('createExercise binds', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{}] }),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('stores images and video_url in their own columns', async () => {
    await exerciseDb.createExercise({
      source: 'custom',
      name: 'Squat',
      category: 'strength',
      images: ['squat.jpg'],
      video_url: 'https://youtu.be/dQw4w9WgXcQ',
      calories_per_hour: 300,
      user_id: 'user-1',
    });
    const [sql, params] = mockClient.query.mock.calls[0];
    const binds = columnBinds(sql, params);
    expect(binds.images).toBe(JSON.stringify(['squat.jpg']));
    expect(binds.video_url).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(binds.calories_per_hour).toBe(300);
    expect(binds.name).toBe('Squat');
  });
});
