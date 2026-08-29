import { vi, beforeEach, describe, expect, it } from 'vitest';
import type { PoolClient } from 'pg';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/imageLocalizer.js', () => ({
  toImageArray: vi.fn(() => []),
}));

const { resolveMealTypeIdWithClient } =
  await import('../models/foodEntryMealRepository.js');

const queryMock = vi.fn();
const client = { query: queryMock } as unknown as PoolClient;

const KNOWN_ID = '77777777-7777-4777-8777-777777777777';

describe('resolveMealTypeIdWithClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a supplied id that exists', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: KNOWN_ID }] });
    await expect(
      resolveMealTypeIdWithClient(client, KNOWN_ID, null)
    ).resolves.toBe(KNOWN_ID);
  });

  it('rejects a well-formed id that does not exist', async () => {
    // Without this check the unknown id reaches the INSERT and fails on the
    // foreign key mid-transaction instead of surfacing as INVALID_MEAL_TYPE.
    queryMock.mockResolvedValue({ rows: [] });
    await expect(
      resolveMealTypeIdWithClient(client, KNOWN_ID, null)
    ).rejects.toThrow(/Invalid meal type/);
  });

  it('prefers the supplied id over the name and never looks the name up', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: KNOWN_ID }] });
    await resolveMealTypeIdWithClient(client, KNOWN_ID, 'lunch');
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(String(queryMock.mock.calls[0][0])).toContain('WHERE id = $1');
  });

  it('resolves a name when no id is supplied', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: KNOWN_ID }] });
    await expect(
      resolveMealTypeIdWithClient(client, null, 'lunch')
    ).resolves.toBe(KNOWN_ID);
    expect(String(queryMock.mock.calls[0][0])).toContain('LOWER(name)');
  });

  it('rejects an unknown name', async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await expect(
      resolveMealTypeIdWithClient(client, null, 'brunchh')
    ).rejects.toThrow(/Invalid meal type: brunchh/);
  });

  it('passes through when neither id nor name is supplied', async () => {
    await expect(
      resolveMealTypeIdWithClient(client, null, null)
    ).resolves.toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });
});
