import React from "react";
import { useTranslation } from "react-i18next";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Dumbbell, Edit, Trash2, Settings, Play } from "lucide-react";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { ExerciseEntry } from "@/services/exerciseEntryService";
import { Exercise } from "@/services/exerciseService";
import { formatMinutesToHHMM } from "@/utils/timeFormatters"; // Import the new utility function

interface ExerciseEntryDisplayProps {
  exerciseEntry: ExerciseEntry;
  currentUserId: string | undefined;
  handleEdit: (entry: ExerciseEntry) => void;
  handleDelete: (entryId: string) => void;
  handleEditExerciseDatabase: (exerciseId: string) => void;
  setExerciseToPlay: (exercise: Exercise | null) => void;
  setIsPlaybackModalOpen: (isOpen: boolean) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

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
  const { t } = useTranslation();
  const { weightUnit, convertWeight, loggingLevel } = usePreferences(); // Destructure loggingLevel from usePreferences

  return (
    <div
      key={exerciseEntry.id}
      className="flex items-center justify-between p-3 bg-white rounded-md shadow-sm dark:bg-gray-700"
    >
      <div className="flex items-center">
        <Dumbbell className="w-4 h-4 mr-2 text-gray-600 dark:text-gray-300" />
        <div>
          <span className="font-medium flex items-center gap-2 text-gray-800 dark:text-gray-200">
            {exerciseEntry.exercise_snapshot?.name || "Unknown Exercise"}
            {exerciseEntry.exercise_snapshot?.source === 'wger' && (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                Wger
              </span>
            )}
            {exerciseEntry.exercise_snapshot?.source === 'free-exercise-db' && (
              <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                Free Exercise DB
              </span>
            )}
            {exerciseEntry.exercise_snapshot?.source === 'nutritionix' && (
              <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                Nutritionix
              </span>
            )}
            {exerciseEntry.exercise_snapshot?.is_custom && !exerciseEntry.exercise_snapshot?.source && (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800">
                Custom
              </span>
            )}
          </span>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {exerciseEntry.exercise_snapshot?.name === "Active Calories"
              ? `${Math.round(convertEnergy(exerciseEntry.calories_burned || 0, 'kcal', energyUnit))} active ${getEnergyUnitString(energyUnit)}`
              : `${formatMinutesToHHMM(exerciseEntry.sets?.reduce((sum, set) => sum + (set.duration || 0), 0) || 0)} • ${Math.round(convertEnergy(exerciseEntry.calories_burned || 0, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`}
            {exerciseEntry.sets && Array.isArray(exerciseEntry.sets) && exerciseEntry.sets.length > 0 && (
              <>
                {` • Sets: ${String(exerciseEntry.sets.length)}`}
                {exerciseEntry.sets.map((set, index) => (
                  <span key={index}>
                    {set.reps && ` • Reps: ${String(set.reps)}`}
                    {set.weight && ` • Weight: ${convertWeight(set.weight, 'kg', weightUnit).toFixed(1)} ${weightUnit}`}
                  </span>
                ))}
              </>
            )}
            {exerciseEntry.exercise_snapshot?.level && ` • Level: ${exerciseEntry.exercise_snapshot.level}`}
            {exerciseEntry.exercise_snapshot?.force && ` • Force: ${exerciseEntry.exercise_snapshot.force}`}
            {exerciseEntry.exercise_snapshot?.mechanic && ` • Mechanic: ${exerciseEntry.exercise_snapshot.mechanic}`}
          </div>
          {exerciseEntry.exercise_snapshot?.equipment && Array.isArray(exerciseEntry.exercise_snapshot.equipment) && exerciseEntry.exercise_snapshot.equipment.length > 0 && (
            <div className="text-xs text-gray-400 dark:text-gray-500">Equipment: {exerciseEntry.exercise_snapshot.equipment.join(', ')}</div>
          )}
          {exerciseEntry.exercise_snapshot?.primary_muscles && Array.isArray(exerciseEntry.exercise_snapshot.primary_muscles) && exerciseEntry.exercise_snapshot.primary_muscles.length > 0 && (
            <div className="text-xs text-gray-400 dark:text-gray-500">Primary Muscles: {exerciseEntry.exercise_snapshot.primary_muscles.join(', ')}</div>
          )}
          {exerciseEntry.exercise_snapshot?.secondary_muscles && Array.isArray(exerciseEntry.exercise_snapshot.secondary_muscles) && exerciseEntry.exercise_snapshot.secondary_muscles.length > 0 && (
            <div className="text-xs text-gray-400 dark:text-gray-500">Secondary Muscles: {exerciseEntry.exercise_snapshot.secondary_muscles.join(', ')}</div>
          )}
          {exerciseEntry.notes && (
            <div className="text-xs text-gray-400 dark:text-gray-500">{exerciseEntry.notes}</div>
          )}
          {/* Image Display Logic */}
          <div className="mt-2">
            <Dialog>
              <DialogTrigger asChild>
                <img
                  src={exerciseEntry.image_url ? exerciseEntry.image_url : (exerciseEntry.exercise_snapshot?.images && exerciseEntry.exercise_snapshot.images.length > 0 ? (exerciseEntry.exercise_snapshot.source ? `/uploads/exercises/${exerciseEntry.exercise_snapshot.images[0]}` : exerciseEntry.exercise_snapshot.images[0]) : '')}
                  alt={exerciseEntry.exercise_snapshot?.name || 'Exercise'}
                  className="w-16 h-16 object-cover rounded cursor-pointer"
                  style={{ display: (exerciseEntry.image_url || (exerciseEntry.exercise_snapshot?.images && exerciseEntry.exercise_snapshot.images.length > 0)) ? 'block' : 'none' }}
                />
              </DialogTrigger>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle>{exerciseEntry.exercise_snapshot?.name || 'Exercise Image'}</DialogTitle>
                  <DialogDescription>
                    Preview of the exercise image.
                  </DialogDescription>
                </DialogHeader>
                <img
                  src={exerciseEntry.image_url ? exerciseEntry.image_url : (exerciseEntry.exercise_snapshot?.images && exerciseEntry.exercise_snapshot.images.length > 0 ? (exerciseEntry.exercise_snapshot.source ? `/uploads/exercises/${exerciseEntry.exercise_snapshot.images[0]}` : exerciseEntry.exercise_snapshot.images[0]) : '')}
                  alt={exerciseEntry.exercise_snapshot?.name || 'Exercise'}
                  className="w-full h-auto object-contain"
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-1">
        {exerciseEntry.exercise_snapshot?.instructions && exerciseEntry.exercise_snapshot.instructions.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setExerciseToPlay(exerciseEntry.exercise_snapshot);
                    setIsPlaybackModalOpen(true);
                  }}
                  className="h-8 w-8"
                >
                  <Play className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Play Instructions</p>
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
                onClick={() => handleEdit(exerciseEntry)}
                className="h-8 w-8"
              >
                <Edit className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Edit Entry</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        {exerciseEntry.exercise_snapshot?.user_id === currentUserId && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    handleEditExerciseDatabase(exerciseEntry.exercise_id)
                  }
                  className="h-8 w-8"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Edit Exercise in Database</p>
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
                onClick={() => handleDelete(exerciseEntry.id)}
                className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete Entry</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};

export default ExerciseEntryDisplay;