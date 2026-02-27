import type React from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGitHubStarsQuery } from '@/hooks/useGeneralQueries';

interface GitHubStarCounterProps {
  owner: string;
  repo: string;
  className?: string;
}

const CACHE_KEY_PREFIX = 'github_stars_';

const GitHubStarCounter: React.FC<GitHubStarCounterProps> = ({
  owner,
  repo,
  className,
}) => {
  const { data: starCountRaw } = useGitHubStarsQuery(owner, repo);

  const formatStarCount = (count: number): string => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  };
  const starCount =
    starCountRaw !== undefined ? formatStarCount(starCountRaw) : '0';

  if (!starCount) {
    return null;
  }

  const githubUrl = `https://github.com/${owner}/${repo}`;

  return (
    <a
      href={githubUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-1 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-md text-sm text-gray-800 dark:text-gray-200 cursor-pointer',
        className
      )}
    >
      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
      <span>{starCount}</span>
    </a>
  );
};

export default GitHubStarCounter;
