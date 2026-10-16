import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TagInputProps {
  id?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: readonly string[];
  resolveValue?: (input: string) => string;
  getLabel?: (value: string) => string;
  isCanonical?: (value: string) => boolean;
  showBodyMapHint?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({
  id,
  value,
  onChange,
  suggestions = [],
  resolveValue = (s) => s.trim(),
  getLabel = (s) => s,
  isCanonical,
  showBodyMapHint = false,
  placeholder,
  className,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(
    () => new Set(value.map((v) => v.toLowerCase())),
    [value]
  );

  const filteredSuggestions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    return suggestions.filter((item) => {
      const lower = item.toLowerCase();
      if (selectedSet.has(lower)) return false;
      if (!query) return true;
      const label = getLabel(item).toLowerCase();
      return lower.includes(query) || label.includes(query);
    });
  }, [suggestions, selectedSet, inputValue, getLabel]);

  const hasCustomAdd = useMemo(() => {
    const query = inputValue.trim();
    if (!query) return false;
    const resolved = resolveValue(query);
    if (selectedSet.has(resolved.toLowerCase())) return false;
    return !filteredSuggestions.some(
      (s) => s.toLowerCase() === resolved.toLowerCase()
    );
  }, [inputValue, resolveValue, selectedSet, filteredSuggestions]);

  const totalDropdownItems =
    filteredSuggestions.length + (hasCustomAdd ? 1 : 0);

  const addTag = (tagToAdd: string) => {
    const resolvedTags = tagToAdd
      .split(',')
      .map((tag) => resolveValue(tag))
      .filter(Boolean);
    const tagsToAdd = resolvedTags.filter(
      (tag, index) =>
        !selectedSet.has(tag.toLowerCase()) &&
        resolvedTags.findIndex(
          (candidate) => candidate.toLowerCase() === tag.toLowerCase()
        ) === index
    );
    if (tagsToAdd.length === 0) {
      setInputValue('');
      setIsOpen(false);
      setHighlightedIndex(-1);
      return;
    }
    onChange([...value, ...tagsToAdd]);
    setInputValue('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  };

  const removeTag = (indexToRemove: number) => {
    onChange(value.filter((_, i) => i !== indexToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
      } else {
        setHighlightedIndex((prev) =>
          prev + 1 < totalDropdownItems ? prev + 1 : 0
        );
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(totalDropdownItems - 1);
      } else {
        setHighlightedIndex((prev) =>
          prev - 1 >= 0 ? prev - 1 : totalDropdownItems - 1
        );
      }
      return;
    }

    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (isOpen && highlightedIndex >= 0) {
        if (highlightedIndex < filteredSuggestions.length) {
          const suggestion = filteredSuggestions[highlightedIndex];
          if (suggestion) addTag(suggestion);
        } else if (hasCustomAdd) {
          addTag(inputValue);
        }
      } else if (inputValue.trim()) {
        addTag(inputValue);
      }
      return;
    }

    if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const hasNonCanonicalTag = useMemo(() => {
    if (!showBodyMapHint || !isCanonical) return false;
    return value.some((v) => !isCanonical(v));
  }, [showBodyMapHint, isCanonical, value]);

  return (
    <div
      className={cn('relative flex flex-col gap-1 w-full', className)}
      ref={containerRef}
    >
      <div
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-xs transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:border-ring',
          disabled && 'cursor-not-allowed opacity-50'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, index) => (
          <Badge
            key={`${tag}-${index}`}
            variant="secondary"
            className="flex items-center gap-1 text-xs px-2 py-0.5"
          >
            <span>{getLabel(tag)}</span>
            {!disabled && (
              <button
                type="button"
                className="rounded-full outline-hidden hover:bg-muted p-0.5 -mr-0.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(index);
                }}
                aria-label={t(
                  'components.tagInput.removeTag',
                  'Remove {{tag}}',
                  {
                    tag: getLabel(tag),
                  }
                )}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}

        {!disabled && (
          <input
            id={id}
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder={
              value.length === 0
                ? placeholder ||
                  t(
                    'exercise.addExerciseDialog.tagInputPlaceholder',
                    'Type to add or search...'
                  )
                : ''
            }
            className="flex-1 min-w-[120px] bg-transparent outline-none placeholder:text-muted-foreground text-sm"
          />
        )}
      </div>

      {isOpen && !disabled && totalDropdownItems > 0 && (
        <div className="absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          {filteredSuggestions.map((suggestion, index) => {
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={suggestion}
                className={cn(
                  'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                  isHighlighted && 'bg-accent text-accent-foreground'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(suggestion);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {getLabel(suggestion)}
              </div>
            );
          })}

          {hasCustomAdd && (
            <div
              className={cn(
                'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm text-primary outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
                highlightedIndex === filteredSuggestions.length &&
                  'bg-accent text-accent-foreground'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(inputValue);
              }}
              onMouseEnter={() =>
                setHighlightedIndex(filteredSuggestions.length)
              }
            >
              {t('exercise.addExerciseDialog.addCustomTag', {
                tag: inputValue.trim(),
                defaultValue: `Add "${inputValue.trim()}"`,
              })}
            </div>
          )}
        </div>
      )}

      {hasNonCanonicalTag && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {t(
            'exercise.addExerciseDialog.customMuscleBodyMapHint',
            "Custom muscles won't appear on the body map."
          )}
        </p>
      )}
    </div>
  );
};
