import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findFoodByBarcode } from '../models/food.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('findFoodByBarcode', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    // @ts-expect-error mocked function
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('excludes quick (soft-deleted) foods so deleted barcodes fall through to provider lookup', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await findFoodByBarcode('0123456789012', userId);

    const queryStr = mockClient.query.mock.calls[0][0];
    expect(queryStr).toContain('f.is_quick_food = FALSE');
  });

  it("matches only the user's own foods unless family foods are requested", async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await findFoodByBarcode('0123456789012', userId);
    expect(mockClient.query.mock.calls[0][1]).toEqual([
      '0123456789012',
      userId,
      false,
    ]);

    await findFoodByBarcode('0123456789012', userId, { includeFamily: true });
    const [queryStr, params] = mockClient.query.mock.calls[1];
    expect(params).toEqual(['0123456789012', userId, true]);
    expect(queryStr).toContain(
      "(fa.access_permissions->>'can_view_food_library')::boolean = TRUE"
    );
    expect(queryStr).toContain('fa.is_active = TRUE');
    expect(queryStr).toContain('fa.access_end_date > NOW()');
  });
});
