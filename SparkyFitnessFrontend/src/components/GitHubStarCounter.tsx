import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming cn is available for utility classes

interface GitHubStarCounterProps {
  owner: string;
  repo: string;
  className?: string;
}

const GitHubStarCounter: React.FC<GitHubStarCounterProps> = ({ owner, repo, className }) => {
  const [starCount, setStarCount] = useState<string | null>(null);

  useEffect(() => {
    const fetchStarCount = async () => {
      try {
        const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}`);
        if (response.status === 200) {
          const count = response.data.stargazers_count;
          setStarCount(formatStarCount(count));
        } else {
          console.warn(`Failed to fetch star count for ${owner}/${repo}. Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Error fetching GitHub star count for ${owner}/${repo}:`, error);
      }
    };

    fetchStarCount();
  }, [owner, repo]);

  const formatStarCount = (count: number): string => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count.toString();
  };

  if (!starCount) {
    return null; // Don't render anything if star count isn't fetched yet
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