import fs from 'node:fs';
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

  it('uses the build-injected package version when package.json is not bundled', () => {
    process.env.npm_package_version = '0.17.3';
    vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
      throw new Error('ENOENT: package.json was not bundled');
    });

    expect(getAppVersion()).toBe('0.17.3');
  });
});
