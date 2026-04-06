import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

interface ExerciseListItemProps {
  exercise: Exercise;
  onAction: (exercise: Exercise) => void | Promise<void>;
  actionText: string;
  actionIcon?: ElementType;
  t: (
    key: string,
    defaultText: string,
    options?: Record<string, unknown>
  ) => string;
}

export const ExerciseSearchListItem = ({
  exercise,
  onAction,
  actionText,
  actionIcon: ActionIcon,
}: ExerciseListItemProps) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const { energyUnit, convertEnergy } = usePreferences();
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

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div>
        <div className="font-medium flex items-center gap-2">
          {exercise.name}
          {exercise.tags?.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-xs">
              {tag === 'public' && <Share2 className="h-3 w-3 mr-1" />}
              {tag === 'family' && <Users className="h-3 w-3 mr-1" />}
              {tag.charAt(0).toUpperCase() + tag.slice(1)}
            </Badge>
          ))}
          {exercise.source === 'wger' && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
              Wger
            </span>
          )}
          {exercise.source === 'free-exercise-db' && (
            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
              Free Exercise DB
            </span>
          )}
          {exercise.source === 'nutritionix' && (
            <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
              Nutritionix
            </span>
          )}
        </div>
        <div className="text-sm text-gray-500">
          {exercise.category}
          {exercise.calories_per_hour &&
            ` • ${Math.round(convertEnergy(exercise.calories_per_hour, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`}
          {exercise.level && ` • Level: ${exercise.level}`}
          {exercise.force && ` • Force: ${exercise.force}`}
          {exercise.mechanic && ` • Mechanic: ${exercise.mechanic}`}
        </div>
        {exercise.equipment && exercise.equipment?.length > 0 && (
          <div className="text-xs text-gray-400">
            Equipment: {exercise.equipment.join(', ')}
          </div>
        )}
        {exercise.primary_muscles && exercise.primary_muscles?.length > 0 && (
          <div className="text-xs text-gray-400">
            Primary Muscles: {exercise.primary_muscles.join(', ')}
          </div>
        )}
        {exercise.secondary_muscles &&
          exercise.secondary_muscles?.length > 0 && (
            <div className="text-xs text-gray-400">
              Secondary Muscles: {exercise.secondary_muscles.join(', ')}
            </div>
          )}
        {exercise.instructions && exercise.instructions?.length > 0 && (
          <div className="text-xs text-gray-400 flex items-center">
            Instructions: {exercise.instructions[0]}...
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSpeak}
              className="ml-2"
            >
              <Volume2 className="h-4 w-4" />
            </Button>
          </div>
        )}
        {exercise.description && (
          <div className="text-xs text-gray-400">{exercise.description}</div>
        )}
        {exercise.images && exercise.images?.length > 0 && (
          <div className="relative w-32 h-32 mt-2">
            <img
              src={exercise.images[currentImageIndex]}
              alt={exercise.name}
              className="w-full h-full object-contain"
            />
            {exercise.images.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-0 top-1/2 -translate-y-1/2"
                  onClick={handlePrevImage}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-1/2 -translate-y-1/2"
                  onClick={handleNextImage}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      <Button onClick={() => onAction(exercise)}>
        {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
        {actionText}
      </Button>
    </div>
  );
};
