import React from 'react';
import { Heart } from 'lucide-react'; // Using Heart icon for sponsor
import { cn } from '@/lib/utils'; // Assuming cn is available for utility classes

interface GitHubSponsorButtonProps {
  owner: string;
  className?: string;
}

const GitHubSponsorButton: React.FC<GitHubSponsorButtonProps> = ({ owner, className }) => {
  const sponsorUrl = `https://github.com/sponsors/${owner}`;

  return (
    <a href={sponsorUrl} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-1 bg-pink-100 dark:bg-pink-800 px-2 py-1 rounded-md text-sm text-pink-800 dark:text-pink-200 cursor-pointer", className)}>
      <Heart className="h-4 w-4 fill-current text-pink-500" />
      <span>Sponsor</span>
    </a>
  );
};

export default GitHubSponsorButton;