import type React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Edit, Trash2, Settings, Play } from 'lucide-react';
import { formatWeight } from '@/utils/numberFormatting';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatMinutesToHHMM } from '@/utils/timeFormatters';
import { ExerciseEntry, Exercise } from '@/types/exercises';
import {
  EXERCISE_CATEGORY_META,
  ExerciseCategory,
} from '@/constants/exercises';
import { useState } from 'react';

interface ExerciseEntryDisplayProps {
  exerciseEntry: ExerciseEntry;
  currentUserId: string | undefined;
  handleEdit: (entry: ExerciseEntry) => void;
  handleDelete: (entryId: string) => void;
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

// Source badge config
const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  wger: {
    label: 'Wger',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  'free-exercise-db': {
    label: 'Free DB',
    className:
      'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  },
  nutritionix: {
    label: 'Nutritionix',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

const ExerciseEntryDisplay: React.FC<ExerciseEntryDisplayProps> = ({
  exerciseEntry,
  currentUserId,
  handleEdit,
  handleDelete,
  handleEditExerciseDatabase,
  setExerciseToPlay,
  setIsPlaybackModalOpen,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { weightUnit } = usePreferences();
  const snapshot = exerciseEntry.exercise_snapshot;

  const [imageError, setImageError] = useState(false);
  const sourceBadge = snapshot?.source
    ? SOURCE_BADGES[snapshot.source]
    : snapshot?.is_custom
      ? {
          label: 'Custom',
          className:
            'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        }
      : null;

  const isActiveCalories = snapshot?.name === 'Active Calories';

  const durationDisplay = formatMinutesToHHMM(
    exerciseEntry.sets && exerciseEntry.sets.length > 0
      ? exerciseEntry.sets.reduce(
          (sum, set) => sum + (set.duration || 0) + (set.rest_time || 0) / 60,
          0
        )
      : exerciseEntry.duration_minutes || 0
  );

  const caloriesDisplay = `${Math.round(convertEnergy(exerciseEntry.calories_burned || 0, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`;

  const hasSets =
    exerciseEntry.sets &&
    Array.isArray(exerciseEntry.sets) &&
    exerciseEntry.sets.length > 0;

  const imageUrl = exerciseEntry.image_url
    ? exerciseEntry.image_url
    : snapshot?.images && snapshot.images.length > 0
      ? exerciseEntry.source
        ? `/uploads/exercises/${snapshot.images[0]}`
        : snapshot.images[0]
      : null;

  const metaPills: string[] = [];
  if (snapshot?.level) metaPills.push(snapshot.level);
  if (snapshot?.force) metaPills.push(snapshot.force);
  if (snapshot?.mechanic) metaPills.push(snapshot.mechanic);
  const meta =
    EXERCISE_CATEGORY_META[snapshot?.category as ExerciseCategory] ??
    EXERCISE_CATEGORY_META['general'];
  const CategoryIcon = meta.icon;
  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-150">
      {/* Optional thumbnail */}
      {imageUrl && !imageError ? (
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden cursor-pointer ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-blue-400 transition-all">
              <img
                src={imageUrl}
                alt={snapshot?.name || 'Exercise'}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{snapshot?.name || 'Exercise Image'}</DialogTitle>
              <DialogDescription>
                Preview of the exercise image.
              </DialogDescription>
            </DialogHeader>
            <img
              src={imageUrl}
              alt={snapshot?.name || 'Exercise'}
              onError={() => setImageError(true)}
              className="w-full h-auto object-contain"
            />
          </DialogContent>
        </Dialog>
      ) : (
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${meta.bg}`}
        >
          <CategoryIcon className={`w-4 h-4 ${meta.color}`} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-tight">
            {snapshot?.name || 'Unknown Exercise'}
          </span>
          {sourceBadge && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.className}`}
            >
              {sourceBadge.label}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400 mb-1">
          {isActiveCalories ? (
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {caloriesDisplay} active
            </span>
          ) : (
            <>
              <span>{durationDisplay}</span>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="text-orange-600 dark:text-orange-400 font-medium">
                {caloriesDisplay}
              </span>
              {hasSets && (
                <>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <span>{exerciseEntry.sets!.length} sets</span>
                </>
              )}
            </>
          )}
        </div>

        {/* Sets detail chips */}
        {hasSets && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {exerciseEntry.sets!.map((set, index) => {
              const parts: string[] = [];
              if (Number.isFinite(set.reps)) parts.push(`${set.reps} reps`);
              if (set.weight && Number.isFinite(set.weight))
                parts.push(formatWeight(set.weight, weightUnit));
              if (Number.isFinite(set.rpe)) parts.push(`RPE ${set.rpe}`);
              if (parts.length === 0) return null;
              return (
                <span
                  key={index}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-medium"
                >
                  {index + 1}: {parts.join(' · ')}
                </span>
              );
            })}
          </div>
        )}

        {/* Meta pills: level / force / mechanic */}
        {metaPills.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mb-1">
            {metaPills.map((pill) => (
              <span
                key={pill}
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 capitalize"
              >
                {pill}
              </span>
            ))}
          </div>
        )}

        {/* Muscles */}
        {snapshot?.primary_muscles && snapshot.primary_muscles.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              Primary:{' '}
            </span>
            {snapshot.primary_muscles.join(', ')}
          </div>
        )}
        {snapshot?.secondary_muscles &&
          snapshot.secondary_muscles.length > 0 && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              <span className="font-medium text-gray-500 dark:text-gray-400">
                Secondary:{' '}
              </span>
              {snapshot.secondary_muscles.join(', ')}
            </div>
          )}
        {snapshot?.equipment && snapshot.equipment.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              Equipment:{' '}
            </span>
            {snapshot.equipment.join(', ')}
          </div>
        )}
        {exerciseEntry.notes && (
          <div className="text-[10px] italic text-gray-400 dark:text-gray-500 mt-0.5">
            {exerciseEntry.notes}
          </div>
        )}
      </div>

      {/* Action buttons — visible on hover or always on mobile */}
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 self-start pt-0.5">
        {snapshot?.instructions && snapshot.instructions.length > 0 && (
          <ActionButton
            icon={<Play className="w-3.5 h-3.5" />}
            label="Play Instructions"
            onClick={() => {
              setExerciseToPlay(snapshot);
              setIsPlaybackModalOpen(true);
            }}
            colorClass="hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
          />
        )}
        <ActionButton
          icon={<Edit className="w-3.5 h-3.5" />}
          label="Edit Entry"
          onClick={() => handleEdit(exerciseEntry)}
          colorClass="hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
        />
        {snapshot?.user_id === currentUserId && (
          <ActionButton
            icon={<Settings className="w-3.5 h-3.5" />}
            label="Edit Exercise in Database"
            onClick={() =>
              handleEditExerciseDatabase(exerciseEntry.exercise_id)
            }
            colorClass="hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
          />
        )}
        <ActionButton
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label="Delete Entry"
          onClick={() => handleDelete(exerciseEntry.id)}
          colorClass="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
        />
      </div>
    </div>
  );
};

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colorClass: string;
}> = ({ icon, label, onClick, colorClass }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={`h-7 w-7 text-gray-400 transition-colors ${colorClass}`}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default ExerciseEntryDisplay;
