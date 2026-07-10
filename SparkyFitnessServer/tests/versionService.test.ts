import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAppVersion } from '../services/versionService.js';

describe('versionService.getAppVersion', () => {
  const originalPackageVersion = process.env.npm_package_version;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPackageVersion === undefined) {
      delete process.env.npm_package_version;
    } else {
      process.env.npm_package_version = originalPackageVersion;
    }
  });

  it('uses the runtime-injected package version when present', () => {
    process.env.npm_package_version = '0.17.3';

    expect(getAppVersion()).toBe('0.17.3');
  });

  it('falls back to the statically bundled package version', () => {
    delete process.env.npm_package_version;

    expect(getAppVersion()).toBe('0.17.3');
  });
});
