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
import { formatLocalizedMinutes } from '@/utils/timeFormatters';
import { ExerciseEntry, Exercise } from '@/types/exercises';
import {
  EXERCISE_CATEGORY_META,
  ExerciseCategory,
} from '@/constants/exercises';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

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
const SOURCE_BADGES: Record<string, { labelKey: string; className: string }> = {
  wger: {
    labelKey: 'exerciseCard.wgerSource',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  'free-exercise-db': {
    labelKey: 'exerciseCard.freeExerciseDBSource',
    className:
      'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  },
  nutritionix: {
    labelKey: 'exerciseCard.nutritionixSource',
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
}) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  const snapshot = exerciseEntry.exercise_snapshot;

  const [imageError, setImageError] = useState(false);
  const sourceBadge = snapshot?.source
    ? SOURCE_BADGES[snapshot.source]
    : snapshot?.is_custom
      ? {
          labelKey: 'exerciseCard.customSource',
          className:
            'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
        }
      : null;

  const isActiveCalories = snapshot?.name === 'Active Calories';
  const displayName = isActiveCalories
    ? t('exerciseCard.activeCalories')
    : snapshot?.name || t('exerciseCard.unknownExercise');

  const durationDisplay = formatLocalizedMinutes(
    exerciseEntry.sets && exerciseEntry.sets.length > 0
      ? exerciseEntry.sets.reduce(
          (sum, set) => sum + (set.duration || 0) + (set.rest_time || 0) / 60,
          0
        )
      : exerciseEntry.duration_minutes || 0,
    t
  );

  const caloriesDisplay = `${Math.round(
    convertEnergy(exerciseEntry.calories_burned || 0, 'kcal', energyUnit)
  )} ${getLocalizedUnitLabel(energyUnit, t)}`;

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
  const localizedMetadata: Readonly<Record<string, string>> = {
    beginner: t('exerciseCard.levelBeginner'),
    intermediate: t('exerciseCard.levelIntermediate'),
    expert: t('exerciseCard.levelExpert'),
    pull: t('exerciseCard.forcePull'),
    push: t('exerciseCard.forcePush'),
    static: t('exerciseCard.forceStatic'),
    isolation: t('exerciseCard.mechanicIsolation'),
    compound: t('exerciseCard.mechanicCompound'),
  };
  const getLocalizedMetadata = (value: string) =>
    localizedMetadata[value.trim().toLowerCase()] ?? value;
  const getLocalizedWeight = (weight: number) =>
    formatWeight(weight, weightUnit)
      .replace(/\bkg$/, getLocalizedUnitLabel('kg', t))
      .replace(/\blbs$/, getLocalizedUnitLabel('lbs', t));

  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-150">
      {/* Optional thumbnail */}
      {imageUrl && !imageError ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden cursor-pointer ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-blue-400 transition-all"
              aria-label={t('exerciseCard.openExerciseImage', {
                name: displayName,
              })}
            >
              <img
                src={imageUrl}
                alt={t('exerciseCard.exerciseImageAlt', {
                  name: displayName,
                })}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{displayName}</DialogTitle>
              <DialogDescription>
                {t('exerciseCard.previewExerciseImage')}
              </DialogDescription>
            </DialogHeader>
            <img
              src={imageUrl}
              alt={t('exerciseCard.exerciseImageAlt', {
                name: displayName,
              })}
              onError={() => setImageError(true)}
              className="w-full h-auto object-contain"
            />
          </DialogContent>
        </Dialog>
      ) : (
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${meta.bg}`}
        >
          <CategoryIcon
            className={`w-4 h-4 ${meta.color}`}
            aria-hidden="true"
          />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Name row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-tight">
            {displayName}
          </span>
          {sourceBadge && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.className}`}
            >
              {t(sourceBadge.labelKey)}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400 mb-1">
          {isActiveCalories ? (
            <span className="font-medium text-orange-600 dark:text-orange-400">
              {t('exerciseCard.activeCaloriesSummary', {
                calories: caloriesDisplay,
              })}
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
                  <span>
                    {t('exerciseCard.setsCount', {
                      count: exerciseEntry.sets!.length,
                    })}
                  </span>
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
              if (Number.isFinite(set.reps))
                parts.push(
                  t('exerciseCard.repsCount', {
                    count: set.reps,
                  })
                );
              if (set.weight && Number.isFinite(set.weight))
                parts.push(getLocalizedWeight(set.weight));
              if (Number.isFinite(set.rpe))
                parts.push(
                  t('exerciseCard.effortRating', {
                    value: set.rpe,
                  })
                );
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
                {getLocalizedMetadata(pill)}
              </span>
            ))}
          </div>
        )}

        {/* Muscles */}
        {snapshot?.primary_muscles && snapshot.primary_muscles.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              {t('exerciseCard.primaryMusclesLabel')}:{' '}
            </span>
            {snapshot.primary_muscles.join(', ')}
          </div>
        )}
        {snapshot?.secondary_muscles &&
          snapshot.secondary_muscles.length > 0 && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              <span className="font-medium text-gray-500 dark:text-gray-400">
                {t('exerciseCard.secondaryMusclesLabel')}:{' '}
              </span>
              {snapshot.secondary_muscles.join(', ')}
            </div>
          )}
        {snapshot?.equipment && snapshot.equipment.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              {t('exerciseCard.equipmentLabel')}:{' '}
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
      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity duration-150 self-start pt-0.5">
        {snapshot?.instructions && snapshot.instructions.length > 0 && (
          <ActionButton
            icon={<Play className="w-3.5 h-3.5" />}
            label={t('exerciseCard.playInstructions')}
            onClick={() => {
              setExerciseToPlay({
                ...snapshot!,
              });
              setIsPlaybackModalOpen(true);
            }}
            colorClass="hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
          />
        )}
        <ActionButton
          icon={<Edit className="w-3.5 h-3.5" />}
          label={t('exerciseCard.editEntry')}
          onClick={() => handleEdit(exerciseEntry)}
          colorClass="hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
        />
        {snapshot?.user_id === currentUserId && (
          <ActionButton
            icon={<Settings className="w-3.5 h-3.5" />}
            label={t('exerciseCard.editExerciseInDatabase')}
            onClick={() =>
              handleEditExerciseDatabase(exerciseEntry.exercise_id)
            }
            colorClass="hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
          />
        )}
        <ActionButton
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label={t('exerciseCard.deleteEntry')}
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
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={`h-7 w-7 text-gray-400 transition-colors ${colorClass}`}
          aria-label={label}
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
