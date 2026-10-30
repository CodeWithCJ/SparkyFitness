import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockRelease, mockGetSystemClient } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
  mockGetSystemClient: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: mockGetSystemClient,
}));

import {
  isOAuthAuthorizationActive,
  listOAuthAuthorizations,
  revokeOAuthAuthorization,
} from '../models/oauthClientRepository.js';

beforeEach(() => {
  mockQuery.mockReset();
  mockRelease.mockReset();
  mockGetSystemClient.mockReset().mockResolvedValue({
    query: mockQuery,
    release: mockRelease,
  });
});

describe('oauthClientRepository', () => {
  it('maps user-owned consent and client details', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          consent_id: '11111111-1111-4111-8111-111111111111',
          client_id: 'client-1',
          name: 'Claude',
          uri: 'https://claude.ai',
          icon: null,
          scopes: '["sparky:mcp","offline_access"]',
          created_at: new Date('2026-10-22T10:00:00Z'),
          updated_at: new Date('2026-10-22T10:00:00Z'),
        },
      ],
    });

    await expect(listOAuthAuthorizations('user-1')).resolves.toEqual([
      expect.objectContaining({
        consentId: '11111111-1111-4111-8111-111111111111',
        clientId: 'client-1',
        scopes: ['sparky:mcp', 'offline_access'],
      }),
    ]);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE consent.user_id = $1'),
      ['user-1']
    );
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it('requires consent, an enabled client, and a token newer than the revocation watermark', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          has_consent: true,
          issued_after_revocation: true,
          client_enabled: false,
        },
      ],
    });

    await expect(
      isOAuthAuthorizationActive('user-1', 'client-1', 1_700_000_000)
    ).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('disabled = false'),
      ['user-1', 'client-1', 1_700_000_000]
    );
  });

  it('revokes tokens and deletes only the user-owned consent transactionally', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ client_id: 'client-1' }] })
      .mockResolvedValueOnce({ rows: [] }) // watermark
      .mockResolvedValueOnce({ rows: [] }) // refresh tokens
      .mockResolvedValueOnce({ rows: [] }) // access tokens
      .mockResolvedValueOnce({ rows: [] }) // consent
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    await expect(
      revokeOAuthAuthorization('user-1', '11111111-1111-4111-8111-111111111111')
    ).resolves.toBe(true);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE oauth_refresh_token'),
      ['user-1', 'client-1']
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM oauth_consent'),
      ['11111111-1111-4111-8111-111111111111', 'user-1']
    );
    expect(mockQuery).toHaveBeenLastCalledWith('COMMIT');
  });

  it('does not revoke a consent owned by another user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(
      revokeOAuthAuthorization('user-1', '11111111-1111-4111-8111-111111111111')
    ).resolves.toBe(false);
    expect(mockQuery).toHaveBeenLastCalledWith('ROLLBACK');
  });
});
