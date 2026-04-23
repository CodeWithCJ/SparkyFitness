import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EXERCISE_CATEGORY_META } from '@/constants/exercises';
import { usePreferences } from '@/contexts/PreferencesContext';
import { Exercise } from '@/types/exercises';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import {
  Share2,
  Users,
  Volume2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ElementType, useState } from 'react';

type ExerciseCategory = keyof typeof EXERCISE_CATEGORY_META;

interface ExerciseListItemProps {
  exercise: Exercise;
  onAction: (exercise: Exercise) => void | Promise<void>;
  actionText: string;
  actionIcon?: ElementType;
}

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

export const ExerciseSearchListItem = ({
  exercise,
  onAction,
  actionText,
  actionIcon: ActionIcon,
}: ExerciseListItemProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isActioning, setIsActioning] = useState(false);
  const { energyUnit, convertEnergy } = usePreferences();
  const [imageError, setImageError] = useState(false);
  const handleNextImage = () =>
    setCurrentImageIndex((prev) => (prev + 1) % (exercise.images?.length || 1));
  const handlePrevImage = () =>
    setCurrentImageIndex(
      (prev) =>
        (prev - 1 + (exercise.images?.length || 1)) %
        (exercise.images?.length || 1)
    );

  const handleSpeak = () => {
    if (window.speechSynthesis?.speak) {
      const text = Array.isArray(exercise.instructions)
        ? exercise.instructions.join('. ')
        : (exercise.instructions ?? '');
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  };

  const handleAction = async () => {
    setIsActioning(true);
    try {
      await onAction(exercise);
    } finally {
      setIsActioning(false);
    }
  };

  const meta =
    EXERCISE_CATEGORY_META[exercise.category as ExerciseCategory] ??
    EXERCISE_CATEGORY_META['general'];
  const CategoryIcon = meta.icon;

  const sourceBadge = exercise.source ? SOURCE_BADGES[exercise.source] : null;

  const metaPills: string[] = [];
  if (exercise.level) metaPills.push(exercise.level);
  if (exercise.force) metaPills.push(exercise.force);
  if (exercise.mechanic) metaPills.push(exercise.mechanic);

  const hasImage =
    exercise.images && exercise.images.some((img) => img.trim() !== '[]');
  const showFallback = !hasImage || imageError;

  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-150">
      {/* Category icon or image thumbnail */}
      {hasImage && !showFallback ? (
        <div className="relative flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden ring-1 ring-gray-200 dark:ring-gray-700 bg-gray-50 dark:bg-gray-800">
          <img
            src={
              exercise.source
                ? exercise.images![currentImageIndex]
                : '/uploads/exercises/' + exercise.images![currentImageIndex]
            }
            alt={exercise.name}
            className="w-full h-full object-contain"
            onError={() => setImageError(true)}
          />
          {exercise.images!.length > 1 && (
            <div className="absolute inset-x-0 bottom-0 flex justify-between px-0.5">
              <button
                onClick={handlePrevImage}
                className="text-white bg-black/40 hover:bg-black/60 rounded p-0.5 transition-colors"
              >
                <ChevronLeft className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={handleNextImage}
                className="text-white bg-black/40 hover:bg-black/60 rounded p-0.5 transition-colors"
              >
                <ChevronRight className="w-2.5 h-2.5" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${meta.bg}`}
        >
          <CategoryIcon className={`w-4 h-4 ${meta.color}`} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Name + badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-tight">
            {exercise.name}
          </span>
          {sourceBadge && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sourceBadge.className}`}
            >
              {sourceBadge.label}
            </span>
          )}
          {exercise.tags?.map((tag: string) => (
            <Badge
              key={tag}
              variant="outline"
              className="text-[10px] px-1.5 py-0 h-4 gap-0.5"
            >
              {tag === 'public' && <Share2 className="h-2.5 w-2.5" />}
              {tag === 'family' && <Users className="h-2.5 w-2.5" />}
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </Badge>
          ))}
        </div>

        {/* Category + calories row */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400 mb-1">
          {exercise.category && (
            <span className="capitalize">{exercise.category}</span>
          )}
          {exercise.calories_per_hour ? (
            <>
              <span className="text-gray-300 dark:text-gray-600">·</span>
              <span className="text-orange-500 dark:text-orange-400 font-medium">
                {Math.round(
                  convertEnergy(exercise.calories_per_hour, 'kcal', energyUnit)
                )}{' '}
                {getEnergyUnitString(energyUnit)}/hr
              </span>
            </>
          ) : null}
        </div>

        {/* Meta pills */}
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

        {/* Muscles + equipment */}
        {exercise.primary_muscles && exercise.primary_muscles.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              Primary:{' '}
            </span>
            {exercise.primary_muscles.join(', ')}
          </div>
        )}
        {exercise.secondary_muscles &&
          exercise.secondary_muscles.length > 0 && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              <span className="font-medium text-gray-500 dark:text-gray-400">
                Secondary:{' '}
              </span>
              {exercise.secondary_muscles.join(', ')}
            </div>
          )}
        {exercise.equipment && exercise.equipment.length > 0 && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
            <span className="font-medium text-gray-500 dark:text-gray-400">
              Equipment:{' '}
            </span>
            {exercise.equipment.join(', ')}
          </div>
        )}

        {/* Description */}
        {exercise.description && (
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-2">
            {exercise.description}
          </div>
        )}

        {/* Instructions (first line + speak) */}
        {exercise.instructions && exercise.instructions.length > 0 && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 line-clamp-1 flex-1">
              {exercise.instructions[0]}
            </span>
            <button
              onClick={handleSpeak}
              className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/50 transition-colors"
              title="Read instructions aloud"
            >
              <Volume2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Action button */}
      <div className="flex-shrink-0 self-center">
        <Button
          onClick={handleAction}
          disabled={isActioning}
          size="sm"
          className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
        >
          {isActioning ? (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          ) : (
            ActionIcon && <ActionIcon className="h-3.5 w-3.5" />
          )}
          {actionText}
        </Button>
      </div>
    </div>
  );
};
