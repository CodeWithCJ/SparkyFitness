import {
  getCurrentVersion,
  getGitHubRepo,
  getLatestGithubRelease,
} from '@/api/general';
import { generalKeys } from '@/api/keys/general';
import { useQuery } from '@tanstack/react-query';

export const useCurrentVersionQuery = () => {
  return useQuery({
    queryKey: generalKeys.appVersion,
    queryFn: getCurrentVersion,
    staleTime: Infinity,
  });
};

interface CachedStarData {
  count: number;
}

const getCacheKey = (owner: string, repo: string) =>
  `github-stars-${owner}-${repo}`;

export const useGitHubStarsQuery = (owner: string, repo: string) => {
  return useQuery<number, Error>({
    queryKey: generalKeys.githubStars(owner, repo),
    queryFn: async () => {
      try {
        const data = await getGitHubRepo(owner, repo);
        localStorage.setItem(
          getCacheKey(owner, repo),
          JSON.stringify({ count: data.stargazers_count })
        );
        return data.stargazers_count;
      } catch (error) {
        const staleCache = localStorage.getItem(getCacheKey(owner, repo));
        if (staleCache) {
          try {
            const parsed: CachedStarData = JSON.parse(staleCache);
            return parsed.count;
          } catch (e) {
            // don't throw error to prevent a toast
            console.error('Error getting stargazers_count');
          }
        }
      }
    },
    initialData: () => {
      const cached = localStorage.getItem(getCacheKey(owner, repo));
      if (cached) {
        try {
          const parsed: CachedStarData = JSON.parse(cached);
          return parsed.count;
        } catch (e) {
          return undefined;
        }
      }
      return undefined;
    },
    staleTime: 1000 * 60 * 60 * 24,
    enabled: Boolean(owner && repo),
  });
};

interface UseLatestReleaseOptions {
  enabled: boolean;
}

export const useLatestReleaseQuery = ({ enabled }: UseLatestReleaseOptions) => {
  return useQuery({
    queryKey: generalKeys.githubVersion,
    queryFn: getLatestGithubRelease,
    staleTime: 1000 * 60 * 60,
  });
};
