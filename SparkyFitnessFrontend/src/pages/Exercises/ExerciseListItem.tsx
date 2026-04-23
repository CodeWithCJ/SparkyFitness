import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Edit, Trash2, Share2, Users, Lock } from 'lucide-react';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { Exercise as ExerciseInterface } from '@/types/exercises';
import {
  EXERCISE_CATEGORY_META,
  ExerciseCategory,
} from '@/constants/exercises';

interface ExerciseListItemProps {
  exercise: ExerciseInterface;
  userId: string | undefined;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (
    value: number,
    from: 'kcal' | 'kJ',
    to: 'kcal' | 'kJ'
  ) => number;
  onEdit: (exercise: ExerciseInterface) => void;
  onDelete: (exercise: ExerciseInterface) => void;
  onToggleShare: (id: string, current: boolean) => void;
}

export default function ExerciseListItem({
  exercise,
  userId,
  energyUnit,
  convertEnergy,
  onEdit,
  onDelete,
  onToggleShare,
}: ExerciseListItemProps) {
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const isOwned = exercise.user_id === userId;

  const imageUrl =
    exercise.images && exercise.images.length > 0
      ? exercise.source
        ? `/uploads/exercises/${exercise.images[0]}`
        : exercise.images[0]
      : null;

  const meta =
    EXERCISE_CATEGORY_META[exercise.category as ExerciseCategory] ??
    EXERCISE_CATEGORY_META['general'];
  const CategoryIcon = meta.icon;

  const metaPills: string[] = [];
  if (exercise.level) metaPills.push(exercise.level);
  if (exercise.force) metaPills.push(exercise.force);
  if (exercise.mechanic) metaPills.push(exercise.mechanic);

  const caloriesPerHour = Math.round(
    convertEnergy(exercise.calories_per_hour ?? 0, 'kcal', energyUnit)
  );

  return (
    <div className="group flex gap-3 p-3 rounded-lg bg-white dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700/60 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-sm transition-all duration-150">
      {imageUrl && !imageError ? (
        <Dialog>
          <DialogTrigger asChild>
            <button className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden cursor-pointer ring-1 ring-gray-200 dark:ring-gray-700 hover:ring-blue-400 transition-all">
              <img
                src={imageUrl}
                alt={exercise.name}
                onError={() => setImageError(true)}
                className="w-full h-full object-cover"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{exercise.name}</DialogTitle>
              <DialogDescription>Exercise image preview</DialogDescription>
            </DialogHeader>
            <img
              src={imageUrl}
              alt={exercise.name}
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

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          <span className="font-semibold text-sm text-gray-800 dark:text-gray-100 leading-tight">
            {exercise.name}
          </span>
          {exercise.tags
            ?.filter(
              (tag) => !(tag === 'private' && exercise.tags?.includes('public'))
            )
            .map((tag) => (
              <span
                key={tag}
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex items-center gap-1"
              >
                {tag === 'public' && <Share2 className="w-2.5 h-2.5" />}
                {tag === 'family' && <Users className="w-2.5 h-2.5" />}
                {tag}
              </span>
            ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {exercise.category}
          </span>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <span className="text-orange-600 dark:text-orange-400 font-medium">
            {caloriesPerHour} {getEnergyUnitString(energyUnit)}/h
          </span>
        </div>

        {metaPills.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mb-1.5">
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

        <div className="space-y-0.5">
          {exercise.primary_muscles && exercise.primary_muscles.length > 0 && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-snug">
              <span className="font-medium text-gray-500 dark:text-gray-400">
                Primary:{' '}
              </span>
              {exercise.primary_muscles.join(', ')}
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
        </div>
      </div>

      <div className="flex-shrink-0 flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150 self-start pt-0.5">
        <ActionButton
          icon={
            exercise.shared_with_public ? (
              <Share2 className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )
          }
          label={
            exercise.shared_with_public
              ? t('exercise.databaseManager.makePrivateTooltip')
              : t('exercise.databaseManager.shareWithPublicTooltip')
          }
          disabled={!isOwned}
          onClick={() =>
            onToggleShare(exercise.id, exercise.shared_with_public ?? false)
          }
          colorClass="hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/50"
        />
        <ActionButton
          icon={<Edit className="w-3.5 h-3.5" />}
          label={t('exercise.databaseManager.editExerciseTooltip')}
          disabled={!isOwned}
          onClick={() => onEdit(exercise)}
          colorClass="hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
        />
        <ActionButton
          icon={<Trash2 className="w-3.5 h-3.5" />}
          label={t('exercise.databaseManager.deleteExerciseTooltip')}
          disabled={!isOwned}
          onClick={() => onDelete(exercise)}
          colorClass="hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50"
        />
      </div>
    </div>
  );
}

const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  colorClass: string;
  disabled?: boolean;
}> = ({ icon, label, onClick, colorClass, disabled }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
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
