import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { DateRange } from 'react-day-picker';
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Pause,
  Play,
} from 'lucide-react';
import {
  framesForAngle,
  framesInRange,
  localDateToDay,
  todayInZone,
  type CustomRange,
  type PhotoType,
  type ProgressPhotoDay,
  type TimelapseRange,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { checkInPhotoFileUrl } from '@/hooks/CheckIn/useCheckInPhotos';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { defaultAngle } from '@/utils/progressPhotos';
import { PhotoAngleToggle, PhotoDayWeight } from './ProgressPhotoControls';

type Speed = 'slow' | 'normal' | 'fast';

/**
 * How long each frame is held, and how long the cross-fade into it takes. The
 * fade is a large share of the hold on purpose: a hard cut between two body
 * shots reads as a jerky slideshow, while an overlapping dissolve turns the
 * same pictures into a continuous change. Same timings as the mobile player.
 */
const SPEEDS: Record<Speed, { holdMs: number; fadeMs: number }> = {
  slow: { holdMs: 1400, fadeMs: 700 },
  normal: { holdMs: 900, fadeMs: 450 },
  fast: { holdMs: 500, fadeMs: 260 },
};

/** How many frames ahead to warm the browser cache, so a fade never starts blank. */
const PREFETCH_AHEAD = 3;

interface ProgressPhotoTimelapseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The whole gallery, grouped by day (newest first). */
  days: ProgressPhotoDay[];
  onLogWeight?: (date: string) => void;
  /** Where focus goes back to on close; the dialog has no DialogTrigger. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

interface TimelapseContentProps {
  days: ProgressPhotoDay[];
  onLogWeight?: (date: string) => void;
}

/**
 * The player. It mounts on open, so closing the dialog stops playback and the
 * next opening starts from the first frame.
 */
const TimelapseContent = ({ days, onLogWeight }: TimelapseContentProps) => {
  const { t } = useTranslation();
  const { formatDate, timezone } = usePreferences();

  const [angle, setAngle] = useState<PhotoType>(() => defaultAngle(days));
  const [range, setRange] = useState<TimelapseRange>('3m');
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>();
  const [speed, setSpeed] = useState<Speed>('normal');
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  // Set while the range Select closes to open the date picker, so the Select
  // does not hand focus back to its trigger: that focus move lands outside the
  // just-opened popover and would dismiss it straight away.
  const openingCustomRef = useRef(false);

  // Oldest to newest: the point is watching the change accumulate.
  const allFrames = useMemo(() => framesForAngle(days, angle), [days, angle]);
  const today = todayInZone(timezone);
  const { frames, widened } = useMemo(
    () => framesInRange(allFrames, range, today, custom),
    [allFrames, range, today, custom]
  );
  // What is actually playing, which is not always what is selected: labelling
  // a widened run with the preset would claim the whole history fits in it.
  const playingRange: TimelapseRange = widened ? 'all' : range;

  // Start over when the set of frames changes (another angle or range, or a
  // photo removed meanwhile), so the index never points past the end. Adjusted
  // during render rather than in an effect, so the first paint after the change
  // already shows the first frame instead of flashing a stale one.
  const frameSetKey = `${angle}|${playingRange}|${custom?.from}|${custom?.to}|${frames.length}`;
  const [prevFrameSetKey, setPrevFrameSetKey] = useState(frameSetKey);
  if (prevFrameSetKey !== frameSetKey) {
    setPrevFrameSetKey(frameSetKey);
    setIndex(0);
    setIsPlaying(false);
  }

  const { holdMs, fadeMs } = SPEEDS[speed];

  // Playback stops on the last frame rather than looping, so the latest shot
  // stays on screen. That end state is derived, not written back into
  // isPlaying, which keeps one source of truth for what the button shows.
  const atEnd = frames.length === 0 || index >= frames.length - 1;
  const isRunning = isPlaying && !atEnd;

  // The playback clock: each tick advances exactly one frame.
  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setTimeout(() => setIndex((i) => i + 1), holdMs);
    return () => window.clearTimeout(timer);
  }, [isRunning, index, holdMs]);

  // Warm the next few frames. Only the visible frame is in the DOM, so a long
  // history costs the same as a short one.
  useEffect(() => {
    for (const day of frames.slice(index + 1, index + 1 + PREFETCH_AHEAD)) {
      const photo = day.photos[angle];
      if (!photo) continue;
      const image = new Image();
      image.src = checkInPhotoFileUrl(photo.id);
    }
  }, [frames, index, angle]);

  // Left and right step through the frames wherever focus is in the dialog,
  // except inside the range picker, a menu or a text field, which use them.
  const frameCount = frames.length;
  useEffect(() => {
    if (frameCount < 2) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest(
            'input, textarea, select, [role="listbox"], [role="grid"], [data-radix-popper-content-wrapper]'
          ))
      ) {
        return;
      }
      setIsPlaying(false);
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      setIndex((i) => Math.min(Math.max(i + delta, 0), frameCount - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [frameCount]);

  const current = frames[index];
  const currentId = current?.photos[angle]?.id ?? null;

  // The outgoing frame stays underneath while the new one fades in on top, so
  // the two overlap into a dissolve rather than a cut.
  const reduceMotion = usePrefersReducedMotion();
  const [shown, setShown] = useState<{
    id: string | null;
    previous: string | null;
  }>({ id: currentId, previous: null });
  if (shown.id !== currentId) {
    // Stepping back onto the frame still underneath reuses its image, which
    // has already loaded and so fires no load event. With no fade to wait for,
    // nothing needs to stay under it.
    const reused = reduceMotion && currentId === shown.previous;
    setShown({ id: currentId, previous: reused ? null : shown.id });
  }

  const togglePlay = () => {
    if (frames.length < 2) return;
    // Play at the end replays from the start, so a finished run is one click
    // from being watched again.
    if (!isRunning) {
      if (atEnd) setIndex(0);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(false);
  };

  const step = (delta: number) => {
    setIsPlaying(false);
    setIndex((i) => Math.min(Math.max(i + delta, 0), frames.length - 1));
  };

  const rangeLabel = (window: TimelapseRange): string => {
    switch (window) {
      case '30d':
        return t('checkIn.photos.range30d', 'Last 30 days');
      case '3m':
        return t('checkIn.photos.range3m', 'Last 3 months');
      case 'all':
        return t('checkIn.photos.rangeAll', 'All time');
      case 'custom':
        return custom
          ? `${formatDate(custom.from)} – ${formatDate(custom.to)}`
          : t('checkIn.photos.rangeCustom', 'Custom range');
    }
  };

  const applyCustomRange = () => {
    if (!draftRange?.from || !draftRange?.to) return;
    setCustom({
      from: localDateToDay(draftRange.from),
      to: localDateToDay(draftRange.to),
    });
    setRange('custom');
    setRangePickerOpen(false);
  };

  const speedLabels: Record<Speed, string> = {
    slow: t('checkIn.photos.speedSlow', 'Slow'),
    normal: t('checkIn.photos.speedNormal', 'Normal'),
    fast: t('checkIn.photos.speedFast', 'Fast'),
  };

  const controls = (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <PhotoAngleToggle value={angle} onChange={setAngle} />
      <Select
        value={range}
        onValueChange={(value) => {
          // Custom only takes effect once a range is picked, so the selection
          // stays on the current window until then.
          if (value === 'custom') {
            openingCustomRef.current = true;
            setDraftRange(undefined);
            setRangePickerOpen(true);
            return;
          }
          setRange(value as TimelapseRange);
        }}
      >
        <SelectTrigger
          className="h-9 w-auto min-w-[9rem]"
          aria-label={t('checkIn.photos.rangeLabel', 'Play back')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          onCloseAutoFocus={(event) => {
            if (!openingCustomRef.current) return;
            openingCustomRef.current = false;
            event.preventDefault();
          }}
        >
          {(['30d', '3m', 'all', 'custom'] as TimelapseRange[]).map(
            (window) => (
              <SelectItem key={window} value={window}>
                {rangeLabel(window)}
              </SelectItem>
            )
          )}
        </SelectContent>
      </Select>
      {(range === 'custom' || rangePickerOpen) && (
        <Popover open={rangePickerOpen} onOpenChange={setRangePickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              {/* The Select already shows the picked range; this is the way
                  to change it. */}
              {t('checkIn.photos.pickRange', 'Pick dates')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center" sideOffset={8}>
            <Calendar
              mode="range"
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={1}
            />
            <div className="flex justify-end border-t border-border/60 p-2">
              <Button
                type="button"
                size="sm"
                disabled={!draftRange?.from || !draftRange?.to}
                onClick={applyCustomRange}
              >
                {t('checkIn.photos.playRange', 'Play this range')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );

  // Fewer than two frames is the empty state rather than a playable one: a
  // lone frame is already at the end, so Play would do nothing.
  if (frames.length < 2 || !current || !currentId) {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        {controls}
        <p className="text-center text-sm text-muted-foreground">
          {range === 'custom'
            ? t(
                'checkIn.photos.timelapseEmptyRange',
                'There are fewer than two photos of this angle in that range.'
              )
            : t(
                'checkIn.photos.timelapseEmpty',
                'Add photos of this angle on at least two days to play a time-lapse.'
              )}
        </p>
      </div>
    );
  }

  const currentFailed = failedIds.has(currentId);

  const clearPrevious = () =>
    setShown((s) => (s.id === currentId ? { ...s, previous: null } : s));

  return (
    <div className="flex flex-col items-center gap-3">
      {controls}

      <div className="relative aspect-[3/4] w-full max-w-[min(24rem,36vh)] overflow-hidden rounded-lg border border-border bg-muted">
        {/* A frame that failed to load shows a placeholder rather than the
            previous day's photo through it, under the new date. */}
        {shown.previous && !currentFailed && (
          <img
            key={shown.previous}
            src={checkInPhotoFileUrl(shown.previous)}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {currentFailed ? (
          <div
            role="img"
            aria-label={formatDate(current.entry_date)}
            className="absolute inset-0 flex items-center justify-center text-muted-foreground"
          >
            <ImageIcon className="h-10 w-10" />
          </div>
        ) : (
          <img
            key={currentId}
            src={checkInPhotoFileUrl(currentId)}
            alt={formatDate(current.entry_date)}
            className="absolute inset-0 h-full w-full object-cover animate-in fade-in-0 motion-reduce:animate-none"
            style={{ animationDuration: `${fadeMs}ms` }}
            // Once the dissolve is over the outgoing frame is fully covered.
            onAnimationEnd={clearPrevious}
            // With reduced motion there is no fade, so no animationend to wait
            // for: the outgoing frame goes as soon as this one is on screen.
            onLoad={() => {
              if (reduceMotion) clearPrevious();
            }}
            onError={() => setFailedIds((ids) => new Set(ids).add(currentId))}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-0.5">
        <span className="font-semibold">{formatDate(current.entry_date)}</span>
        <PhotoDayWeight
          weight={current.weight}
          date={current.entry_date}
          onLogWeight={onLogWeight}
        />
        <span className="text-xs text-muted-foreground tabular-nums">
          {t(
            'checkIn.photos.frameCount',
            '{{current}} of {{total}} · {{range}}',
            {
              current: index + 1,
              total: frames.length,
              range: rangeLabel(playingRange),
            }
          )}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-4">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            // aria-disabled rather than disabled: a disabled button loses focus
            // the moment it reaches the end, dropping keyboard users to <body>.
            onClick={() => index > 0 && step(-1)}
            aria-disabled={index === 0}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-label={t('checkIn.photos.previousPhoto', 'Previous photo')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            size="icon"
            className="h-12 w-12 rounded-full"
            onClick={togglePlay}
            aria-label={
              isRunning
                ? t('checkIn.photos.pause', 'Pause')
                : t('checkIn.photos.play', 'Play')
            }
          >
            {isRunning ? (
              <Pause className="h-5 w-5" />
            ) : (
              <Play className="h-5 w-5" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => !atEnd && step(1)}
            aria-disabled={atEnd}
            className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-label={t('checkIn.photos.nextPhoto', 'Next photo')}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div
          role="group"
          aria-label={t('checkIn.photos.speed', 'Speed')}
          className="inline-flex rounded-full border border-border/60 p-0.5"
        >
          {(Object.keys(SPEEDS) as Speed[]).map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={speed === key ? 'secondary' : 'ghost'}
              aria-pressed={speed === key}
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setSpeed(key)}
            >
              {speedLabels[key]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

/** Plays one angle's history back as a cross-faded sequence. */
export const ProgressPhotoTimelapseDialog = ({
  open,
  onOpenChange,
  days,
  onLogWeight,
  returnFocusRef,
}: ProgressPhotoTimelapseDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('checkIn.photos.timelapseTitle', 'Progress time-lapse')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'checkIn.photos.timelapseDescription',
              'Watch one angle change over time. Use the arrow keys to step through it.'
            )}
          </DialogDescription>
        </DialogHeader>
        <TimelapseContent days={days} onLogWeight={onLogWeight} />
      </DialogContent>
    </Dialog>
  );
};
