import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface BreakdownSectionProps {
  step: number;
  title: string;
  tag: string;
  value: string;
  testId: string;
  children: ReactNode;
}

/**
 * One numbered step of the target breakdown: the header shows what the step
 * produced, and the step's full working opens beneath it. Native <details>,
 * so the working stays in the page for find-in-page and screen readers.
 */
export const BreakdownSection = ({
  step,
  title,
  tag,
  value,
  testId,
  children,
}: BreakdownSectionProps) => (
  <details
    className="group/step border-b border-border/60 last:border-b-0"
    data-testid={testId}
  >
    <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold tabular-nums text-foreground">
        {step}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">
          {title}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {tag}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
      <ChevronDown
        className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/step:rotate-180"
        aria-hidden="true"
      />
    </summary>
    <div className="pb-3 pl-9">{children}</div>
  </details>
);
