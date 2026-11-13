import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_KEY_SCOPE_PERMISSIONS,
  isReadOnlyApiKeyPermissions,
} from '@workspace/shared';

const { mockGetApiKeyPermissions } = vi.hoisted(() => ({
  mockGetApiKeyPermissions: vi.fn(),
}));
vi.mock('../models/apiKeyRepository.js', () => ({
  getApiKeyPermissions: mockGetApiKeyPermissions,
  default: { getApiKeyPermissions: mockGetApiKeyPermissions },
}));

import {
  isApiKeyReadOnly,
  isMutatingMethod,
  isRequestAllowedForReadOnlyKey,
} from '../utils/apiKeyScope.js';

describe('isReadOnlyApiKeyPermissions (#2678)', () => {
  it('gives keys without permissions full access', () => {
    expect(isReadOnlyApiKeyPermissions(null)).toBe(false);
    expect(isReadOnlyApiKeyPermissions(undefined)).toBe(false);
    expect(isReadOnlyApiKeyPermissions('')).toBe(false);
    expect(isReadOnlyApiKeyPermissions('{}')).toBe(false);
  });

  it('reads both the stored string and the parsed object', () => {
    expect(isReadOnlyApiKeyPermissions('{"sparky":["read"]}')).toBe(true);
    expect(isReadOnlyApiKeyPermissions({ sparky: ['read'] })).toBe(true);
    expect(isReadOnlyApiKeyPermissions('{"sparky":["read","write"]}')).toBe(
      false
    );
    expect(isReadOnlyApiKeyPermissions(API_KEY_SCOPE_PERMISSIONS.full)).toBe(
      false
    );
    expect(isReadOnlyApiKeyPermissions(API_KEY_SCOPE_PERMISSIONS.read)).toBe(
      true
    );
  });

  it('refuses writes for malformed permissions', () => {
    expect(isReadOnlyApiKeyPermissions('not json')).toBe(true);
    expect(isReadOnlyApiKeyPermissions('["read"]')).toBe(true);
    expect(isReadOnlyApiKeyPermissions('{"sparky":"write"}')).toBe(true);
  });
});

describe('isRequestAllowedForReadOnlyKey (#2678)', () => {
  it('allows safe methods anywhere', () => {
    for (const m of ['GET', 'get', 'HEAD', 'OPTIONS']) {
      expect(isRequestAllowedForReadOnlyKey(m, '/api/food-entries')).toBe(true);
    }
  });

  it('refuses PUT, PATCH and DELETE even on allowlisted paths', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect(isRequestAllowedForReadOnlyKey(m, '/mcp')).toBe(false);
    }
  });

  it('allows POST only on the allowlist, ignoring query and trailing slash', () => {
    expect(isRequestAllowedForReadOnlyKey('POST', '/mcp')).toBe(true);
    expect(isRequestAllowedForReadOnlyKey('POST', '/mcp/?x=1')).toBe(true);
    expect(isRequestAllowedForReadOnlyKey('POST', '/api/ai/convert-unit')).toBe(
      true
    );
    expect(
      isRequestAllowedForReadOnlyKey('POST', '/api/foods/scan-label')
    ).toBe(true);
    expect(isRequestAllowedForReadOnlyKey('POST', '/api/chat')).toBe(false);
    expect(isRequestAllowedForReadOnlyKey('POST', '/api/mcp')).toBe(false);
  });

  it('refuses the run program realign POST, preview included', () => {
    // Both the preview and the confirmed call are POSTs to the same path, and
    // the confirmed one rewrites the plan, so the path is never allowlisted.
    expect(
      isRequestAllowedForReadOnlyKey('POST', '/api/v2/run-program/realign')
    ).toBe(false);
    expect(
      isRequestAllowedForReadOnlyKey('POST', '/api/v2/run-program/adjust')
    ).toBe(false);
    expect(isRequestAllowedForReadOnlyKey('GET', '/api/v2/run-program')).toBe(
      true
    );
  });

  it('classifies mutating methods', () => {
    expect(isMutatingMethod('GET')).toBe(false);
    expect(isMutatingMethod('POST')).toBe(true);
    expect(isMutatingMethod('delete')).toBe(true);
  });
});

describe('isApiKeyReadOnly (#2678)', () => {
  beforeEach(() => mockGetApiKeyPermissions.mockReset());

  it('looks the key up for its owner', async () => {
    mockGetApiKeyPermissions.mockResolvedValue('{"sparky":["read"]}');
    await expect(isApiKeyReadOnly('u1', 'key-1')).resolves.toBe(true);
    expect(mockGetApiKeyPermissions).toHaveBeenCalledWith('u1', 'key-1');
  });

  it('gives an unscoped key full access', async () => {
    mockGetApiKeyPermissions.mockResolvedValue(null);
    await expect(isApiKeyReadOnly('u1', 'key-1')).resolves.toBe(false);
  });

  it('fails closed without a key id or a visible key', async () => {
    await expect(isApiKeyReadOnly('u1', undefined)).resolves.toBe(true);
    mockGetApiKeyPermissions.mockResolvedValue(undefined);
    await expect(isApiKeyReadOnly('u1', 'key-x')).resolves.toBe(true);
  });
});
