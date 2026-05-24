import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { updateFood } from '../models/food.js';
import { v4 as uuidv4 } from 'uuid';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('updateFood barcode handling', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const userId = uuidv4();
  const foodId = uuidv4();

  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: foodId }] }),
      release: vi.fn(),
    };
    // @ts-expect-error mocked function
    getClient.mockResolvedValue(mockClient);
    mockClient.query.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('clears the barcode column when barcode is explicitly null', async () => {
    await updateFood(foodId, userId, { barcode: null });

    const [query, params] = mockClient.query.mock.calls[0];
    expect(query).toContain(
      'barcode = CASE WHEN $4::boolean THEN $5 ELSE barcode END'
    );
    // $4 = barcodeKeyPresent, $5 = barcodeValue
    expect(params[3]).toBe(true);
    expect(params[4]).toBeNull();
  });

  it('sets and normalizes the barcode when given a 12-digit UPC-A', async () => {
    await updateFood(foodId, userId, { barcode: '012345678905' });

    const params = mockClient.query.mock.calls[0][1];
    expect(params[3]).toBe(true);
    // 12-digit UPC-A is padded to 13-digit EAN-13.
    expect(params[4]).toBe('0012345678905');
  });

  it('passes through a 13-digit EAN-13 barcode unchanged', async () => {
    await updateFood(foodId, userId, { barcode: '3017620422003' });

    const params = mockClient.query.mock.calls[0][1];
    expect(params[3]).toBe(true);
    expect(params[4]).toBe('3017620422003');
  });

  it('leaves barcode untouched when key is absent from payload', async () => {
    await updateFood(foodId, userId, { name: 'New Name' });

    const params = mockClient.query.mock.calls[0][1];
    expect(params[3]).toBe(false);
    expect(params[4]).toBeNull();
    // $1 is name
    expect(params[0]).toBe('New Name');
  });

  it('updates name and barcode in a single query when both provided', async () => {
    await updateFood(foodId, userId, {
      name: 'Combined',
      barcode: '012345678905',
    });

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    const [query, params] = mockClient.query.mock.calls[0];
    expect(query).toContain('name = COALESCE($1, name)');
    expect(query).toContain(
      'barcode = CASE WHEN $4::boolean THEN $5 ELSE barcode END'
    );
    expect(params[0]).toBe('Combined');
    expect(params[3]).toBe(true);
    expect(params[4]).toBe('0012345678905');
  });
});
