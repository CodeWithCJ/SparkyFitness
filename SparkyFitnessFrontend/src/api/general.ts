import { ReleaseInfo } from '@/components/NewReleaseDialog';
import { apiCall } from './api';
interface VersionResponse {
  version: string;
}
export const getCurrentVersion = async (): Promise<VersionResponse> => {
  return apiCall('/version/current', {
    method: 'GET',
  });
};
export interface GitHubRepoResponse {
  stargazers_count: number;
}
export const getGitHubRepo = async (
  owner: string,
  repo: string
): Promise<GitHubRepoResponse> => {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    }
  );

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }

  return response.json() as Promise<GitHubRepoResponse>;
};
export interface LatestReleaseResponse {
  version: string;
  isNewVersionAvailable: boolean;
}
export const getLatestGithubRelease = async (): Promise<ReleaseInfo> => {
  return apiCall('/version/latest-github', {
    method: 'GET',
  });
};

export interface AnnouncementInfo {
  id: string;
  active: boolean;
  title: string;
  message: string;
  publishedAt?: string;
  htmlUrl?: string;
}

export const getLatestAnnouncement = async (): Promise<AnnouncementInfo> => {
  return apiCall('/announcement/current', {
    method: 'GET',
  });
};
