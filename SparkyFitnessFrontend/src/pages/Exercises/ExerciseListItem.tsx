// pages/Exercises/ExerciseListItem.tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Edit, Trash2, Share2, Users, Lock } from 'lucide-react';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import type { Exercise as ExerciseInterface } from '@/types/exercises';

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
  const isOwned = exercise.user_id === userId;

  return (
    <div className="flex items-center justify-between p-4 border rounded-lg">
      {/* Details */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium">{exercise.name}</h4>
          {exercise.tags?.map((tag) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag === 'public' && <Share2 className="h-3 w-3 mr-1" />}
              {tag === 'family' && <Users className="h-3 w-3 mr-1" />}
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </Badge>
          ))}
        </div>

        <div className="text-sm text-gray-600 mb-1">
          {exercise.category}
          {exercise.level &&
            ` • ${t('exercise.databaseManager.levelDisplay', { level: exercise.level, defaultValue: `Level: ${exercise.level}` })}`}
          {exercise.force &&
            ` • ${t('exercise.databaseManager.forceDisplay', { force: exercise.force, defaultValue: `Force: ${exercise.force}` })}`}
          {exercise.mechanic &&
            ` • ${t('exercise.databaseManager.mechanicDisplay', { mechanic: exercise.mechanic, defaultValue: `Mechanic: ${exercise.mechanic}` })}`}
        </div>

        {Array.isArray(exercise.equipment) && exercise.equipment.length > 0 && (
          <div className="text-xs text-gray-400">
            {t('exercise.databaseManager.equipmentDisplay', {
              equipment: exercise.equipment.join(', '),
              defaultValue: `Equipment: ${exercise.equipment.join(', ')}`,
            })}
          </div>
        )}

        {Array.isArray(exercise.primary_muscles) &&
          exercise.primary_muscles.length > 0 && (
            <div className="text-xs text-gray-400">
              {t('exercise.databaseManager.primaryMusclesDisplay', {
                primaryMuscles: exercise.primary_muscles.join(', '),
                defaultValue: `Primary Muscles: ${exercise.primary_muscles.join(', ')}`,
              })}
            </div>
          )}

        {Array.isArray(exercise.secondary_muscles) &&
          exercise.secondary_muscles.length > 0 && (
            <div className="text-xs text-gray-400">
              {t('exercise.databaseManager.secondaryMusclesDisplay', {
                secondaryMuscles: exercise.secondary_muscles.join(', '),
                defaultValue: `Secondary Muscles: ${exercise.secondary_muscles.join(', ')}`,
              })}
            </div>
          )}

        {Array.isArray(exercise.instructions) &&
          exercise.instructions.length > 0 && (
            <div className="text-xs text-gray-400">
              {t('exercise.databaseManager.instructionsDisplay', {
                instruction: exercise.instructions[0],
                defaultValue: `Instructions: ${exercise.instructions[0]}`,
              })}
              ...
            </div>
          )}

        <div className="text-sm text-gray-500">
          {t('exercise.databaseManager.caloriesPerHourDisplay', {
            caloriesPerHour: Math.round(
              convertEnergy(exercise.calories_per_hour ?? 0, 'kcal', energyUnit)
            ),
            energyUnit: getEnergyUnitString(energyUnit),
            defaultValue: `Calories/Hour: ${Math.round(convertEnergy(exercise.calories_per_hour ?? 0, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`,
          })}
        </div>

        {exercise.description && (
          <div className="text-sm text-gray-400 mt-1">
            {exercise.description}
          </div>
        )}

        {exercise.images && exercise.images.length > 0 && (
          <img
            src={
              exercise.source
                ? `/uploads/exercises/${exercise.images[0]}`
                : exercise.images[0]
            }
            alt={exercise.name}
            className="w-16 h-16 object-contain mt-2"
          />
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!isOwned}
                onClick={() =>
                  onToggleShare(
                    exercise.id,
                    exercise.shared_with_public ?? false
                  )
                }
              >
                {exercise.shared_with_public ? (
                  <Share2 className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isOwned
                  ? exercise.shared_with_public
                    ? t(
                        'exercise.databaseManager.makePrivateTooltip',
                        'Make private'
                      )
                    : t(
                        'exercise.databaseManager.shareWithPublicTooltip',
                        'Share with public'
                      )
                  : t(
                      'exercise.databaseManager.notEditableTooltip',
                      'Not editable'
                    )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={!isOwned}
                onClick={() => onEdit(exercise)}
              >
                <Edit className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isOwned
                  ? t(
                      'exercise.databaseManager.editExerciseTooltip',
                      'Edit exercise'
                    )
                  : t(
                      'exercise.databaseManager.notEditableTooltip',
                      'Not editable'
                    )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
                disabled={!isOwned}
                onClick={() => onDelete(exercise)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isOwned
                  ? t(
                      'exercise.databaseManager.deleteExerciseTooltip',
                      'Delete exercise'
                    )
                  : t(
                      'exercise.databaseManager.notEditableTooltip',
                      'Not editable'
                    )}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
