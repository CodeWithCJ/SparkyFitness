import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { OptionItem } from '@workspace/shared';
import { translateSymptomLabel } from './symptomLabels';

interface ChipPickerProps {
  items: OptionItem[];
  selected: string[];
  onToggle: (label: string) => void;
  /** Creates a new option and selects it. Omit to hide the "add" control. */
  onAddCustom?: (label: string) => void;
  /** Removes one of the user's own options. */
  onRemoveCustom?: (optionId: string, label: string) => void;
  /**
   * When true, selected items not present in `items` are rendered as extra chips.
   * Useful for standalone lists to display legacy/hidden items, but disabled for
   * grouped lists (like triggers) to prevent selected items from one group showing in all groups.
   */
  showOrphans?: boolean;
}

const chipClass = (on: boolean) =>
  cn(
    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    on
      ? 'border-primary bg-primary/10 font-medium text-primary'
      : 'border-border bg-background text-foreground hover:bg-muted'
  );

/**
 * Multi-select chips over a pick-list.
 */
export default function ChipPicker({
  items,
  selected,
  onToggle,
  onAddCustom,
  onRemoveCustom,
  showOrphans = true,
}: ChipPickerProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const selectedSet = new Set(selected);
  const known = new Set(items.map((i) => i.label));
  const orphans = showOrphans ? selected.filter((s) => !known.has(s)) : [];
  const all: OptionItem[] = [
    ...items,
    ...orphans.map((label) => ({ label, isCustom: false })),
  ];

  const submit = () => {
    const label = draft.trim();
    if (!label || !onAddCustom) return;
    onAddCustom(label);
    setDraft('');
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {all.map((item) => {
          const on = selectedSet.has(item.label);
          const optionId = item.optionId;
          return (
            <span key={item.label} className="inline-flex items-center">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(item.label)}
                className={chipClass(on)}
              >
                {item.isCustom
                  ? item.label
                  : translateSymptomLabel(t, item.label)}
              </button>
              {item.isCustom && optionId && onRemoveCustom && (
                <button
                  type="button"
                  onClick={() => onRemoveCustom(optionId, item.label)}
                  aria-label={t('symptoms.chips.remove', 'Remove {{name}}', {
                    name: item.label,
                  })}
                  className="-ml-1 rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          );
        })}
        {onAddCustom && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(chipClass(false), 'border-dashed text-primary')}
          >
            <Plus className="h-3 w-3" />
            {t('symptoms.chips.add', 'Add')}
          </button>
        )}
      </div>
      {onAddCustom && adding && (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={draft}
            maxLength={80}
            className="h-8 text-xs"
            aria-label={t('symptoms.chips.newLabel', 'New option name')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
              if (e.key === 'Escape') setAdding(false);
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className={chipClass(true)}
          >
            {t('symptoms.chips.save', 'Save')}
          </button>
        </div>
      )}
    </div>
  );
}
