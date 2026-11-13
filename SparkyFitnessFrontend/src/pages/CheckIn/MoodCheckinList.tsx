import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import {
  moodByName,
  moodValueToTag,
  summarizeCheckins,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';
import type { MoodEntry } from '@/types/mood';
import { formatTimeInZone } from '@/utils/timeFormatters';

interface MoodCheckinListProps {
  /** The day's manual check-ins, in time order (as the server returns them). */
  checkins: MoodEntry[];
  editingId: string | null;
  /** The check-in whose delete is in flight; its buttons are off. */
  deletingId: string | null;
  onEdit: (entry: MoodEntry) => void;
  onDelete: (entry: MoodEntry) => void;
}

const SNIPPET_MAX = 120;

const snippet = (notes: string | null) => {
  const text = (notes ?? '').trim();
  return text.length > SNIPPET_MAX
    ? `${text.slice(0, SNIPPET_MAX - 1).trimEnd()}…`
    : text;
};

export const MoodCheckinList = ({
  checkins,
  editingId,
  deletingId,
  onEdit,
  onDelete,
}: MoodCheckinListProps) => {
  const { t } = useTranslation();
  const { timezone, timeFormat } = usePreferences();
  const averageLabelId = useId();

  if (checkins.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t('checkIn.noCheckins', 'No check-ins yet for this day.')}
      </p>
    );
  }

  const average = summarizeCheckins(checkins);

  // The banded mood a value falls in, as the meter names it.
  const moodText = (value: number) => {
    const def = moodByName(moodValueToTag(value));
    return def
      ? `${def.emoji} ${t(`moodMeter.${def.name}`, def.displayName)}`
      : String(value);
  };
  const tagText = (tag: string) => {
    const def = moodByName(tag);
    return def
      ? `${def.emoji} ${t(`moodMeter.${def.name}`, def.displayName)}`
      : tag;
  };
  const energyText = (value: number) =>
    t('checkIn.energyOutOfFive', 'Energy {{value}}/5', { value });
  const focusText = (value: number) =>
    t('checkIn.focusOutOfFive', 'Focus {{value}}/5', { value });

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-labelledby={averageLabelId}
        className="rounded-lg border bg-muted/30 p-3"
      >
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span
            id={averageLabelId}
            className="font-medium uppercase tracking-wide"
          >
            {t('checkIn.dayAverage', 'Day average')}
          </span>
          <span>
            {t('checkIn.checkinCount', '{{count}} check-ins', {
              count: average.count,
              defaultValue_one: '{{count}} check-in',
            })}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium">
          <span>{average.mood === null ? '—' : moodText(average.mood)}</span>
          {average.energy !== null && <span>{energyText(average.energy)}</span>}
          {average.focus !== null && <span>{focusText(average.focus)}</span>}
        </div>
      </div>

      <ul className="space-y-2">
        {checkins.map((entry) => {
          const time = formatTimeInZone(
            entry.entry_timestamp,
            { kind: 'tz', tz: timezone },
            timeFormat
          );
          const tags = entry.mood_tags.filter((tag) => tag.trim() !== '');
          const note = snippet(entry.notes);
          const isEditing = entry.id === editingId;
          const isDeleting = entry.id === deletingId;
          return (
            <li
              key={entry.id}
              aria-current={isEditing ? 'true' : undefined}
              className="flex gap-3"
            >
              <time
                dateTime={entry.entry_timestamp}
                className="w-16 shrink-0 whitespace-nowrap pt-2.5 text-sm font-semibold tabular-nums text-muted-foreground"
              >
                {time}
              </time>
              <div
                className={cn(
                  'min-w-0 flex-1 rounded-lg border p-2.5',
                  isEditing && 'border-primary bg-primary/5'
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 pt-1 text-sm">
                    {entry.mood_value !== null && (
                      <span className="font-medium">
                        {moodText(entry.mood_value)}
                      </span>
                    )}
                    {entry.energy_value !== null && (
                      <span>{energyText(entry.energy_value)}</span>
                    )}
                    {entry.focus_value !== null && (
                      <span>{focusText(entry.focus_value)}</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => onEdit(entry)}
                      disabled={isDeleting}
                      aria-label={t(
                        'checkIn.editCheckinAt',
                        'Edit check-in at {{time}}',
                        { time }
                      )}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(entry)}
                      disabled={isDeleting}
                      aria-label={t(
                        'checkIn.deleteCheckinAt',
                        'Delete check-in at {{time}}',
                        { time }
                      )}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="font-normal"
                      >
                        {tagText(tag)}
                      </Badge>
                    ))}
                  </div>
                )}
                {note && (
                  <p className="mt-1.5 break-words text-xs italic text-muted-foreground">
                    {note}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
