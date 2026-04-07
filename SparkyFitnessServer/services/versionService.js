const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Function to get the application version from package.json
function getAppVersion() {
  try {
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.error('Failed to read version from package.json:', error);
    return 'unknown';
  }
}

async function getLatestGitHubRelease() {
  const currentVersion = getAppVersion();
  // Assuming your GitHub repo is public, otherwise you'd need an API token
  const repoUrl =
    'https://api.github.com/repos/CodeWithCJ/SparkyFitness/releases/latest';

  try {
    const response = await axios.get(repoUrl);
    const latestRelease = response.data;
    const latestVersion = latestRelease.tag_name.replace('v', ''); // Assumes tags are like 'v1.2.3'

    return {
      version: `v${latestVersion}`,
      releaseNotes: latestRelease.body,
      publishedAt: latestRelease.published_at,
      htmlUrl: latestRelease.html_url,
      isNewVersionAvailable: latestVersion !== currentVersion,
    };
  } catch (error) {
    console.error('Error fetching latest GitHub release:', error);
    throw new Error('Failed to fetch latest GitHub release', { cause: error });
  }
}

module.exports = { getAppVersion, getLatestGitHubRelease };
