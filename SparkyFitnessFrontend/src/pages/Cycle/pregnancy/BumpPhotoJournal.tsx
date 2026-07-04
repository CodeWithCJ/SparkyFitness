import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  usePhotos,
  useUploadPhotoMutation,
  useDeletePhotoMutation,
  type BumpPhoto,
} from '@/hooks/usePregnancy';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Trash2 } from 'lucide-react';

interface BumpPhotoJournalProps {
  pregnancyId: string;
  currentWeek: number;
}

export default function BumpPhotoJournal({
  pregnancyId,
  currentWeek,
}: BumpPhotoJournalProps) {
  const { t } = useTranslation();
  const { data } = usePhotos(pregnancyId);
  const upload = useUploadPhotoMutation();
  const del = useDeletePhotoMutation();
  const inputRef = useRef<HTMLInputElement>(null);

  const photos = (data ?? []) as BumpPhoto[];

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      upload.mutate({ pregnancyId, week: currentWeek, file });
    }
    e.target.value = '';
  };

  return (
    <Card>
      <CardContent className="py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Camera className="h-4 w-4" />
            {t('pregnancy.photos.title', 'Bump photo journal')}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={upload.isPending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="mr-1 h-4 w-4" />
            {upload.isPending
              ? t('pregnancy.photos.uploading', 'Uploading…')
              : t('pregnancy.photos.add', 'Add week {{n}}', { n: currentWeek })}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
        </div>

        {photos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t(
              'pregnancy.photos.empty',
              'Capture your bump each week to see the journey.'
            )}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p) => (
              <div key={p.id} className="group relative">
                <img
                  src={`/${p.file_path}`}
                  alt={t('pregnancy.photos.weekAlt', 'Week {{n}} bump photo', {
                    n: p.week,
                  })}
                  className="aspect-square w-full rounded-xl object-cover"
                  loading="lazy"
                />
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {t('pregnancy.photos.week', 'Wk {{n}}', { n: p.week })}
                </span>
                <button
                  type="button"
                  aria-label={t('pregnancy.photos.delete', 'Delete photo')}
                  onClick={() => del.mutate(p.id)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white opacity-0 transition group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
