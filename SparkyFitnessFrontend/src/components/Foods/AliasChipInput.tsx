import type React from 'react';
import { useState } from 'react';
import { X } from 'lucide-react';

// Chip/tag input for nutrient aliases. Each alias is a discrete token added on
// Enter, so a provider label that itself contains a comma (e.g. "Magnesium, Mg")
// stays a single alias instead of being split into two.
export const AliasChipInput: React.FC<{
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}> = ({ value, onChange, placeholder }) => {
  const [input, setInput] = useState('');
  const commit = () => {
    const trimmed = input.trim();
    if (
      trimmed &&
      !value.some((a) => a.toLowerCase() === trimmed.toLowerCase())
    ) {
      onChange([...value, trimmed]);
    }
    setInput('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-input p-2">
      {value.map((alias) => (
        <span
          key={alias}
          className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs"
        >
          {alias}
          <button
            type="button"
            aria-label={`Remove ${alias}`}
            onClick={() => onChange(value.filter((a) => a !== alias))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && !input && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[8rem] bg-transparent text-sm outline-none"
      />
    </div>
  );
};

export default AliasChipInput;
