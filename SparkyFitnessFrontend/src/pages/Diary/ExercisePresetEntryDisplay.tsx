import type React from 'react';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Trash2,
  Link2,
  ChevronDown,
  Flame,
  Clock,
  Activity,
  Gauge,
  Layers,
  MapPin,
} from 'lucide-react';
import ExerciseEntryDisplay from './ExerciseEntryDisplay';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  formatMinutesToHHMM,
  formatSecondsClock,
  formatTimeOfDayString,
} from '@/utils/timeFormatters';
import { Exercise, ExerciseEntry, PresetSessionEntry } from '@/types/exercises';
import {
  earliestEntryTime,
  entryCaloriesCounted,
  isAppLoggedWorkoutSource,
  setsDurationMinutes,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import WorkoutFeedbackPanel from './WorkoutFeedbackPanel';

interface ExercisePresetEntryDisplayProps {
  presetEntry: PresetSessionEntry;
  currentUserId: string | undefined;
  handleDelete: (presetEntryId: string) => void;
  handleDeleteExerciseEntry: (entryId: string) => void;
  handleEdit: (entry: ExerciseEntry) => void;
  handleEditExerciseDatabase: (exerciseId: string) => void;
  /** Opens the dialog that links this session to a synced workout; omitted when the diary is read-only. */
  onLink?: (entryId: string) => void;
  setExerciseToPlay: (exercise: Exercise | null) => void;
  setIsPlaybackModalOpen: (isOpen: boolean) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    fromUnit: 'kcal' | 'kJ',
    toUnit: 'kcal' | 'kJ'
  ) => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const ExercisePresetEntryDisplay: React.FC<ExercisePresetEntryDisplayProps> = ({
  presetEntry,
  currentUserId,
  handleDelete,
  handleDeleteExerciseEntry,
  handleEdit,
  handleEditExerciseDatabase,
  onLink,
  setExerciseToPlay,
  setIsPlaybackModalOpen,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { timeFormat } = usePreferences();
  const [isExpanded, setIsExpanded] = useState(false);
  // The feedback panel autosaves, so only people who can write the diary
  // get it (#1560); report-only viewers can't save and don't see it here.
  const { hasWritePermission } = useActiveUser();
  const canGiveFeedback = hasWritePermission('diary');

  // Linking works on the whole session, so any of its exercises will do.
  const linkableEntry = presetEntry.exercises?.[0];
  const linkableEntryId =
    linkableEntry && isAppLoggedWorkoutSource(linkableEntry.source)
      ? linkableEntry.id
      : null;

  const toggleExpansion = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const totalSets =
    presetEntry.exercises?.reduce(
      (sum, ex) => sum + (ex.sets?.length || 0),
      0
    ) ?? 0;

  const totalMinutes =
    presetEntry.exercises?.reduce((sum, ex) => {
      const setsDuration = setsDurationMinutes(ex.sets);
      // Fall back to the entry-level duration when the sets carry no per-set
      // timers (e.g. rep-based sets synced from Hevy).
      return sum + (setsDuration > 0 ? setsDuration : ex.duration_minutes || 0);
    }, 0) ?? 0;

  const avgHR = (() => {
    const withHR =
      presetEntry.exercises?.filter((ex) => ex.avg_heart_rate) ?? [];
    return withHR.length > 0
      ? Math.round(
          withHR.reduce((sum, ex) => sum + (ex.avg_heart_rate || 0), 0) /
            withHR.length
        )
      : 0;
  })();

  // A strength session stores the person's rating on every exercise, so any
  // one that has it speaks for the session.
  const effort = (() => {
    const ratings = (presetEntry.exercises ?? [])
      .map((ex) => ex.workout_effort)
      .filter((value): value is number => typeof value === 'number');
    return ratings.length > 0 ? Math.max(...ratings) : null;
  })();

  const earliestTime = earliestEntryTime(presetEntry.exercises ?? []);

  const totalCalories = Math.round(
    convertEnergy(
      presetEntry.exercises?.reduce(
        (sum, ex) => sum + entryCaloriesCounted(ex),
        0
      ) ?? 0,
      'kcal',
      energyUnit
    )
  );

  const hasExercises =
    presetEntry.exercises && presetEntry.exercises.length > 0;
  const exerciseCount = presetEntry.exercises?.length ?? 0;

  return (
    <Card className="overflow-hidden border-0 shadow-md bg-white dark:bg-gray-900 rounded-xl">
      {/* Accent bar + header */}
      <div className="flex">
        {/* Left accent stripe */}
        <div className="w-1 flex-shrink-0 bg-gradient-to-b from-blue-500 to-indigo-600 rounded-l-xl" />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            {/* Left: toggle + name */}
            <button
              onClick={toggleExpansion}
              className="flex items-center gap-3 min-w-0 flex-1 text-left group"
              aria-expanded={isExpanded}
            >
              <span
                className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full border-2 transition-all duration-200
                  ${
                    isExpanded
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-400 group-hover:border-blue-400 group-hover:text-blue-500'
                  }`}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                />
              </span>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-gray-50 text-base leading-tight truncate">
                    {presetEntry.name ||
                      t('exerciseCard.workoutPreset', 'Workout Preset')}
                  </span>
                  {earliestTime && (
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full dark:bg-blue-900/30 dark:text-blue-300 font-medium">
                      {formatTimeOfDayString(earliestTime, timeFormat)}
                    </span>
                  )}
                  {exerciseCount > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                      {exerciseCount}{' '}
                      {exerciseCount === 1 ? 'exercise' : 'exercises'}
                    </span>
                  )}
                  {(() => {
                    const wodDetail = presetEntry.activity_details?.find(
                      (d) => d.detail_type === 'wod_score'
                    );
                    if (!wodDetail?.detail_data) return null;
                    let data = wodDetail.detail_data;
                    while (typeof data === 'string') {
                      try {
                        data = JSON.parse(data);
                      } catch {
                        return null;
                      }
                    }
                    if (!data || typeof data !== 'object') return null;
                    const wod = data as {
                      workout_format?: string;
                      format?: string;
                      rounds_completed?: number;
                      rounds?: number;
                      reps_completed?: number;
                      extra_reps?: number;
                      reps?: number;
                      elapsed_seconds?: number;
                      time_seconds?: number;
                      is_rx?: boolean;
                      status?: string;
                      scaling_status?: string;
                    };
                    const format = (wod.workout_format || wod.format || 'WOD')
                      .toUpperCase()
                      .replace('_', ' ');
                    const rounds = wod.rounds_completed ?? wod.rounds ?? 0;
                    const reps =
                      wod.reps_completed ?? wod.extra_reps ?? wod.reps ?? 0;
                    const isRx =
                      wod.is_rx === true ||
                      wod.status === 'rx' ||
                      wod.scaling_status === 'rx';

                    let scoreStr = '';
                    if (
                      wod.workout_format === 'amrap' ||
                      wod.format === 'amrap'
                    ) {
                      scoreStr = `${rounds} rds${reps > 0 ? ` + ${reps} reps` : ''}`;
                    } else if (
                      wod.workout_format === 'for_time' ||
                      wod.format === 'for_time'
                    ) {
                      const secs = wod.time_seconds ?? wod.elapsed_seconds;
                      scoreStr =
                        typeof secs === 'number'
                          ? formatSecondsClock(secs)
                          : 'Done';
                    } else if (rounds > 0) {
                      scoreStr = `${rounds} rds`;
                    }

                    return (
                      <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/50">
                        {format}
                        {scoreStr ? ` • ${scoreStr}` : ''}
                        {` (${isRx ? 'Rx' : 'Scaled'})`}
                      </span>
                    );
                  })()}
                </div>
                {presetEntry.exercise_snapshot?.category && (
                  <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">
                    {presetEntry.exercise_snapshot.category}
                  </p>
                )}
              </div>
            </button>

            {/* Right: link to a synced workout, then delete */}
            {onLink && linkableEntryId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onLink(linkableEntryId)}
                      className="flex-shrink-0 h-8 w-8 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 transition-colors"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      {t(
                        'exercise.calorieLink.action',
                        'Link a synced workout'
                      )}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(presetEntry.id)}
                    className="flex-shrink-0 h-8 w-8 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {t('exerciseCard.deletePresetEntry', 'Delete Preset Entry')}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Description / notes / gym */}
          {(presetEntry.description ||
            presetEntry.notes ||
            presetEntry.location) && (
            <div className="px-4 pb-2 space-y-0.5">
              {presetEntry.location && (
                <p
                  className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                  title={t('exerciseCard.workoutLocation', 'Gym / Location')}
                >
                  <MapPin className="w-3 h-3" />
                  {presetEntry.location}
                </p>
              )}
              {presetEntry.description && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {presetEntry.description}
                </p>
              )}
              {presetEntry.notes && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                  {presetEntry.notes}
                </p>
              )}
            </div>
          )}

          {/* Stats strip */}
          {hasExercises && (
            <div
              className={`mx-4 mb-4 mt-1 grid ${effort != null ? 'grid-cols-5' : 'grid-cols-4'} divide-x divide-gray-100 dark:divide-gray-800 bg-gray-50 dark:bg-gray-800/60 rounded-lg overflow-hidden`}
            >
              <StatCell
                icon={<Layers className="w-3 h-3" />}
                value={String(totalSets)}
                label={t('common.totalSets', 'Sets')}
                color="text-blue-600 dark:text-blue-400"
              />
              <StatCell
                icon={<Clock className="w-3 h-3" />}
                value={formatMinutesToHHMM(totalMinutes)}
                label={t('common.minutesUnit', 'Time')}
                color="text-indigo-600 dark:text-indigo-400"
              />
              <StatCell
                icon={<Activity className="w-3 h-3" />}
                value={avgHR > 0 ? String(avgHR) : '—'}
                label={t('common.avgHrUnit', 'Avg HR')}
                color="text-rose-500 dark:text-rose-400"
              />
              {effort != null && (
                <StatCell
                  icon={<Gauge className="w-3 h-3" />}
                  value={t('exerciseCard.effortOutOf', {
                    defaultValue: '{{rating}}/10',
                    rating: effort,
                  })}
                  label={t('exerciseCard.effort', 'Effort')}
                  color="text-purple-600 dark:text-purple-400"
                />
              )}
              <StatCell
                icon={<Flame className="w-3 h-3" />}
                value={String(totalCalories)}
                label={getEnergyUnitString(energyUnit)}
                color="text-orange-500 dark:text-orange-400"
              />
            </div>
          )}
        </div>
      </div>

      {/* Expanded exercise list */}
      {isExpanded && (
        <CardContent className="px-4 pb-4 pt-0 space-y-2 border-t border-gray-100 dark:border-gray-800">
          <div className="pt-3 space-y-2">
            {hasExercises ? (
              presetEntry.exercises!.map((exerciseEntry) => (
                <ExerciseEntryDisplay
                  key={exerciseEntry.id}
                  exerciseEntry={exerciseEntry}
                  currentUserId={currentUserId}
                  handleEdit={handleEdit}
                  handleDelete={handleDeleteExerciseEntry}
                  handleEditExerciseDatabase={handleEditExerciseDatabase}
                  setExerciseToPlay={setExerciseToPlay}
                  setIsPlaybackModalOpen={setIsPlaybackModalOpen}
                  energyUnit={energyUnit}
                  convertEnergy={convertEnergy}
                  getEnergyUnitString={getEnergyUnitString}
                />
              ))
            ) : (
              <p className="text-sm text-center text-gray-400 dark:text-gray-500 py-4">
                {t(
                  'exerciseCard.noExercisesInPreset',
                  'No exercises in this preset.'
                )}
              </p>
            )}
            {hasExercises && canGiveFeedback && (
              <WorkoutFeedbackPanel
                presetEntryId={presetEntry.id}
                exercises={presetEntry.exercises!.map((exerciseEntry) => ({
                  id: exerciseEntry.id,
                  name: exerciseEntry.exercise_snapshot?.name ?? '',
                }))}
              />
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

// Small reusable stat cell
const StatCell: React.FC<{
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}> = ({ icon, value, label, color }) => (
  <div className="flex flex-col items-center justify-center py-2.5 px-1 gap-0.5">
    <span className={`${color} flex items-center gap-1`}>
      {icon}
      <span className="font-bold text-sm text-gray-800 dark:text-gray-100">
        {value}
      </span>
    </span>
    <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium">
      {label}
    </span>
  </div>
);

export default ExercisePresetEntryDisplay;
