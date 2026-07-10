import { Check } from 'lucide-react';

interface OptionButtonProps {
  label: string;
  subLabel?: string;
  isSelected: boolean;
  onClick: () => void;
}

export const OptionButton = ({
  label,
  subLabel,
  isSelected,
  onClick,
}: OptionButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={isSelected}
    className={`
      my-3 flex w-full flex-col justify-center rounded-xl border-2 bg-card p-5 text-start
      transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
      ${
        isSelected
          ? 'border-primary shadow-sm'
          : 'border-border hover:border-primary/50 hover:shadow-sm'
      }
    `}
  >
    <div className="flex w-full items-center justify-between">
      <span className="text-lg font-semibold text-foreground">{label}</span>
      {isSelected && (
        <div className="rounded-full bg-primary p-1" aria-hidden="true">
          <Check className="h-4 w-4 text-primary-foreground" />
        </div>
      )}
    </div>
    {subLabel && (
      <span className="mt-1 text-sm text-muted-foreground">{subLabel}</span>
    )}
  </button>
);
