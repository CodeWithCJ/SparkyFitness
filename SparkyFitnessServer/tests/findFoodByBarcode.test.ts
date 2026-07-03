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
});
