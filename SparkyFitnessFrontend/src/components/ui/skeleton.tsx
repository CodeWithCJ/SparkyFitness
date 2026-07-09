import { cn } from '@/lib/utils';

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted motion-reduce:animate-none dark:bg-slate-700',
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
