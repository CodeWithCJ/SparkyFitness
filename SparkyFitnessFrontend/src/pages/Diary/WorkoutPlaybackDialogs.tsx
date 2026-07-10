import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { WorkoutSetPointer } from '@/utils/workoutPlayback';
import { formatSecondsClock } from '@/utils/timeFormatters';

const REST_PRESETS = [30, 45, 60, 90, 120, 180, 300];
const MIN_REST_SECONDS = 15;
const MAX_REST_SECONDS = 900;

interface WorkoutPlaybackDialogsProps {
  restEditorPointer: WorkoutSetPointer | null;
  restEditorCustomValue: string;
  onCloseRestEditor: () => void;
  onUpdateRestForPointer: (seconds: number) => void;
  onSetRestEditorCustomValue: (value: string) => void;
  onSaveCustomRest: () => void;
  isDiscardDialogOpen: boolean;
  onDiscardDialogChange: (open: boolean) => void;
  onConfirmDiscard: () => void;
}

const WorkoutPlaybackDialogs = ({
  restEditorPointer,
  restEditorCustomValue,
  onCloseRestEditor,
  onUpdateRestForPointer,
  onSetRestEditorCustomValue,
  onSaveCustomRest,
  isDiscardDialogOpen,
  onDiscardDialogChange,
  onConfirmDiscard,
}: WorkoutPlaybackDialogsProps) => {
  const { t } = useTranslation();

  return (
    <>
      <Dialog
        open={!!restEditorPointer}
        onOpenChange={(open) => !open && onCloseRestEditor()}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t('exercise.workoutPlaybackPage.restEditorTitle', 'Edit Rest')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'exercise.workoutPlaybackPage.restEditorDescription',
                'Pick a rest duration for this set.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {REST_PRESETS.map((seconds) => (
                <Button
                  key={seconds}
                  type="button"
                  variant="outline"
                  className="tabular-nums"
                  onClick={() => onUpdateRestForPointer(seconds)}
                >
                  {formatSecondsClock(seconds)}
                </Button>
              ))}
            </div>
            <div className="space-y-2">
              <label
                className="text-sm font-medium"
                htmlFor="custom-rest-seconds"
              >
                {t(
                  'exercise.workoutPlaybackPage.customRest',
                  'Custom (seconds)'
                )}
              </label>
              <Input
                id="custom-rest-seconds"
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={MIN_REST_SECONDS}
                max={MAX_REST_SECONDS}
                step={5}
                value={restEditorCustomValue}
                onChange={(event) =>
                  onSetRestEditorCustomValue(event.target.value)
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCloseRestEditor}
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={onSaveCustomRest}>
                {t('common.save', 'Save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={isDiscardDialogOpen}
        onOpenChange={onDiscardDialogChange}
        onConfirm={onConfirmDiscard}
        title={t('exercise.workoutPlaybackDialog.discard', 'Discard')}
        description={t(
          'exercise.workoutPlaybackDialog.discardConfirm',
          'Discard this in-progress workout? This cannot be undone.'
        )}
        variant="destructive"
        confirmLabel={t('exercise.workoutPlaybackDialog.discard', 'Discard')}
      />
    </>
  );
};

export default WorkoutPlaybackDialogs;
