import { MOOD_RATING_MAX, MOOD_RATING_MIN } from '@workspace/shared';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const RATINGS = Array.from(
  { length: MOOD_RATING_MAX - MOOD_RATING_MIN + 1 },
  (_, i) => MOOD_RATING_MIN + i
);

interface RatingSelectorProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  lowLabel: string;
  highLabel: string;
}

const RatingSelector = ({
  label,
  value,
  onChange,
  lowLabel,
  highLabel,
}: RatingSelectorProps) => (
  <div className="flex flex-col gap-2">
    <Label>{label}</Label>
    <div
      className="inline-flex w-full rounded-lg bg-muted p-0.5"
      role="group"
      aria-label={label}
    >
      {RATINGS.map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value === n}
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === n
              ? 'bg-background font-semibold shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {n}
        </button>
      ))}
    </div>
    <div className="flex justify-between text-xs text-muted-foreground">
      <span>{lowLabel}</span>
      <span>{highLabel}</span>
    </div>
  </div>
);

export default RatingSelector;
