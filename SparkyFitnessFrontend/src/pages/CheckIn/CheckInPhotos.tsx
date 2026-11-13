import { useRef, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Camera,
  Upload,
  Trash2,
  ImageIcon,
  ChevronDown,
  Columns2,
  Film,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  checkInPhotoFileUrl,
  useCheckInPhotoGallery,
  useCheckInPhotos,
  type PhotoType,
  type CheckInPhoto,
} from '@/hooks/CheckIn/useCheckInPhotos';
import { hasComparableAngle, PHOTO_ANGLES } from '@/utils/progressPhotos';
import { ProgressPhotoCompareDialog } from './ProgressPhotoCompareDialog';
import { ProgressPhotoTimelapseDialog } from './ProgressPhotoTimelapseDialog';

interface PhotoSlotProps {
  type: PhotoType;
  label: string;
  photo: CheckInPhoto | undefined;
  date: string;
  onUpload: (type: PhotoType, file: File) => void;
  onDelete: (id: string) => void;
  // True only while THIS slot's upload is in flight (drives the spinner).
  isUploading: boolean;
  // True while ANY slot is uploading — blocks interaction on every slot so a
  // second upload can't race the in-flight one.
  disabled: boolean;
}

const PhotoSlot = ({
  type,
  label,
  photo,
  date: _date,
  onUpload,
  onDelete,
  isUploading,
  disabled,
}: PhotoSlotProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(type, file);
        // Reset input so the same file can be re-selected after deletion
        e.target.value = '';
      }
    },
    [type, onUpload]
  );

  const photoUrl = photo ? checkInPhotoFileUrl(photo.id) : null;

  const uploadLabel = photo
    ? t('checkIn.photos.replace', 'Replace')
    : t('checkIn.photos.upload', 'Upload');

  return (
    // min-w-0: a grid item will not shrink below its content by default, so on
    // a phone the button row pushed the third slot out of the card.
    <div className="flex min-w-0 flex-col items-center gap-2">
      <span className="text-sm font-medium text-foreground">{label}</span>

      {/* Photo preview or placeholder */}
      <div
        className="relative w-full aspect-[3/4] rounded-lg border border-border bg-muted overflow-hidden
                   flex items-center justify-center cursor-pointer group"
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt={label}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="h-8 w-8 text-white" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground pointer-events-none">
            <ImageIcon className="h-10 w-10" />
            <span className="text-xs text-center px-2">
              {t('checkIn.photos.tapToUpload', 'Tap to upload')}
            </span>
          </div>
        )}

        {isUploading && (
          <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
            <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Hidden file input — no capture attribute so mobile users can pick
          either the camera or an existing photo from the gallery. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div className="flex gap-2 w-full">
        {/* Three slots share a phone-width row, so below sm the label gives way
            to the icon; the aria-label keeps the button's name either way. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 flex-1"
          disabled={disabled}
          aria-label={uploadLabel}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3 sm:mr-1" />
          <span className="hidden truncate sm:inline">{uploadLabel}</span>
        </Button>

        {photo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 px-2 text-destructive hover:text-destructive"
            disabled={disabled}
            aria-label={t('checkIn.photos.remove', 'Remove photo')}
            onClick={() => onDelete(photo.id)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};

interface CheckInPhotosProps {
  selectedDate: string;
  /** Opens the measurements for a day, for a photo day without a weight. */
  onLogWeight?: (date: string) => void;
}

export const CheckInPhotos = ({
  selectedDate,
  onLogWeight,
}: CheckInPhotosProps) => {
  const { t } = useTranslation();
  const {
    photos,
    uploadPhoto,
    deletePhoto,
    isUploading,
    uploadingType,
    isDeleting,
  } = useCheckInPhotos(selectedDate);

  // The whole history backs the comparison and the time-lapse. Their buttons
  // only show once some angle has two days to work with.
  const { days: galleryDays } = useCheckInPhotoGallery();
  const canCompare = hasComparableAngle(galleryDays);
  const [compareOpen, setCompareOpen] = useState(false);
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const compareButtonRef = useRef<HTMLButtonElement>(null);
  const timelapseButtonRef = useRef<HTMLButtonElement>(null);

  // Logging a weight happens on the Measurements tab, so close whichever
  // dialog asked before switching there.
  const handleLogWeight = onLogWeight
    ? (date: string) => {
        setCompareOpen(false);
        setTimelapseOpen(false);
        onLogWeight(date);
      }
    : undefined;

  const photoMap = useMemo(
    () => new Map(photos.map((p) => [p.photo_type, p])),
    [photos]
  );

  const hasPhotos = photos.length > 0;
  // Expanded toggle only matters when there are no photos. Once a photo exists
  // the section is always shown so existing photos are never hidden behind a
  // collapse. Tracking expansion separately keeps the section compact for the
  // (common) users who don't use the feature.
  const [open, setOpen] = useState(false);
  const expanded = hasPhotos || open;

  return (
    <Card>
      <Collapsible open={expanded} onOpenChange={setOpen}>
        <CardHeader className={expanded ? undefined : 'py-3'}>
          {/* When collapsed, the whole header is the trigger so a single compact
              row is all that's rendered. When expanded (or photos exist) the
              chevron is hidden and the full header/subtitle show as before. */}
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleTrigger
              asChild
              disabled={hasPhotos}
              className="group disabled:cursor-default"
            >
              <div className="flex flex-[1_1_auto] items-center justify-between gap-2 cursor-pointer">
                <CardTitle>
                  {t('checkIn.photos.title', 'Progress Photos')}
                </CardTitle>
                {!hasPhotos && (
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    {t('checkIn.photos.addPhotos', 'Add progress photos')}
                    <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                  </span>
                )}
              </div>
            </CollapsibleTrigger>
            {canCompare && (
              <div className="flex gap-2">
                <Button
                  ref={compareButtonRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCompareOpen(true)}
                >
                  <Columns2 className="h-3.5 w-3.5 mr-1" />
                  {t('checkIn.photos.compare', 'Compare')}
                </Button>
                <Button
                  ref={timelapseButtonRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTimelapseOpen(true)}
                >
                  <Film className="h-3.5 w-3.5 mr-1" />
                  {t('checkIn.photos.timelapse', 'Time-lapse')}
                </Button>
              </div>
            )}
          </div>
          {expanded && (
            <p className="text-sm text-muted-foreground">
              {t(
                'checkIn.photos.subtitle',
                'Upload front, back, and side photos to track your physique over time.'
              )}
            </p>
          )}
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              {PHOTO_ANGLES.map(({ type, labelKey, defaultLabel }) => (
                <PhotoSlot
                  key={type}
                  type={type}
                  label={t(labelKey, defaultLabel)}
                  photo={photoMap.get(type)}
                  date={selectedDate}
                  onUpload={uploadPhoto}
                  onDelete={deletePhoto}
                  isUploading={isUploading && uploadingType === type}
                  disabled={isUploading || isDeleting}
                />
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
      <ProgressPhotoCompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        days={galleryDays}
        onLogWeight={handleLogWeight}
        returnFocusRef={compareButtonRef}
      />
      <ProgressPhotoTimelapseDialog
        open={timelapseOpen}
        onOpenChange={setTimelapseOpen}
        days={galleryDays}
        onLogWeight={handleLogWeight}
        returnFocusRef={timelapseButtonRef}
      />
    </Card>
  );
};
