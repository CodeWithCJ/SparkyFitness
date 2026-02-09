import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { debug } from "@/utils/logging";
import { GroupedExerciseEntry, ExerciseEntry } from "@/services/exerciseEntryService";
import { Exercise } from "@/services/exerciseService";
import ExerciseEntryDisplay from "./ExerciseEntryDisplay";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { formatMinutesToHHMM } from "@/utils/timeFormatters"; // Import the new utility function

interface ExercisePresetEntryDisplayProps {
  presetEntry: GroupedExerciseEntry;
  currentUserId: string | undefined;
  handleDelete: (presetEntryId: string) => void; // This is for deleting the preset itself
  handleDeleteExerciseEntry: (entryId: string) => void; // New prop for deleting individual exercise entries
  handleEdit: (entry: ExerciseEntry) => void;
  handleEditExerciseDatabase: (exerciseId: string) => void;
  setExerciseToPlay: (exercise: Exercise | null) => void;
  setIsPlaybackModalOpen: (isOpen: boolean) => void;
  energyUnit: 'kcal' | 'kJ';
  convertEnergy: (value: number, fromUnit: 'kcal' | 'kJ', toUnit: 'kcal' | 'kJ') => number;
  getEnergyUnitString: (unit: 'kcal' | 'kJ') => string;
}

const ExercisePresetEntryDisplay: React.FC<ExercisePresetEntryDisplayProps> = ({
  presetEntry,
  currentUserId,
  handleDelete,
  handleDeleteExerciseEntry, // Destructure the new prop
  handleEdit,
  handleEditExerciseDatabase,
  setExerciseToPlay,
  setIsPlaybackModalOpen,
  energyUnit,
  convertEnergy,
  getEnergyUnitString,
}) => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [isExpanded, setIsExpanded] = useState(false); // State to manage expansion

  const toggleExpansion = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  return (
    <Card key={presetEntry.id} className="bg-gray-50 dark:bg-gray-800 border-l-4 border-blue-500">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex flex-col sm:flex-row items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleExpansion}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <div className="flex flex-col">
              <span>{presetEntry.name || t("exerciseCard.workoutPreset", "Workout Preset")}</span>
              {presetEntry.exercise_snapshot?.category && (
                <p className="text-gray-500 text-[0.65rem] uppercase">{presetEntry.exercise_snapshot.category}</p>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-1">
            {presetEntry.exercises && presetEntry.exercises.length > 0 && (
              <>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {presetEntry.exercises.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0)}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.totalSets", "Total Sets")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {formatMinutesToHHMM(presetEntry.exercises.reduce((sum, ex) => sum + (ex.sets ? ex.sets.reduce((setSum, set) => setSum + (set.duration || 0), 0) : 0), 0))}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.minutesUnit", "Min")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {presetEntry.exercises.filter(ex => ex.avg_heart_rate).length > 0
                      ? Math.round(presetEntry.exercises.reduce((sum, ex) => sum + (ex.avg_heart_rate || 0), 0) / presetEntry.exercises.filter(ex => ex.avg_heart_rate).length)
                      : 0}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.avgHrUnit", "Avg HR")}</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-gray-900 dark:text-gray-100 text-sm">
                    {Math.round(convertEnergy(presetEntry.exercises.reduce((sum, ex) => sum + (ex.calories_burned || 0), 0), 'kcal', energyUnit))}
                  </div>
                  <div className="text-xs text-gray-500">{t("common.caloriesUnit", getEnergyUnitString(energyUnit))}</div>
                </div>
              </>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      debug(loggingLevel, "Edit preset entry clicked:", presetEntry.id);
                    }}
                    className="h-8 w-8"
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("exerciseCard.editPresetEntry", "Edit Preset Entry")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(presetEntry.id)}
                    className="h-8 w-8 hover:bg-gray-200 dark:hover:bg-gray-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t("exerciseCard.deletePresetEntry", "Delete Preset Entry")}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardTitle>
        {presetEntry.description && <p className="text-sm text-gray-600 dark:text-gray-400">{presetEntry.description}</p>}
        {presetEntry.notes && <p className="text-sm text-gray-600 dark:text-gray-400">Notes: {presetEntry.notes}</p>}
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-3 pt-2">
          {presetEntry.exercises && presetEntry.exercises.length > 0 ? (
            presetEntry.exercises.map((exerciseEntry) => (
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("exerciseCard.noExercisesInPreset", "No exercises in this preset.")}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
};

export default ExercisePresetEntryDisplay;