import { Info } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoTooltipProps {
  content: string;
  className?: string;
}

export function InfoTooltip({
  content,
  className = 'h-4 w-4 text-muted-foreground hover:text-foreground',
}: InfoTooltipProps) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild type="button">
          <span
            className="inline-flex cursor-help items-center align-middle"
            tabIndex={0}
            role="button"
          >
            <Info className={className} />
            <span className="sr-only">{content}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs font-normal">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
