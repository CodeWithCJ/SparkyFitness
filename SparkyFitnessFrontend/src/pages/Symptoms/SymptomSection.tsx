import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface SymptomSectionProps {
  title: string;
  /** Shown at the right of the header, e.g. how many chips are picked. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** One collapsible block of the log form. Sections start closed unless asked. */
export default function SymptomSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: SymptomSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <CollapsibleTrigger className="flex w-full items-center justify-between py-3 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          {summary ? <span>{summary}</span> : null}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-3 pb-4">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
