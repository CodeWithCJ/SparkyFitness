import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  systemQuery: vi.fn(),
  familyQuery: vi.fn(),
}));

vi.mock('../db/poolManager.js', () => ({
  getSystemClient: vi.fn(async () => ({
    query: mocks.systemQuery,
    release: vi.fn(),
  })),
  getClient: vi.fn(async () => ({
    query: mocks.familyQuery,
    release: vi.fn(),
  })),
}));

import { canAccessUserData } from '../utils/permissionUtils.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Two different accounts whose addresses differ only by letter case.
  mocks.systemQuery.mockResolvedValue({
    rows: [{ target_email: 'Owner@x.com', auth_email: 'owner@x.com' }],
  });
  mocks.familyQuery.mockResolvedValue({ rowCount: 0 });
});

describe('canAccessUserData never treats a matching email as a grant', () => {
  it('allows a user their own data without any lookup', async () => {
    expect(await canAccessUserData('a', 'diary', 'a')).toBe(true);
    expect(mocks.familyQuery).not.toHaveBeenCalled();
  });

  it('refuses another account with a case-variant email and no grant', async () => {
    for (const permission of ['reports', 'diary', 'checkin', 'symptoms']) {
      expect(await canAccessUserData('a', permission, 'b')).toBe(false);
    }
    expect(mocks.systemQuery).not.toHaveBeenCalled();
    expect(mocks.familyQuery).toHaveBeenCalled();
  });

  it('lets a real family grant through', async () => {
    mocks.familyQuery.mockResolvedValue({ rowCount: 1 });
    expect(await canAccessUserData('a', 'reports', 'b')).toBe(true);
  });
});
