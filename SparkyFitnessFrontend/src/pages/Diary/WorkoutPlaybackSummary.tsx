import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Flag,
  Pause,
  Play,
  SkipForward,
  X,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import type { WeightUnit } from '@/contexts/PreferencesContext';
import type {
  WorkoutPlaybackDraft,
  WorkoutPlaybackStats,
} from '@/utils/workoutPlayback';
import { formatSecondsClock } from '@/utils/timeFormatters';
import { kgToLbs } from '@/utils/unitConversions';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

const DEFAULT_REST_DISPLAY = '0:00';

function formatWorkoutVolume(
  totalVolume: number,
  weightUnit: WeightUnit
): number {
  const displayVolume =
    weightUnit === 'kg' ? totalVolume : kgToLbs(totalVolume);
  return Number(displayVolume.toFixed(1));
}

interface WorkoutPlaybackSummaryProps {
  draft: WorkoutPlaybackDraft;
  elapsedSeconds: number;
  totalVolume: number;
  weightUnit: WeightUnit;
  stats: WorkoutPlaybackStats | null;
  restRemaining: string;
  isRestActive: boolean;
  saveError: string | null;
  isSaving: boolean;
  onCloseKeepDraft: () => void;
  onDiscard: () => void;
  onFinishWorkout: () => void;
  onPauseResumeRest: () => void;
  onSkipRest: () => void;
  onSessionNotesChange: (value: string) => void;
}

const WorkoutPlaybackSummary = ({
  draft,
  elapsedSeconds,
  totalVolume,
  weightUnit,
  stats,
  restRemaining,
  isRestActive,
  saveError,
  isSaving,
  onCloseKeepDraft,
  onDiscard,
  onFinishWorkout,
  onPauseResumeRest,
  onSkipRest,
  onSessionNotesChange,
}: WorkoutPlaybackSummaryProps) => {
  const { t } = useTranslation();
  const volumeUnit = getLocalizedUnitLabel(
    weightUnit === 'kg' ? 'kg' : 'lbs',
    t
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          className="w-fit gap-2"
          onClick={onCloseKeepDraft}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t('common.back', 'Back')}
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onCloseKeepDraft}>
            <X className="h-4 w-4" aria-hidden="true" />
            {t('exercise.workoutPlaybackDialog.closeKeepDraft', 'Close')}
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard}>
            {t('exercise.workoutPlaybackDialog.discard', 'Discard')}
          </Button>
          <Button type="button" onClick={onFinishWorkout} disabled={isSaving}>
            <Flag className="h-4 w-4" aria-hidden="true" />
            {isSaving
              ? t('exercise.workoutPlaybackDialog.finishing', 'Saving...')
              : t('exercise.workoutPlaybackDialog.finish', 'Finish Workout')}
          </Button>
        </div>
      </div>

      <Card className="border-0 bg-transparent shadow-none">
        <CardHeader className="space-y-1 px-0 pb-2 pt-0">
          <h1 className="text-sm font-semibold leading-tight">{draft.name}</h1>
          <CardDescription className="text-[11px] leading-tight">
            {t(
              'exercise.workoutPlaybackPage.description',
              'Track your sets live, follow rest countdowns, and save when you finish.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 px-0 pt-0">
          <div className="grid w-full grid-cols-2 gap-px overflow-hidden rounded-sm border border-border/60 bg-border text-center sm:grid-cols-4">
            <div className="flex min-w-0 flex-col items-center justify-center bg-background px-1 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('exercise.workoutPlaybackPage.elapsedTime', 'Duration')}
              </span>
              <span className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                {formatSecondsClock(elapsedSeconds)}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center bg-background px-1 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('exercise.workoutPlaybackPage.volume', 'Volume')}
              </span>
              <span className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                {t(
                  'exercise.workoutPlaybackPage.volumeValue',
                  '{{value}} {{unit}}',
                  {
                    value: formatWorkoutVolume(totalVolume, weightUnit),
                    unit: volumeUnit,
                  }
                )}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center bg-background px-1 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('exercise.workoutPlaybackPage.progress', 'Sets')}
              </span>
              <span className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                {t(
                  'exercise.workoutPlaybackPage.progressValue',
                  '{{completed}} of {{total}}',
                  {
                    completed: stats?.completedSets ?? 0,
                    total: stats?.totalSets ?? 0,
                  }
                )}
              </span>
            </div>
            <div className="flex min-w-0 flex-col items-center justify-center bg-background px-1 py-2">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t('exercise.workoutPlaybackPage.restTimer', 'Rest')}
              </span>
              <span className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                {draft.rest_timer.state === 'idle'
                  ? DEFAULT_REST_DISPLAY
                  : restRemaining}
              </span>
              {isRestActive && (
                <div className="mt-1 flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={
                      draft.rest_timer.state === 'running'
                        ? t(
                            'exercise.workoutPlaybackPage.pauseRest',
                            'Pause rest'
                          )
                        : t(
                            'exercise.workoutPlaybackPage.resumeRest',
                            'Resume rest'
                          )
                    }
                    onClick={onPauseResumeRest}
                  >
                    {draft.rest_timer.state === 'running' ? (
                      <Pause className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <Play className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    aria-label={t(
                      'exercise.workoutPlaybackPage.skipRest',
                      'Skip rest'
                    )}
                    onClick={onSkipRest}
                  >
                    <SkipForward className="h-3 w-3" aria-hidden="true" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label
              className="text-sm font-medium"
              htmlFor="workout-session-notes"
            >
              {t('exercise.logExerciseEntryDialog.sessionNotes', 'Notes')}
            </label>
            <Textarea
              id="workout-session-notes"
              value={draft.notes ?? ''}
              rows={2}
              className="resize-none text-sm"
              placeholder={t(
                'exercise.logExerciseEntryDialog.notesPlaceholder',
                'Any notes about this session...'
              )}
              onChange={(event) => onSessionNotesChange(event.target.value)}
            />
          </div>

          {saveError && (
            <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span>{saveError}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};

export default WorkoutPlaybackSummary;
