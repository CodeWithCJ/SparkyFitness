import { useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Upload, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useCheckInPhotos,
  type PhotoType,
  type CheckInPhoto,
} from '@/hooks/CheckIn/useCheckInPhotos';

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

  // Served through the authenticated, ownership-checked route (the session
  // cookie travels with the same-origin <img> request), not the public static
  // mount — progress photos are private.
  const photoUrl = photo
    ? `/api/measurements/check-in-photos/file/${photo.id}`
    : null;

  return (
    <div className="flex flex-col items-center gap-2">
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3 w-3 mr-1" />
          {photo
            ? t('checkIn.photos.replace', 'Replace')
            : t('checkIn.photos.upload', 'Upload')}
        </Button>

        {photo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={disabled}
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
}

const PHOTO_TYPES: {
  type: PhotoType;
  labelKey: string;
  defaultLabel: string;
}[] = [
  { type: 'front', labelKey: 'checkIn.photos.front', defaultLabel: 'Front' },
  { type: 'back', labelKey: 'checkIn.photos.back', defaultLabel: 'Back' },
  { type: 'side', labelKey: 'checkIn.photos.side', defaultLabel: 'Side' },
];

export const CheckInPhotos = ({ selectedDate }: CheckInPhotosProps) => {
  const { t } = useTranslation();
  const { photos, uploadPhoto, deletePhoto, isUploading, uploadingType } =
    useCheckInPhotos(selectedDate);

  const photoMap = useMemo(
    () => new Map(photos.map((p) => [p.photo_type, p])),
    [photos]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('checkIn.photos.title', 'Progress Photos')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(
            'checkIn.photos.subtitle',
            'Upload front, back, and side photos to track your physique over time.'
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {PHOTO_TYPES.map(({ type, labelKey, defaultLabel }) => (
            <PhotoSlot
              key={type}
              type={type}
              label={t(labelKey, defaultLabel)}
              photo={photoMap.get(type)}
              date={selectedDate}
              onUpload={uploadPhoto}
              onDelete={deletePhoto}
              isUploading={isUploading && uploadingType === type}
              disabled={isUploading}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
