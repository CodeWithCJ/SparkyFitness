import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BUILT_IN_MOODS,
  MOOD_FACE_STEP,
  moodFaceValue,
  moodValueToTag,
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
import RatingSelector from '@/pages/CheckIn/RatingSelector';

interface MoodMeterProps {
  /** null until a mood is picked: every part of a check-in is optional. */
  mood: number | null;
  notes: string;
  moodTags: string[];
  energy: number | null;
  focus: number | null;
  onMoodChange: (value: number | null) => void;
  onNotesChange: (value: string) => void;
  onTagsChange: (tags: string[]) => void;
  onEnergyChange: (value: number | null) => void;
  onFocusChange: (value: number | null) => void;
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

// `mood_value` is documented to carry 10-100 (see `constants/healthDataImport.ts`),
// which is what an import may bring in. The picker stops at 95 so its last stop
// is one half-step past the excited face rather than a whole one; 95 and 100
// both read back as excited, so the two it gives up cost nothing.
const MOOD_MIN = 10;
const MOOD_MAX = 95;

/**
 * A step is half the gap between two faces, so the stops in between are not
 * stray positions but the half-way marks: happy leaning excited, calm leaning
 * confident. That only reads as deliberate while a face lands on every second
 * stop, which taking it from the shared `MOOD_FACE_STEP` keeps true.
 */
const MOOD_STEP = MOOD_FACE_STEP / 2;

/** Into the range the picker can show. */
const clampToScale = (value: number) =>
  Math.min(MOOD_MAX, Math.max(MOOD_MIN, value));

/** Half the `h-5 w-5` thumb in `components/ui/slider.tsx`. Radix keeps the thumb
 *  inside the track, so its centre travels the track inset by this much at
 *  either end -- the legend has to use that same box. */
const THUMB_INSET_PX = 10;

/**
 * The nine banded moods, sad -> excited, on the slider's own scale: the value
 * tapping an emoji writes, and where the thumb then lands for it. Both from one
 * number on purpose -- spread evenly instead, the legend drifted from the thumb
 * the further right you went, since the bands are not evenly spread over 10-100.
 */
const BAND_SCALE = BUILT_IN_MOODS.filter((m) => m.band != null).map((m) => {
  // The shared face value is already on the grid the thumb travels (10 for
  // "sad" up to 90 for "excited", not the raw band midpoints 8 and 93), so
  // every face is a stop the thumb can rest on, and the mobile picker writes
  // the same value for it.
  const value = moodFaceValue(m.name);
  return {
    ...m,
    value,
    percent: ((value - MOOD_MIN) / (MOOD_MAX - MOOD_MIN)) * 100,
  };
});

const MoodMeter = ({
  mood,
  notes,
  moodTags,
  energy,
  focus,
  onMoodChange,
  onNotesChange,
  onTagsChange,
  onEnergyChange,
  onFocusChange,
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

  // The band the value falls in, driving both the emoji and the label beside it
  // so the header cannot name one mood while the legend highlights another.
  // `moodValueToTag` always names one of the nine; the fallback is for types.
  // No mood picked yet means no band: nothing is named or highlighted.
  const currentBand =
    mood === null
      ? null
      : (BAND_SCALE.find((m) => m.name === moodValueToTag(mood)) ??
        BAND_SCALE[0]!);

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
  const builtInMoodLabel = (name: string, fallback: string) =>
    t(`moodMeter.${name}`, fallback);

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
        <div className="mb-2 flex items-center justify-between gap-2">
          <Label>{t('moodMeter.intensity', 'Overall mood')}</Label>
          <div className="flex items-center gap-2">
            {currentBand ? (
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-lg leading-none">
                  {currentBand.emoji}
                </span>
                {builtInMoodLabel(currentBand.name, currentBand.displayName)}
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                {t('moodMeter.noMoodSelected', 'No mood selected')}
              </span>
            )}
            {mood !== null && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground"
                onClick={() => onMoodChange(null)}
              >
                {t('moodMeter.clearMood', 'Clear mood')}
              </Button>
            )}
          </div>
        </div>
        {/* Clamped for display only. An import may carry 96-100, and Radix
            announces the controlled value verbatim, so passing one through
            would report a mood above the maximum the slider declares. The
            stored value is left alone until the user moves the thumb.
            With no mood yet the thumb is parked, dimmed, in the middle; a
            press on it picks that middle value, since Radix only reports a
            value that differs from the one it shows. */}
        <Slider
          value={[clampToScale(mood ?? 50)]}
          min={MOOD_MIN}
          max={MOOD_MAX}
          step={MOOD_STEP}
          onValueChange={(vals) => onMoodChange(vals[0] ?? 50)}
          onPointerDown={() => {
            if (mood === null) onMoodChange(50);
          }}
          className={cn('w-full', mood === null && 'opacity-50')}
          hideRange={mood === null}
          valueText={
            mood === null
              ? t('moodMeter.noMoodSelected', 'No mood selected')
              : undefined
          }
          aria-label={t('moodMeter.intensity', 'Overall mood')}
        />
        {/* Tappable band emojis: the scale, and a shortcut to a face. Each is
            pinned where the thumb lands for it -- see BAND_SCALE. */}
        <div
          className="mt-2"
          style={{ paddingLeft: THUMB_INSET_PX, paddingRight: THUMB_INSET_PX }}
        >
          <div className="relative h-6">
            {BAND_SCALE.map((m) => {
              const active = currentBand?.name === m.name;
              return (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => onMoodChange(m.value)}
                  aria-label={builtInMoodLabel(m.name, m.displayName)}
                  title={builtInMoodLabel(m.name, m.displayName)}
                  style={{ left: `${m.percent}%` }}
                  className={cn(
                    'absolute top-0 -translate-x-1/2 text-lg leading-none transition',
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
      </div>

      {/* Optional energy and focus ratings */}
      <div className="grid gap-4 sm:grid-cols-2">
        <RatingSelector
          label={t('moodMeter.energy', 'Energy')}
          lowLabel={t('moodMeter.energyLow', 'Drained')}
          highLabel={t('moodMeter.energyHigh', 'Energized')}
          value={energy}
          onChange={onEnergyChange}
        />
        <RatingSelector
          label={t('moodMeter.focus', 'Focus')}
          lowLabel={t('moodMeter.focusLow', 'Scattered')}
          highLabel={t('moodMeter.focusHigh', 'Locked in')}
          value={focus}
          onChange={onFocusChange}
        />
      </div>

      {/* Multi-select mood tags */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>{t('moodMeter.moods', 'Moods')}</Label>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
                <Settings className="mr-1 h-3.5 w-3.5" />
                {t('moodMeter.manage', 'Manage')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
                <Input
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
                      aria-label={c}
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
                {BUILT_IN_MOODS.map((m) => (
                  <ManageRow
                    key={m.name}
                    label={`${m.emoji} ${builtInMoodLabel(m.name, m.displayName)}`}
                    color={m.color}
                    isHidden={hidden.includes(m.name)}
                    onToggleHidden={() => toggleHidden(m.name)}
                  />
                ))}
                {custom.map((cm) => (
                  <ManageRow
                    key={cm.id}
                    label={`${cm.icon ?? '•'} ${cm.display_name ?? cm.name}`}
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
              label={builtInMoodLabel(m.name, m.displayName)}
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
          {t('checkIn.journalOptional', 'Journal (optional)')}
        </Label>
        <Textarea
          id="mood-notes"
          placeholder={t(
            'checkIn.anyThoughtsOrFeelings',
            "Any thoughts or feelings you'd like to add?"
          )}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          className="mt-2 min-h-[140px]"
        />
      </div>
    </div>
  );
};

function ManageRow({
  label,
  color,
  isHidden,
  onToggleHidden,
  onDelete,
}: {
  label: string;
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
              ? t('moodMeter.showMood', 'Show mood')
              : t('moodMeter.hideMood', 'Hide mood')
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
                aria-label={t('moodMeter.deleteMood', 'Delete mood')}
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
