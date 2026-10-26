import { vi, beforeEach, describe, it, expect } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));
vi.mock('https', () => ({
  default: {
    get: vi.fn(),
  },
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  isVersionCheckEnabled: vi.fn(),
}));

import axios from 'axios';
import https from 'https';
import { isVersionCheckEnabled } from '../models/globalSettingsRepository.js';
import {
  getAppVersion,
  getLatestGitHubRelease,
} from '../services/versionService.js';

const mockVersionCheckEnabled = vi.mocked(isVersionCheckEnabled);

function mockGitHubRelease() {
  vi.mocked(axios.get).mockResolvedValue({
    data: {
      tag_name: 'v999.0.0',
      body: 'notes',
      published_at: '2026-01-01T00:00:00.000Z',
      html_url:
        'https://github.com/CodeWithCJ/SparkyFitness/releases/tag/v999.0.0',
    },
  });
}

describe('versionService - enable_version_check admin setting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('makes no request to GitHub and reports the local version when turned off', async () => {
    mockVersionCheckEnabled.mockResolvedValue(false);

    const result = await getLatestGitHubRelease(true);

    expect(axios.get).not.toHaveBeenCalled();
    expect(https.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      version: `v${getAppVersion()}`,
      isNewVersionAvailable: false,
      releaseNotes: '',
      htmlUrl: '',
    });
  });

  it('still checks GitHub when the setting is on (the default)', async () => {
    mockVersionCheckEnabled.mockResolvedValue(true);
    mockGitHubRelease();

    const result = await getLatestGitHubRelease(true);

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(result.version).toBe('v999.0.0');
    expect(result.isNewVersionAvailable).toBe(true);
  });

  it('stops serving a cached release as soon as the setting is turned off', async () => {
    mockVersionCheckEnabled.mockResolvedValue(true);
    mockGitHubRelease();
    // Fills the 15-minute release cache.
    await getLatestGitHubRelease(true);

    mockVersionCheckEnabled.mockResolvedValue(false);
    const result = await getLatestGitHubRelease();

    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(result.version).toBe(`v${getAppVersion()}`);
    expect(result.isNewVersionAvailable).toBe(false);
  });
});
