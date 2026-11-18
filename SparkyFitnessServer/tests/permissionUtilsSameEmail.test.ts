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
  mocks.systemQuery.mockResolvedValue({
    rows: [{ target_email: 'Owner@x.com', auth_email: 'owner@x.com' }],
  });
  mocks.familyQuery.mockResolvedValue({ rowCount: 0 });
});

describe('canAccessUserData same-email shortcut', () => {
  it('still treats a matching email as the same person by default', async () => {
    expect(await canAccessUserData('a', 'reports', 'b')).toBe(true);
    expect(mocks.familyQuery).not.toHaveBeenCalled();
  });

  it('relies on a family grant alone when the caller opts out', async () => {
    expect(
      await canAccessUserData('a', 'reports', 'b', { allowSameEmail: false })
    ).toBe(false);
    expect(mocks.systemQuery).not.toHaveBeenCalled();
    expect(mocks.familyQuery).toHaveBeenCalled();
  });

  it('lets a real grant through when the caller opts out', async () => {
    mocks.familyQuery.mockResolvedValue({ rowCount: 1 });
    expect(
      await canAccessUserData('a', 'reports', 'b', { allowSameEmail: false })
    ).toBe(true);
  });
});
