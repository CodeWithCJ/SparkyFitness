import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dumbbell, Loader2 } from 'lucide-react';
import type {
  ExerciseAlternative,
  ExerciseAlternativeMode,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useExerciseAlternatives } from '@/hooks/Exercises/useExerciseAlternatives';
import { useAddExerciseMutation } from '@/hooks/Exercises/useExerciseSearch';
import type { Exercise } from '@/types/exercises';
import {
  alternativeReasonLabel,
  exerciseFromAlternative,
  type ExerciseReplaceContext,
} from '@/utils/exerciseAlternatives';
import { normalizeExerciseArrays } from '@/utils/exerciseArrays';
import {
  filterValidExerciseImages,
  resolveExerciseImageSrc,
} from '@/utils/exercises';
import { localizeMuscle, localizeEquipment } from '@/utils/exerciseTaxonomy';

interface ExerciseAlternativesPanelProps {
  replaceFor: ExerciseReplaceContext;
  onSelect: (exercise: Exercise, sourceMode: 'internal' | 'external') => void;
  onSearchAll: () => void;
}

// A row shows at most this many reasons; the first ones are the strongest.
const MAX_REASON_CHIPS = 3;

function AlternativeThumbnail({ images }: { images: string[] }) {
  const [failed, setFailed] = useState(false);
  const [first] = filterValidExerciseImages(images);
  if (!first || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted">
        <Dumbbell className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={resolveExerciseImageSrc(first)}
      alt=""
      className="h-12 w-12 shrink-0 rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  );
}

const ExerciseAlternativesPanel = ({
  replaceFor,
  onSelect,
  onSearchAll,
}: ExerciseAlternativesPanelProps) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ExerciseAlternativeMode>('similar');
  const [importingId, setImportingId] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useExerciseAlternatives(
    replaceFor.exerciseId,
    mode,
    replaceFor.excludeIds
  );
  const { mutateAsync: importExercise } = useAddExerciseMutation();

  const handleSelect = async (alternative: ExerciseAlternative) => {
    if (importingId) return;
    const exercise = exerciseFromAlternative(alternative);
    if (alternative.origin === 'library') {
      onSelect(exercise, 'internal');
      return;
    }
    setImportingId(alternative.id);
    try {
      const imported = await importExercise({
        exercise,
        type: 'free-exercise-db',
      });
      onSelect(normalizeExerciseArrays(imported), 'external');
    } catch {
      // apiCall has already shown the error toast.
    } finally {
      setImportingId(null);
    }
  };

  const searchAll = (
    <Button type="button" variant="link" onClick={onSearchAll}>
      {t('exercise.alternatives.searchAll', 'Search all exercises')}
    </Button>
  );

  let body;
  if (isLoading) {
    body = (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (isError || !data) {
    body = (
      <div className="py-8 text-center space-y-2">
        <p className="text-sm text-muted-foreground">
          {t('exercise.alternatives.failed', 'Could not load alternatives')}
        </p>
        <Button type="button" variant="outline" onClick={() => refetch()}>
          {t('exercise.alternatives.retry', 'Retry')}
        </Button>
      </div>
    );
  } else if (!data.rankable) {
    body = (
      <div className="py-8 text-center space-y-1">
        <p className="font-medium">
          {t('exercise.alternatives.noMuscles', {
            defaultValue: 'No muscles recorded for {{name}}',
            name: replaceFor.exerciseName,
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(
            'exercise.alternatives.noMusclesHint',
            'Add its primary muscles in the exercise library to get suggestions.'
          )}
        </p>
        {searchAll}
      </div>
    );
  } else if (data.alternatives.length === 0) {
    body = (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t('exercise.alternatives.empty', 'No alternatives found')}
        </p>
        {searchAll}
      </div>
    );
  } else {
    body = (
      <>
        <ul className="divide-y rounded-md border">
          {data.alternatives.map((alternative) => (
            <li key={`${alternative.origin}-${alternative.id}`}>
              <button
                type="button"
                className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/50 disabled:opacity-60"
                disabled={importingId !== null}
                onClick={() => handleSelect(alternative)}
              >
                <AlternativeThumbnail images={alternative.images} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{alternative.name}</div>
                  <div className="truncate text-sm text-muted-foreground">
                    {[
                      alternative.equipment
                        .map((eq) => localizeEquipment(t, eq))
                        .join(', '),
                      alternative.primary_muscles
                        .map((m) => localizeMuscle(t, m))
                        .join(', '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {alternative.origin === 'catalog' && (
                      <Badge>
                        {t('exercise.alternatives.newBadge', 'New')}
                      </Badge>
                    )}
                    {alternative.reasons
                      .slice(0, MAX_REASON_CHIPS)
                      .map((reason) => (
                        <Badge key={reason} variant="secondary">
                          {alternativeReasonLabel(t, reason)}
                        </Badge>
                      ))}
                  </div>
                </div>
                {importingId === alternative.id && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
              </button>
            </li>
          ))}
        </ul>
        {!data.catalog_available && (
          <p className="text-xs text-muted-foreground text-center">
            {t(
              'exercise.alternatives.catalogUnavailable',
              'Free Exercise DB is unavailable, so only your library is shown.'
            )}
          </p>
        )}
        <div className="text-center">{searchAll}</div>
      </>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t('exercise.alternatives.heading', {
            defaultValue: 'Instead of {{name}}',
            name: replaceFor.exerciseName,
          })}
        </p>
        <div className="flex gap-1" role="group">
          {(
            [
              ['similar', t('exercise.alternatives.modes.similar', 'Similar')],
              [
                'different_equipment',
                t(
                  'exercise.alternatives.modes.differentEquipment',
                  'Other equipment'
                ),
              ],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={mode === value ? 'default' : 'outline'}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {body}
    </div>
  );
};

export default ExerciseAlternativesPanel;
