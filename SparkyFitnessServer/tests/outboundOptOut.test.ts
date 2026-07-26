import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import https from 'https';
import announcementService from '../services/announcementService.js';
import versionService, { getAppVersion } from '../services/versionService.js';

// Both services try axios first and fall back to the native https module, which
// deliberately bypasses any outbound proxy. Mocking both is what proves the
// opt-out short-circuits before either transport is reached.
vi.mock('axios');
vi.mock('https');

describe('SPARKY_FITNESS_DISABLE_UPSTREAM_NOTICES', () => {
  const previous = process.env.SPARKY_FITNESS_DISABLE_UPSTREAM_NOTICES;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPARKY_FITNESS_DISABLE_UPSTREAM_NOTICES = 'true';
  });

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.SPARKY_FITNESS_DISABLE_UPSTREAM_NOTICES;
    } else {
      process.env.SPARKY_FITNESS_DISABLE_UPSTREAM_NOTICES = previous;
    }
  });

  it('makes no request for announcements', async () => {
    const result = await announcementService.getLatestAnnouncement();

    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    expect(vi.mocked(https.get)).not.toHaveBeenCalled();
    expect(result.active).toBe(false);
  });

  it('makes no request for the update check', async () => {
    const result = await versionService.getLatestGitHubRelease();

    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    expect(vi.mocked(https.get)).not.toHaveBeenCalled();
    expect(result.version).toBe(`v${getAppVersion()}`);
    expect(result.isNewVersionAvailable).toBe(false);
    expect(result.releaseNotes).toBe('');
  });

  it('stays offline even when the cache is bypassed', async () => {
    await announcementService.getLatestAnnouncement(true);
    await versionService.getLatestGitHubRelease(true);

    expect(vi.mocked(axios.get)).not.toHaveBeenCalled();
    expect(vi.mocked(https.get)).not.toHaveBeenCalled();
  });
});
