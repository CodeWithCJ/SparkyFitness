import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, release, getClient } = vi.hoisted(() => {
  const query = vi.fn();
  const release = vi.fn();
  return {
    query,
    release,
    getClient: vi.fn(async () => ({ query, release })),
  };
});

vi.mock('../db/poolManager.js', () => ({ getClient }));

import huaweiHealthOAuthRepository from '../integrations/huaweihealth/huaweiHealthOAuthRepository.js';
import {
  updateHuaweiGrantedScopes,
  updateHuaweiLastSync,
} from '../integrations/huaweihealth/huaweiHealthSyncRepository.js';

describe('Huawei Health OAuth repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores state through the owner RLS context without using a system client', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'provider-1' }] });

    await huaweiHealthOAuthRepository.storeOAuthState(
      'user-1',
      'user-1',
      'state.nonce.123'
    );

    expect(getClient).toHaveBeenCalledWith('user-1', 'user-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('provider_type = $2 AND is_public = FALSE'),
      ['user-1', 'huaweihealth', 'state.nonce.123', 'HUAWEI Health']
    );
    expect(query.mock.calls[0][0]).toContain('provider_name = $4');
    expect(release).toHaveBeenCalledOnce();
  });

  it('creates a private inactive provider lazily when none exists', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'provider-1' }] });

    await huaweiHealthOAuthRepository.storeOAuthState(
      'user-1',
      'user-1',
      'state.nonce.123'
    );

    expect(query.mock.calls[1][0]).toContain(
      'VALUES ($1, $2, $3, FALSE, FALSE, $4, NOW(), NOW())'
    );
    expect(query.mock.calls[1][1]).toEqual([
      'user-1',
      'HUAWEI Health',
      'huaweihealth',
      'state.nonce.123',
    ]);
  });

  it('returns a stable conflict when the reserved provider name is already in use', async () => {
    query.mockRejectedValueOnce(
      Object.assign(new Error('unique violation'), { code: '23505' })
    );

    await expect(
      huaweiHealthOAuthRepository.storeOAuthState(
        'user-1',
        'user-1',
        'state.nonce.123'
      )
    ).rejects.toMatchObject({
      code: 'HUAWEI_PROVIDER_CONFLICT',
      statusCode: 409,
    });
  });

  it('consumes matching state atomically under a row lock', async () => {
    query.mockResolvedValueOnce({
      rows: [{ oauth_state: 'state.nonce.123' }],
    });

    await expect(
      huaweiHealthOAuthRepository.consumeOAuthState('user-1', 'user-1', 'state')
    ).resolves.toBe('state.nonce.123');

    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[0][0]).toContain('SET oauth_state = NULL');
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'huaweihealth', 'state']);
  });

  it('stores only encrypted token material and keeps the row private', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'provider-1' }] });

    await huaweiHealthOAuthRepository.saveTokens('user-1', 'user-1', {
      accessToken: { encryptedText: 'access', iv: 'aiv', tag: 'atag' },
      refreshToken: { encryptedText: 'refresh', iv: 'riv', tag: 'rtag' },
      tokenExpiresAt: new Date('2026-07-10T13:00:00.000Z'),
      scope: 'openid',
      externalUserId: 'huawei-user',
    });

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain('encrypted_access_token = $3');
    expect(sql).toContain('encrypted_refresh_token = $6');
    expect(sql).toContain('is_public = FALSE');
    expect(query.mock.calls[0][1]).not.toContain('client-secret');
  });

  it('updates sync completion through the same owner RLS context', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    const completedAt = new Date('2026-07-10T12:00:00.000Z');

    await updateHuaweiLastSync('user-1', 'user-1', completedAt);

    expect(getClient).toHaveBeenCalledWith('user-1', 'user-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/provider_type = 'huaweihealth'/),
      ['user-1', completedAt]
    );
  });

  it('persists the live granted scope list through the owner RLS context', async () => {
    query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    await updateHuaweiGrantedScopes('user-1', 'user-1', ['scope-a', 'scope-b']);

    expect(getClient).toHaveBeenCalledWith('user-1', 'user-1');
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/SET scope = \$2/),
      ['user-1', 'scope-a scope-b']
    );
  });
});
