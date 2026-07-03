import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFoodsWithPagination } from '../models/food.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';
// Mock the poolManager.getClient function
vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));
describe('food database sorting', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();
  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error TS(2339): Property 'mockResolvedValue' does not exist on typ... Remove this comment to see the full error message
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });
  it('should construct a valid query when sorting by calories', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await getFoodsWithPagination(
      '', // searchTerm
      'all', // foodFilter
      userId,
      10, // limit
      0, // offset
      'calories:desc' // sortBy
    );
    // Verify the query does NOT contain DISTINCT ON
    const lastCall = mockClient.query.mock.calls[0];
    const queryStr = lastCall[0];
    expect(queryStr).not.toContain('DISTINCT ON');
    expect(queryStr).toContain(
      'ORDER BY fv.calories DESC NULLS LAST, f.name ASC, f.id ASC'
    );
  });
  it('should construct a valid query when sorting by name', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await getFoodsWithPagination('', 'all', userId, 10, 0, 'name:asc');
    const lastCall = mockClient.query.mock.calls[0];
    const queryStr = lastCall[0];
    expect(queryStr).not.toContain('DISTINCT ON');
    expect(queryStr).toContain('ORDER BY f.name ASC, f.id ASC');
  });
  it('should fallback to default sort for invalid sortBy', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await getFoodsWithPagination('', 'all', userId, 10, 0, 'invalid:field');
    const lastCall = mockClient.query.mock.calls[0];
    const queryStr = lastCall[0];
    expect(queryStr).toContain('ORDER BY f.name ASC, f.id ASC');
  });
});
