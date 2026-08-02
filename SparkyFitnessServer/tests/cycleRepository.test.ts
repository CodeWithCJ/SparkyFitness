import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import cycleRepository from '../models/cycleRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('cycleRepository.upsertLog', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  beforeEach(() => {
    mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [{ id: 'log-1' }] }),
      release: vi.fn(),
    };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  const sqlOf = () => mockClient.query.mock.calls[0][0] as string;
  const paramsOf = () => mockClient.query.mock.calls[0][1] as unknown[];

  it('clears a field when the caller sends an explicit null', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      cervical_mucus: null,
      cervical_position: null,
    });

    expect(sqlOf()).toContain('cervical_mucus = $3');
    expect(sqlOf()).toContain('cervical_position = $4');
    expect(sqlOf()).not.toContain('COALESCE');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01', null, null]);
  });

  it('leaves omitted fields untouched', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      flow_level: 'medium',
    });

    expect(sqlOf()).toContain('flow_level = $3');
    expect(sqlOf()).not.toContain('cervical_mucus =');
    expect(sqlOf()).not.toContain('notes =');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01', 'medium']);
  });

  it('serializes jsonb payloads and passes arrays through', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {
      product_usage: { pad: 2 },
      unusual_discharge: ['gray'],
      custom_fields: { opk: 'peak' },
    });

    expect(paramsOf()).toEqual([
      'user-1',
      '2026-08-01',
      JSON.stringify({ pad: 2 }),
      ['gray'],
      JSON.stringify({ opk: 'peak' }),
    ]);
  });

  it('still touches the row when the body has no writable fields', async () => {
    await cycleRepository.upsertLog('user-1', '2026-08-01', {});

    expect(sqlOf()).toContain('DO UPDATE SET');
    expect(sqlOf()).toContain('updated_at = NOW()');
    expect(paramsOf()).toEqual(['user-1', '2026-08-01']);
  });
});
