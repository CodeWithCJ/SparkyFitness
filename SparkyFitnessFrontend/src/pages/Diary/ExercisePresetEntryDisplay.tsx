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
  ChevronDown,
  Flame,
  Clock,
  Activity,
  Layers,
} from 'lucide-react';
import ExerciseEntryDisplay from './ExerciseEntryDisplay';
import { formatMinutesToHHMM } from '@/utils/timeFormatters';
import { Exercise, ExerciseEntry, PresetSessionEntry } from '@/types/exercises';

interface ExercisePresetEntryDisplayProps {
  presetEntry: PresetSessionEntry;
  currentUserId: string | undefined;
  handleDelete: (presetEntryId: string) => void;
  handleDeleteExerciseEntry: (entryId: string) => void;
  handleEdit: (entry: ExerciseEntry) => void;
  handleEditExerciseDatabase: (exerciseId: string) => void;
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
  setExerciseToPlay,
  setIsPlaybackModalOpen,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpansion = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const totalSets =
    presetEntry.exercises?.reduce(
      (sum, ex) => sum + (ex.sets?.length || 0),
      0
    ) ?? 0;

  const totalMinutes =
    presetEntry.exercises?.reduce(
      (sum, ex) =>
        sum +
        (ex.sets && ex.sets.length > 0
          ? ex.sets.reduce(
              (s, set) => s + (set.duration || 0) + (set.rest_time || 0) / 60,
              0
            )
          : ex.duration_minutes || 0),
      0
    ) ?? 0;

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

  const totalCalories = Math.round(
    convertEnergy(
      presetEntry.exercises?.reduce(
        (sum, ex) => sum + (ex.calories_burned || 0),
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
                  {exerciseCount > 0 && (
                    <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                      {exerciseCount}{' '}
                      {exerciseCount === 1 ? 'exercise' : 'exercises'}
                    </span>
                  )}
                </div>
                {presetEntry.exercise_snapshot?.category && (
                  <p className="text-[10px] font-medium uppercase tracking-widest text-gray-400 dark:text-gray-500 mt-0.5">
                    {presetEntry.exercise_snapshot.category}
                  </p>
                )}
              </div>
            </button>

            {/* Right: delete */}
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

          {/* Description / notes */}
          {(presetEntry.description || presetEntry.notes) && (
            <div className="px-4 pb-2 space-y-0.5">
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
            <div className="mx-4 mb-4 mt-1 grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-800 bg-gray-50 dark:bg-gray-800/60 rounded-lg overflow-hidden">
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
