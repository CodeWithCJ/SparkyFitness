import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { SymptomEntryResponse } from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  useCustomSymptoms,
  useDeleteSymptomEntryMutation,
  useUpdateSymptomEntryMutation,
} from '@/hooks/useSymptoms';
import type { MedicationDetail } from '@/types/medications';
import SeverityChart from './SeverityChart';
import TreatmentsEditor from './TreatmentsEditor';
import { symptomPhotoUrl } from './symptomHelpers';
import {
  formatDuration,
  minutesBetween,
  scaleMax,
  draftsFromEntry,
  draftsToInputs,
  type TreatmentDraft,
} from '@workspace/shared';

interface EpisodeDetailDialogProps {
  entry: SymptomEntryResponse | null;
  meds: MedicationDetail[];
  onClose: () => void;
  onEdit: (entry: SymptomEntryResponse) => void;
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <Badge key={v} variant="secondary" className="font-normal">
            {v}
          </Badge>
        ))}
      </div>
    </div>
  );
}

/** The body of the dialog. Keyed by entry id so its draft state resets per entry. */
function EpisodeDetail({
  entry,
  meds,
  onClose,
  onEdit,
}: Omit<EpisodeDetailDialogProps, 'entry'> & { entry: SymptomEntryResponse }) {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, formatTime } = usePreferences();
  const { data: definitions = [] } = useCustomSymptoms();
  const update = useUpdateSymptomEntryMutation();
  const remove = useDeleteSymptomEntryMutation();
  const [drafts, setDrafts] = useState<TreatmentDraft[]>(() =>
    draftsFromEntry(entry)
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scale =
    definitions.find((d) => d.id === entry.symptom_id)?.scale_type ?? '1-10';
  const startIso = entry.started_at ?? entry.logged_at;
  const isEpisode = entry.started_at != null;
  const dirty =
    JSON.stringify(draftsToInputs(drafts)) !==
    JSON.stringify(draftsToInputs(draftsFromEntry(entry)));

  return (
    <>
      <DialogHeader>
        <DialogTitle>{entry.symptom_name_snapshot}</DialogTitle>
        <DialogDescription>
          {formatDateInUserTimezone(startIso, 'PP')} · {formatTime(startIso)}
          {isEpisode && (
            <>
              {' → '}
              {entry.ended_at
                ? formatTime(entry.ended_at)
                : t('symptoms.episode.ongoing', 'ongoing')}
              {' · '}
              {formatDuration(
                minutesBetween(startIso, entry.ended_at ?? new Date())
              )}
            </>
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {entry.severity != null && (
            <span>
              <Trans
                i18nKey="symptoms.sections.severity"
                defaults={'Severity <strong>{{severity}}</strong>'}
                values={{ severity: entry.severity }}
                components={{ strong: <strong /> }}
              />
            </span>
          )}
          {entry.peak_severity != null &&
            entry.peak_severity !== entry.severity && (
              <span className="text-muted-foreground">
                {t('symptoms.episode.peak', 'peak {{n}}', {
                  n: entry.peak_severity,
                })}
              </span>
            )}
          {entry.impact && (
            <Badge variant="outline">
              {t(`symptoms.impact.${entry.impact}`, entry.impact)}
            </Badge>
          )}
        </div>

        {isEpisode && <SeverityChart entry={entry} max={scaleMax(scale)} />}

        <ChipRow
          label={t('symptoms.sections.where', 'Where')}
          values={entry.body_locations}
        />
        {Object.entries(entry.phases).map(([phase, values]) => (
          <ChipRow
            key={phase}
            label={t(`symptoms.phases.${phase}`, phase)}
            values={values}
          />
        ))}
        <ChipRow
          label={t('symptoms.sections.qualities', 'What it feels like')}
          values={entry.qualities}
        />
        <ChipRow
          label={t('symptoms.sections.associated', 'Other symptoms')}
          values={entry.associated_symptoms}
        />
        <ChipRow
          label={t('symptoms.sections.triggers', 'Possible triggers')}
          values={entry.triggers}
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('symptoms.sections.treatments', 'Treatments')}
          </span>
          <TreatmentsEditor value={drafts} onChange={setDrafts} meds={meds} />
          {dirty && (
            <Button
              type="button"
              size="sm"
              className="self-start"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  id: entry.id,
                  body: { treatments: draftsToInputs(drafts) },
                })
              }
            >
              {t('symptoms.episode.saveTreatments', 'Save treatments')}
            </Button>
          )}
        </div>

        {entry.context_text && (
          <p className="rounded-md border bg-muted/30 p-2 text-sm italic">
            {entry.context_text}
          </p>
        )}

        {entry.photo_ids.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {entry.photo_ids.map((id) => (
              <a
                key={id}
                href={symptomPhotoUrl(id)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={symptomPhotoUrl(id)}
                  alt={t('symptoms.photos.saved', 'Saved photo')}
                  className="h-20 w-20 rounded-md object-cover"
                />
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
          {confirmDelete ? (
            <div className="flex items-center gap-2 text-sm">
              <span>
                {t('symptoms.detail.confirmDelete', 'Delete this log?')}
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(entry.id, { onSuccess: onClose })}
              >
                {t('symptoms.detail.delete', 'Delete')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                {t('symptoms.form.cancel', 'Cancel')}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              {t('symptoms.detail.delete', 'Delete')}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEdit(entry)}
          >
            {t('symptoms.detail.edit', 'Edit')}
          </Button>
        </div>
      </div>
    </>
  );
}

/** Full view of one entry or episode: chart, details, treatments and photos. */
export default function EpisodeDetailDialog({
  entry,
  meds,
  onClose,
  onEdit,
}: EpisodeDetailDialogProps) {
  return (
    <Dialog open={entry != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        {entry && (
          <EpisodeDetail
            key={entry.id}
            entry={entry}
            meds={meds}
            onClose={onClose}
            onEdit={onEdit}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
