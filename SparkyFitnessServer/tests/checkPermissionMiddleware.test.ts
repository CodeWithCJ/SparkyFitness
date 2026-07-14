import { vi, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../utils/permissionUtils.js', () => ({
  canAccessUserData: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import { canAccessUserData } from '../utils/permissionUtils.js';
import checkPermissionMiddleware from '../middleware/checkPermissionMiddleware.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function run(mw: any, req: any) {
  const res = buildRes();
  const next = vi.fn();
  return { promise: mw(req, res, next), res, next };
}

const mockedCanAccess = vi.mocked(canAccessUserData);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('checkPermissionMiddleware', () => {
  it('allows self-access without calling canAccessUserData', async () => {
    const mw = checkPermissionMiddleware('diary');
    const { promise, res, next } = run(mw, {
      method: 'POST',
      query: {},
      body: {},
      userId: 'user-a',
      originalUserId: 'user-a',
      authenticatedUserId: 'user-a',
    });
    await promise;

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
    expect(mockedCanAccess).not.toHaveBeenCalled();
  });

  it('allows a switched delegate that holds the permission on the active user', async () => {
    mockedCanAccess.mockResolvedValue(true);
    const mw = checkPermissionMiddleware('diary');
    const { promise, res, next } = run(mw, {
      method: 'POST',
      query: {},
      body: {},
      userId: 'victim',
      originalUserId: 'delegate',
      authenticatedUserId: 'delegate',
    });
    await promise;

    expect(mockedCanAccess).toHaveBeenCalledWith('victim', 'diary', 'delegate');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('denies a switched delegate that lacks the permission on the active user', async () => {
    mockedCanAccess.mockResolvedValue(false);
    const mw = checkPermissionMiddleware('diary');
    const { promise, res, next } = run(mw, {
      method: 'POST',
      query: {},
      body: {},
      userId: 'victim',
      originalUserId: 'delegate',
      authenticatedUserId: 'delegate',
    });
    await promise;

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('cannot be bypassed by spoofing the query userId back to self (finding #2)', async () => {
    // Delegate is switched into the victim (req.userId=victim) and appends
    // ?userId=<their own id> to trigger the self-access path. The victim context
    // must still be authorized.
    mockedCanAccess.mockResolvedValue(false);
    const mw = checkPermissionMiddleware('medications');
    const { promise, res, next } = run(mw, {
      method: 'PUT',
      query: { userId: 'delegate' },
      body: {},
      userId: 'victim',
      originalUserId: 'delegate',
      authenticatedUserId: 'delegate',
    });
    await promise;

    // The victim (req.userId) is authorized despite the self-referential query param.
    expect(mockedCanAccess).toHaveBeenCalledWith(
      'victim',
      'medications',
      'delegate'
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('authorizes a client-supplied body target in addition to the active context', async () => {
    // Non-switched user creating an entry for a family member via body.user_id.
    mockedCanAccess.mockResolvedValue(true);
    const mw = checkPermissionMiddleware('diary');
    const { promise, next } = run(mw, {
      method: 'POST',
      query: {},
      body: { user_id: 'family-member' },
      userId: 'self',
      originalUserId: 'self',
      authenticatedUserId: 'self',
    });
    await promise;

    // 'self' is skipped as own-data; the family member is checked.
    expect(mockedCanAccess).toHaveBeenCalledWith(
      'family-member',
      'diary',
      'self'
    );
    expect(mockedCanAccess).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledOnce();
  });

  it('denies when any named target is unauthorized', async () => {
    mockedCanAccess.mockResolvedValue(false);
    const mw = checkPermissionMiddleware('diary');
    const { promise, res, next } = run(mw, {
      method: 'POST',
      query: {},
      body: { user_id: 'stranger' },
      userId: 'self',
      originalUserId: 'self',
      authenticatedUserId: 'self',
    });
    await promise;

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('resolves GET diary to the read permission', async () => {
    mockedCanAccess.mockResolvedValue(true);
    const mw = checkPermissionMiddleware('diary');
    const { promise } = run(mw, {
      method: 'GET',
      query: {},
      body: {},
      userId: 'victim',
      originalUserId: 'delegate',
      authenticatedUserId: 'delegate',
    });
    await promise;

    expect(mockedCanAccess).toHaveBeenCalledWith(
      'victim',
      'diary_read',
      'delegate'
    );
  });

  it("ignores the literal string 'undefined' in target params", async () => {
    mockedCanAccess.mockResolvedValue(true);
    const mw = checkPermissionMiddleware('diary');
    const { promise, next } = run(mw, {
      method: 'GET',
      query: { targetUserId: 'undefined' },
      body: {},
      userId: 'self',
      originalUserId: 'self',
      authenticatedUserId: 'self',
    });
    await promise;

    expect(mockedCanAccess).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
