import { useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  daysBetween,
  framesForAngle,
  type PhotoType,
  type ProgressPhotoDay,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ImageLightbox from '@/components/ImageLightbox';
import { usePreferences } from '@/contexts/PreferencesContext';
import { checkInPhotoFileUrl } from '@/hooks/CheckIn/useCheckInPhotos';
import { defaultAngle, formatWeightDelta } from '@/utils/progressPhotos';
import {
  PhotoAngleToggle,
  PhotoDayPicker,
  PhotoDayWeight,
} from './ProgressPhotoControls';

interface ProgressPhotoCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The whole gallery, grouped by day (newest first). */
  days: ProgressPhotoDay[];
  onLogWeight?: (date: string) => void;
  /** Where focus goes back to on close; the dialog has no DialogTrigger. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

interface CompareContentProps {
  days: ProgressPhotoDay[];
  onLogWeight?: (date: string) => void;
}

/**
 * The dialog body. It mounts on open, so every opening starts from the default
 * pair rather than whatever was picked last time.
 */
const CompareContent = ({ days, onLogWeight }: CompareContentProps) => {
  const { t } = useTranslation();
  const { weightUnit, formatDate } = usePreferences();
  const [angle, setAngle] = useState<PhotoType>(() => defaultAngle(days));
  const [pickedBefore, setPickedBefore] = useState<string | null>(null);
  const [pickedAfter, setPickedAfter] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(
    null
  );

  const timeline = useMemo(() => framesForAngle(days, angle), [days, angle]);
  const availableDates = useMemo(
    () => timeline.map((day) => day.entry_date),
    [timeline]
  );

  // The panes default to the widest span (first shoot against the latest),
  // which already says something before anything is picked. Derived rather
  // than stored, so a pick on a day without this angle (after switching angle,
  // or a photo deleted meanwhile) falls back instead of showing nothing.
  const dayFor = (date: string | null) =>
    date ? timeline.find((day) => day.entry_date === date) : undefined;
  const beforeDay = dayFor(pickedBefore) ?? timeline[0];
  const afterDay = dayFor(pickedAfter) ?? timeline[timeline.length - 1];

  const angleToggle = <PhotoAngleToggle value={angle} onChange={setAngle} />;

  // Same wrapper and position for the toggle as below, so switching to an
  // angle without a pair keeps the toggle (and its focus) mounted.
  if (timeline.length < 2 || !beforeDay || !afterDay) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center">{angleToggle}</div>
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t(
            'checkIn.photos.compareEmpty',
            'Add photos of this angle on at least two days to compare them.'
          )}
        </p>
      </div>
    );
  }

  const spanDays = Math.abs(
    daysBetween(beforeDay.entry_date, afterDay.entry_date)
  );
  const deltaKg =
    beforeDay.weight != null && afterDay.weight != null
      ? afterDay.weight - beforeDay.weight
      : null;

  const renderPane = (
    day: ProgressPhotoDay,
    label: string,
    onPick: (date: string) => void
  ) => {
    const photo = day.photos[angle];
    const url = photo ? checkInPhotoFileUrl(photo.id) : null;
    const alt = `${label} · ${formatDate(day.entry_date)}`;
    return (
      <div className="flex min-w-0 flex-col items-center gap-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <button
          type="button"
          className="relative aspect-[3/4] w-full max-w-[36vh] overflow-hidden rounded-lg border border-border bg-muted"
          onClick={() => url && setZoomed({ url, alt })}
          disabled={!url}
          aria-label={t('checkIn.photos.viewFull', 'View {{label}} full size', {
            label: alt,
          })}
        >
          {url && (
            <img src={url} alt={alt} className="h-full w-full object-cover" />
          )}
        </button>
        <PhotoDayPicker
          value={day.entry_date}
          availableDates={availableDates}
          onSelect={onPick}
          label={t('checkIn.photos.pickDay', 'Choose the {{label}} day', {
            label,
          })}
        />
        <PhotoDayWeight
          weight={day.weight}
          date={day.entry_date}
          onLogWeight={onLogWeight}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-center">{angleToggle}</div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {renderPane(
          beforeDay,
          t('checkIn.photos.before', 'Before'),
          setPickedBefore
        )}
        {renderPane(
          afterDay,
          t('checkIn.photos.after', 'After'),
          setPickedAfter
        )}
      </div>

      {(deltaKg != null || spanDays > 0) && (
        <div className="flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-4 py-3">
          {deltaKg != null && (
            <span className="text-lg font-semibold tabular-nums">
              {formatWeightDelta(deltaKg, weightUnit)}
            </span>
          )}
          {spanDays > 0 && (
            <span className="text-sm text-muted-foreground">
              {t('checkIn.photos.daysApart', '{{count}} days apart', {
                count: spanDays,
              })}
            </span>
          )}
        </div>
      )}

      <ImageLightbox
        images={zoomed ? [zoomed.url] : []}
        open={zoomed != null}
        onOpenChange={(open) => !open && setZoomed(null)}
        title={zoomed?.alt}
        alt={zoomed?.alt}
      />
    </div>
  );
};

/** Two days of one angle side by side, with the weight change between them. */
export const ProgressPhotoCompareDialog = ({
  open,
  onOpenChange,
  days,
  onLogWeight,
  returnFocusRef,
}: ProgressPhotoCompareDialogProps) => {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t('checkIn.photos.compareTitle', 'Compare progress photos')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'checkIn.photos.compareDescription',
              'Pick any two days to see how this angle has changed.'
            )}
          </DialogDescription>
        </DialogHeader>
        <CompareContent days={days} onLogWeight={onLogWeight} />
      </DialogContent>
    </Dialog>
  );
};
