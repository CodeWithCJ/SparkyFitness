import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GitHubStarCounterProps {
  owner: string;
  repo: string;
  className?: string;
}

interface CachedStarData {
  count: string;
  timestamp: number;
}

const CACHE_KEY_PREFIX = 'github_stars_';
const CACHE_DURATION = 1 * 60 * 60 * 1000; // 1 hours

const GitHubStarCounter: React.FC<GitHubStarCounterProps> = ({ owner, repo, className }) => {
  const [starCount, setStarCount] = useState<string | null>(null);

  const getCacheKey = () => `${CACHE_KEY_PREFIX}${owner}/${repo}`;

  const formatStarCount = (count: number): string => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  };

  const getCachedData = (): CachedStarData | null => {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (!cached) return null;

      const data: CachedStarData = JSON.parse(cached);
      const isExpired = Date.now() - data.timestamp > CACHE_DURATION;

      if (isExpired) {
        localStorage.removeItem(getCacheKey());
        return null;
      }

      return data;
    } catch (error) {
      console.debug('Error reading GitHub stars cache:', error);
      return null;
    }
  };

  const setCachedData = (count: number): void => {
    try {
      const data: CachedStarData = {
        count: formatStarCount(count),
        timestamp: Date.now(),
      };
      localStorage.setItem(getCacheKey(), JSON.stringify(data));
    } catch (error) {
      console.debug('Error writing GitHub stars cache:', error);
    }
  };

  useEffect(() => {
    const fetchStarCount = async () => {
      // Check cache first
      const cached = getCachedData();
      if (cached) {
        setStarCount(cached.count);
        return;
      }

      try {
        const response = await axios.get(
          `https://api.github.com/repos/${owner}/${repo}`,
          { timeout: 5000 }
        );

        if (response.status === 200 && response.data.stargazers_count) {
          const count = response.data.stargazers_count;
          const formatted = formatStarCount(count);
          setStarCount(formatted);
          setCachedData(count);
        }
      } catch (error) {
        console.debug(`GitHub API error for ${owner}/${repo}`);
        
        // If API fails, try to use stale cache as fallback
        try {
          const staleCache = localStorage.getItem(getCacheKey());
          if (staleCache) {
            const data: CachedStarData = JSON.parse(staleCache);
            setStarCount(data.count);
          }
        } catch (e) {
          // Silent fail
        }
      }
    };

    fetchStarCount();
  }, [owner, repo]);

  if (!starCount) {
    return null;
  }

  const githubUrl = `https://github.com/${owner}/${repo}`;

  return (
    <a href={githubUrl} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md text-sm text-gray-800 dark:text-gray-200 cursor-pointer", className)}>
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span>{starCount}</span>
    </a>
  );
};

export default GitHubStarCounter;