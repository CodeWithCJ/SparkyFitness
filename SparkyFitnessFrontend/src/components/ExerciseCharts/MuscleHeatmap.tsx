import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  defaultBodyFigure,
  heatLevel,
  maxDrawnMuscleSets,
  setsForMuscleKey,
  svgClassToMuscleKey,
  unmappedMuscleSets,
  untrainedHeatLevel,
  type BodyFigure,
} from '@workspace/shared';
import './MuscleHeatmap.css';

interface MuscleHeatmapProps {
  setsByMuscle: Record<string, number>;
}

interface PickedMuscle {
  key: string;
  sets: number;
}

export const MuscleHeatmap = ({ setsByMuscle }: MuscleHeatmapProps) => {
  const { t } = useTranslation();
  const svgContainerRef = useRef<HTMLDivElement>(null);
  // The report can be a family member's, so the figure starts from the
  // viewed user's profile, not the signed-in one.
  const { activeUserId } = useActiveUser();
  const { data: profile } = useProfileQuery(activeUserId ?? undefined);
  // Starts from the gender stored for BMR. Switching here is a view choice
  // and is never written back to the profile.
  const [chosenFigure, setChosenFigure] = useState<BodyFigure | null>(null);
  const figure = chosenFigure ?? defaultBodyFigure(profile?.gender);
  const { data: svgContent } = useBodyMapSvgQuery(figure);
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  // "Untrained" flips the colours so muscles with no sets stand out.
  const [untrained, setUntrained] = useState(false);
  const maxSets = maxDrawnMuscleSets(setsByMuscle);
  const extra = unmappedMuscleSets(setsByMuscle);
  const setsLabel = t('muscleHeatmap.sets', 'sets');
  const picked: PickedMuscle | null = pickedKey
    ? { key: pickedKey, sets: setsForMuscleKey(pickedKey, setsByMuscle) }
    : null;

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    // While a newly picked figure loads, or if it fails, show nothing rather
    // than leave the previous figure under the new selection.
    if (!svgContent) {
      container.replaceChildren();
      return;
    }
    container.innerHTML = svgContent;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    svgElement.setAttribute('width', '100%');
    svgElement.style.maxWidth = '280px';
    svgElement.style.height = 'auto';

    const cleanups: (() => void)[] = [];

    svgElement.querySelectorAll('path[class]').forEach((path) => {
      const svgClassName = path.getAttribute('class') || '';
      const key = svgClassToMuscleKey(svgClassName);
      const sets = setsForMuscleKey(key, setsByMuscle);
      const level = untrained
        ? untrainedHeatLevel(sets)
        : heatLevel(sets, maxSets);
      path.classList.remove('heat-0', 'heat-1', 'heat-2', 'heat-3', 'heat-4');
      path.classList.add(`heat-${level}`);
      path.setAttribute('data-muscle', key);
      const label = `${key} · ${sets} ${setsLabel}`;
      path.setAttribute('role', 'button');
      path.setAttribute('tabindex', '0');
      path.setAttribute('aria-label', label);

      const pick = () => {
        setPickedKey((current) => (current === key ? null : key));
      };
      const onKeyDown = (event: Event) => {
        const keyEvent = event as KeyboardEvent;
        if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
        keyEvent.preventDefault();
        pick();
      };
      path.addEventListener('click', pick);
      path.addEventListener('keydown', onKeyDown);
      cleanups.push(() => {
        path.removeEventListener('click', pick);
        path.removeEventListener('keydown', onKeyDown);
      });
    });

    svgElement.querySelectorAll('path[data-muscle="lats"]').forEach((path) => {
      svgElement.appendChild(path);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [svgContent, setsByMuscle, maxSets, setsLabel, untrained]);

  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container) return;
    container.querySelectorAll('path[data-muscle]').forEach((path) => {
      const selected = path.getAttribute('data-muscle') === pickedKey;
      path.classList.toggle('is-selected', selected);
      path.classList.toggle('is-dimmed', pickedKey !== null && !selected);
      path.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }, [pickedKey, svgContent, setsByMuscle, maxSets, untrained]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('muscleHeatmap.title', 'Muscle Heat Map')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'muscleHeatmap.subtitle',
            'Working sets on primary muscles in this date range'
          )}
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center">
          <div
            role="group"
            aria-label={t('muscleHeatmap.figure', 'Body figure')}
            className="mb-3 inline-flex rounded-md border bg-muted p-0.5 text-xs"
          >
            {(['male', 'female'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={figure === option}
                onClick={() => {
                  setChosenFigure(option);
                  setPickedKey(null);
                }}
                className={`rounded px-3 py-1 font-medium ${
                  figure === option
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                {option === 'male'
                  ? t('muscleHeatmap.male', 'Male')
                  : t('muscleHeatmap.female', 'Female')}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label={t('muscleHeatmap.view', 'Heat map view')}
            className="mb-3 inline-flex rounded-md border bg-muted p-0.5 text-xs"
          >
            {[false, true].map((option) => (
              <button
                key={String(option)}
                type="button"
                aria-pressed={untrained === option}
                onClick={() => setUntrained(option)}
                className={`rounded px-3 py-1 font-medium ${
                  untrained === option
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground'
                }`}
              >
                {option
                  ? t('muscleHeatmap.untrained', 'Untrained')
                  : t('muscleHeatmap.trained', 'Trained')}
              </button>
            ))}
          </div>
          <div
            ref={svgContainerRef}
            className="muscle-heatmap w-full flex justify-center overflow-hidden max-w-[280px]"
          />
          {picked ? (
            <div
              role="status"
              className="mt-3 rounded-full border bg-popover px-3 py-1.5 text-sm shadow-md"
            >
              <span className="font-medium capitalize">{picked.key}</span>
              <span className="text-muted-foreground">
                {' '}
                · {picked.sets} {setsLabel}
              </span>
            </div>
          ) : (
            <p className="mt-3 text-[10px] text-muted-foreground">
              {t('muscleHeatmap.tap', 'Tap a muscle')}
            </p>
          )}
          {untrained ? (
            <p className="mt-3 text-[10px] text-muted-foreground">
              {t(
                'muscleHeatmap.untrainedHint',
                'Highlighted muscles had no working sets in this range'
              )}
            </p>
          ) : (
            <div className="flex items-center gap-1.5 mt-3 text-[10px] text-muted-foreground">
              <span>{t('muscleHeatmap.fewer', 'Fewer')}</span>
              {['#374151', '#86efac', '#22c55e', '#eab308', '#e11d48'].map(
                (color) => (
                  <span
                    key={color}
                    className="inline-block w-3 h-3 rounded-[2px]"
                    style={{ backgroundColor: color }}
                  />
                )
              )}
              <span>{t('muscleHeatmap.more', 'More')}</span>
            </div>
          )}
          {extra.length > 0 && (
            <div className="mt-3 w-full">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                {t('muscleHeatmap.notOnFigure', 'Not on the figure')}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {extra.map((row) => (
                  <li
                    key={row.muscle}
                    className="flex items-center justify-between"
                  >
                    <span className="capitalize">{row.muscle}</span>
                    <span>
                      {row.sets} {setsLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
