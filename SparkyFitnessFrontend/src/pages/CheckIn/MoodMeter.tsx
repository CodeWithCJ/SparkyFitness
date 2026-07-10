import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUILT_IN_MOODS,
  moodValueToTag,
  representativeMoodValue,
} from '@workspace/shared';
import type { CustomMood } from '@/types/mood';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Settings, Trash, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useCustomMoods,
  useCreateCustomMoodMutation,
  useDeleteCustomMoodMutation,
  useMoodDisplayPreferences,
  useUpdateMoodDisplayPreferencesMutation,
} from '@/hooks/CheckIn/useMood';

interface MoodMeterProps {
  mood: number;
  notes: string;
  moodTags: string[];
  onMoodChange: (value: number) => void;
  onNotesChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
}

// Domain color tokens -> hex, so mood colors are actually rendered on chips.
const MOOD_COLOR: Record<string, string> = {
  sky: '#7FB6CE',
  green: '#A8C8A0',
  amber: '#E8B54A',
  period: '#E4796B',
  lavender: '#B49BD8',
  neutral: '#B8ABA3',
};
const colorHex = (token?: string | null) =>
  (token && MOOD_COLOR[token]) || MOOD_COLOR['neutral'];

const EMOJI_CHOICES = [
  '🙂',
  '😌',
  '😣',
  '😤',
  '🥳',
  '😴',
  '🤯',
  '😇',
  '🥰',
  '😵',
];
const COLOR_CHOICES = Object.keys(MOOD_COLOR);

// The nine banded moods, ordered sad -> excited, used as the slider scale.
const BANDED_MOODS = BUILT_IN_MOODS.filter((m) => m.band != null);

