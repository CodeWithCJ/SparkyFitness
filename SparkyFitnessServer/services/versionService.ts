import fs from 'fs';
import path from 'path';
import axios from 'axios';
import https from 'https';
import { fileURLToPath } from 'url';
import { log } from '../config/logging.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface GitHubReleaseResponse {
  version: string;
  releaseNotes: string;
  publishedAt: string;
  htmlUrl: string;
  isNewVersionAvailable: boolean;
}

interface GitHubRawRelease {
  tag_name: string;
  body?: string;
  published_at?: string;
  html_url?: string;
}

let cachedRelease: GitHubReleaseResponse | null = null;
let cacheExpiry = 0;
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Helper function to check if the latest version is newer than the current version
function isVersionNewer(latest: string, current: string): boolean {
  const latestClean = latest.replace(/^v/, '');
  const currentClean = current.replace(/^v/, '');
  const latestParts = latestClean.split('.').map((p) => parseInt(p, 10) || 0);
  const currentParts = currentClean.split('.').map((p) => parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }
  return false;
}

// Helper function to fetch data directly via native https module, bypassing any proxy config
function fetchDirect(url: string): Promise<GitHubRawRelease> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'SparkyFitness-App',
      },
      timeout: 8000,
    };
    const req = https.get(url, options, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`Direct fetch failed with status: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Direct fetch timed out after 8s'));
    });
  });
}

// Function to get the application version from package.json
function getAppVersion(): string {
  try {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    log('error', 'Failed to read version from package.json:', error);
    return 'unknown';
  }
}

async function getLatestGitHubRelease(
  bypassCache = false
): Promise<GitHubReleaseResponse> {
  const currentVersion = getAppVersion();
  const now = Date.now();

  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

  // Return cached response if it's still fresh and we are not bypassing it or in dev
  if (!bypassCache && !isDev && cachedRelease && now < cacheExpiry) {
    return cachedRelease;
  }

  const repoUrl =
    'https://api.github.com/repos/CodeWithCJ/SparkyFitness/releases/latest';

  let latestRelease: GitHubRawRelease | null = null;
  let fetchError: Error | null = null;

  try {
    // 1. Try Axios first (uses outbound proxy if configured)
    const response = await axios.get(repoUrl, {
      timeout: 8000, // 8 seconds timeout
      headers: {
        'User-Agent': 'SparkyFitness-App',
      },
    });
    latestRelease = response.data as GitHubRawRelease;
  } catch (error) {
    fetchError = error instanceof Error ? error : new Error(String(error));
    log(
      'warn',
      'Failed to fetch latest GitHub release via proxy Axios, attempting direct fallback...',
      error
    );
  }

  // 2. If Axios failed, fallback to native https (bypasses outbound proxy)
  if (!latestRelease) {
    try {
      latestRelease = await fetchDirect(repoUrl);
      log(
        'info',
        'Successfully fetched latest GitHub release directly (bypassed proxy)'
      );
    } catch (fallbackError) {
      const actualError =
        fallbackError instanceof Error
          ? fallbackError
          : new Error(String(fallbackError));
      log(
        'error',
        'Failed direct fallback fetch for GitHub release:',
        actualError
      );
      // Throw the original Axios error to be handled by the outer catch
      throw fetchError || actualError;
    }
  }

  try {
    if (!latestRelease || !latestRelease.tag_name) {
      throw new Error('Invalid release payload received from GitHub API');
    }

    const latestVersion = latestRelease.tag_name.replace(/^v/, '');

    const result: GitHubReleaseResponse = {
      version: `v${latestVersion}`,
      releaseNotes: latestRelease.body || '',
      publishedAt: latestRelease.published_at || new Date().toISOString(),
      htmlUrl: latestRelease.html_url || '',
      isNewVersionAvailable: isVersionNewer(latestVersion, currentVersion),
    };

    // Cache the result
    cachedRelease = result;
    cacheExpiry = now + CACHE_DURATION_MS;

    return result;
  } catch (error) {
    log(
      'warn',
      'Failed to parse latest GitHub release, returning local version fallback:',
      error
    );

    // Graceful fallback: assume no update is available so the app functions normally
    return {
      version: `v${currentVersion}`,
      releaseNotes: '',
      publishedAt: new Date().toISOString(),
      htmlUrl: '',
      isNewVersionAvailable: false,
    };
  }
}

export { getAppVersion };
export { getLatestGitHubRelease };
export default {
  getAppVersion,
  getLatestGitHubRelease,
};