const MoodMeter = ({
  mood,
  notes,
  moodTags,
  onMoodChange,
  onNotesChange,
  onTagsChange,
}: MoodMeterProps) => {
  const { t } = useTranslation();
  const { data: customMoods } = useCustomMoods();
  const createCustom = useCreateCustomMoodMutation();
  const deleteCustom = useDeleteCustomMoodMutation();
  const { data: displayPrefs } = useMoodDisplayPreferences();
  const updatePrefs = useUpdateMoodDisplayPreferencesMutation();

  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState(EMOJI_CHOICES[0]!);
  const [newColor, setNewColor] = useState(COLOR_CHOICES[0]!);

  const hidden = displayPrefs?.hidden_moods ?? [];
  const custom = (customMoods ?? []) as CustomMood[];

  // Which banded mood the current slider value falls in (for the emoji scale).
  const currentBandName = moodValueToTag(mood ?? 50);
  const currentBandEmoji =
    BANDED_MOODS.find((m) => m.name === currentBandName)?.emoji ?? '🙂';

  const getMoodLabel = (value: number | null) => {
    if (value === null) return t('moodMeter.neutral', 'Neutral');
    if (value <= 15) return t('moodMeter.sad', 'Sad');
    if (value <= 25) return t('moodMeter.angry', 'Angry');
    if (value <= 35) return t('moodMeter.worried', 'Worried');
    if (value <= 45) return t('moodMeter.neutral', 'Neutral');
    if (value <= 55) return t('moodMeter.thoughtful', 'Thoughtful');
    if (value <= 65) return t('moodMeter.calm', 'Calm');
    if (value <= 75) return t('moodMeter.confident', 'Confident');
    if (value <= 85) return t('moodMeter.happy', 'Happy');
    return t('moodMeter.excited', 'Excited');
  };

  const toggleTag = (name: string) => {
    onTagsChange(
      moodTags.includes(name)
        ? moodTags.filter((mt) => mt !== name)
        : [...moodTags, name]
    );
  };

  const toggleHidden = (name: string) => {
    const next = hidden.includes(name)
      ? hidden.filter((h) => h !== name)
      : [...hidden, name];
    updatePrefs.mutate(next);
  };

  const handleAddCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    const created = await createCustom.mutateAsync({
      name,
      display_name: name,
      icon: newEmoji,
      color: newColor,
    });
    onTagsChange([...moodTags, created.name]);
    setNewName('');
  };

  const visibleBuiltIns = BUILT_IN_MOODS.filter(
    (m) => !hidden.includes(m.name)
  );
  const visibleCustoms = custom.filter((cm) => !hidden.includes(cm.name));
  const getBuiltInMoodLabel = (name: string, fallback: string) =>
    t(`moodMeter.${name}`, fallback);
  const getColorLabel = (color: string) =>
    t(`moodMeter.colors.${color}`, color);

  const Chip = ({
    name,
    label,
    emoji,
    color,
  }: {
    name: string;
    label: string;
    emoji: string;
    color?: string | null;
  }) => {
    const active = moodTags.includes(name);
    return (
      <button
        type="button"
        onClick={() => toggleTag(name)}
        aria-pressed={active}
        className={cn(
          'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition',
          active
            ? 'border-primary bg-primary/10 font-medium'
            : 'border-transparent bg-muted/40 hover:bg-muted'
        )}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: colorHex(color) }}
        />
        <span>{emoji}</span>
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Intensity rating (kept for interop + trend) */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>{t('moodMeter.intensity', 'Overall mood')}</Label>
          <span className="flex items-center gap-1.5 text-sm font-medium">
            <span className="text-lg leading-none">{currentBandEmoji}</span>
            {getMoodLabel(mood)}
          </span>
        </div>
        <Slider
          value={[mood === null ? 50 : mood]}
          min={10}
          max={100}
          step={5}
          onValueChange={(vals) => onMoodChange(vals[0] ?? 50)}
          className="w-full"
          aria-label={t('moodMeter.intensity', 'Overall mood')}
        />
        {/* Tappable band emojis so users see the scale and can jump to a face */}
        <div className="mt-2 flex items-center justify-between px-0.5">
          {BANDED_MOODS.map((m) => {
            const active = currentBandName === m.name;
            const moodLabel = getBuiltInMoodLabel(m.name, m.displayName);
            return (
              <button
                key={m.name}
                type="button"
                onClick={() => onMoodChange(representativeMoodValue([m.name]))}
                aria-label={moodLabel}
                title={moodLabel}
                className={cn(
                  'text-lg leading-none transition',
                  active
                    ? 'scale-125'
                    : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
                )}
              >
                {m.emoji}
              </button>
            );
          })}
        </div>
      </div>

      {/* Multi-select mood tags */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>{t('moodMeter.moods', 'Moods')}</Label>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Settings className="me-1 h-3.5 w-3.5" />
                {t('moodMeter.manage', 'Manage')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {t('moodMeter.manageMoods', 'Manage moods')}
                </DialogTitle>
              </DialogHeader>

              {/* Add custom mood */}
              <div className="space-y-3 border-b pb-4 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {t('moodMeter.addCustom', 'Add a custom mood')}
                </p>
                <Label htmlFor="custom-mood-name" className="sr-only">
                  {t('moodMeter.moodName', 'Mood name')}
                </Label>
                <Input
                  id="custom-mood-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder={t('moodMeter.moodName', 'Mood name')}
                />
                <div className="flex flex-wrap gap-1.5">
                  {EMOJI_CHOICES.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setNewEmoji(e)}
                      aria-label={t(
                        'moodMeter.selectEmoji',
                        'Select emoji {{emoji}}',
                        { emoji: e }
                      )}
                      aria-pressed={newEmoji === e}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border text-lg',
                        newEmoji === e
                          ? 'border-primary bg-primary/10'
                          : 'border-transparent bg-muted/40'
                      )}
                    >
                      {e}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {COLOR_CHOICES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      aria-label={t(
                        'moodMeter.selectColor',
                        'Select color {{color}}',
                        { color: getColorLabel(c) }
                      )}
                      aria-pressed={newColor === c}
                      className={cn(
                        'h-7 w-7 rounded-full border-2',
                        newColor === c
                          ? 'border-foreground'
                          : 'border-transparent'
                      )}
                      style={{ backgroundColor: colorHex(c) }}
                    />
                  ))}
                </div>
                <Button
                  type="button"
                  className="w-full"
                  disabled={!newName.trim() || createCustom.isPending}
                  onClick={handleAddCustom}
                >
                  {t('moodMeter.addMood', 'Add mood')}
                </Button>
              </div>

              {/* Show / hide list */}
              <div className="space-y-1 pt-2">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  {t('moodMeter.showHide', 'Show or hide moods')}
                </p>
                {BUILT_IN_MOODS.map((m) => {
                  const moodLabel = getBuiltInMoodLabel(m.name, m.displayName);
                  return (
                    <ManageRow
                      key={m.name}
                      label={`${m.emoji} ${moodLabel}`}
                      accessibleLabel={moodLabel}
                      color={m.color}
                      isHidden={hidden.includes(m.name)}
                      onToggleHidden={() => toggleHidden(m.name)}
                    />
                  );
                })}
                {custom.map((cm) => (
                  <ManageRow
                    key={cm.id}
                    label={`${cm.icon ?? '•'} ${cm.display_name ?? cm.name}`}
                    accessibleLabel={cm.display_name ?? cm.name}
                    color={cm.color}
                    isHidden={hidden.includes(cm.name)}
                    onToggleHidden={() => toggleHidden(cm.name)}
                    onDelete={(deleteAllHistory) =>
                      deleteCustom.mutate({ id: cm.id, deleteAllHistory })
                    }
                  />
                ))}
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex flex-wrap gap-2">
          {visibleBuiltIns.map((m) => (
            <Chip
              key={m.name}
              name={m.name}
              label={getBuiltInMoodLabel(m.name, m.displayName)}
              emoji={m.emoji}
              color={m.color}
            />
          ))}
          {visibleCustoms.map((cm) => (
            <Chip
              key={cm.id}
              name={cm.name}
              label={cm.display_name ?? cm.name}
              emoji={cm.icon ?? '•'}
              color={cm.color}
            />
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <Label htmlFor="mood-notes">
          {t('checkIn.notesOptional', 'Notes (optional)')}
        </Label>
        <Textarea
          id="mood-notes"
          placeholder={t(
            'checkIn.anyThoughtsOrFeelings',
            "Any thoughts or feelings you'd like to add?"
          )}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="mt-2"
        />
      </div>
    </div>
  );
};

function ManageRow({
  label,
  accessibleLabel,
  color,
  isHidden,
  onToggleHidden,
  onDelete,
}: {
  label: string;
  accessibleLabel: string;
  color?: string | null;
  isHidden: boolean;
  onToggleHidden: () => void;
  onDelete?: (deleteAllHistory: boolean) => void;
}) {
  const { t } = useTranslation();
  const [alsoPurge, setAlsoPurge] = useState(false);
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-lg px-2 py-1.5 text-sm',
        isHidden && 'opacity-50'
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: colorHex(color) }}
        />
        {label}
      </span>
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onToggleHidden}
          aria-label={
            isHidden
              ? t('moodMeter.showMood', 'Show {{mood}}', {
                  mood: accessibleLabel,
                })
              : t('moodMeter.hideMood', 'Hide {{mood}}', {
                  mood: accessibleLabel,
                })
          }
        >
          {isHidden ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </Button>
        {onDelete && (
          <AlertDialog onOpenChange={() => setAlsoPurge(false)}>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                aria-label={t('moodMeter.deleteMood', 'Delete {{mood}}', {
                  mood: accessibleLabel,
                })}
              >
                <Trash className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('moodMeter.deleteTitle', 'Delete this mood?')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t(
                    'moodMeter.deleteDesc',
                    'It will no longer appear in your picker. Past entries keep it unless you choose to remove it everywhere.'
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={alsoPurge}
                  onCheckedChange={(v) => setAlsoPurge(v === true)}
                />
                {t(
                  'moodMeter.deleteAllHistory',
                  'Also remove it from all past entries'
                )}
              </label>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {t('common.cancel', 'Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction onClick={() => onDelete(alsoPurge)}>
                  {t('common.delete', 'Delete')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </span>
    </div>
  );
}

export default MoodMeter;
