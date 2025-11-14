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

interface ExercisePresetEntryDisplayProps {
  presetEntry: GroupedExerciseEntry;
  currentUserId: string | undefined;
  handleDelete: (presetEntryId: string) => void; // This is for deleting the preset itself
  handleDeleteExerciseEntry: (entryId: string) => void; // New prop for deleting individual exercise entries
  handleEdit: (entry: ExerciseEntry) => void;
  handleEditExerciseDatabase: (exerciseId: string) => void;
  setExerciseToPlay: (exercise: Exercise | null) => void;
  setIsPlaybackModalOpen: (isOpen: boolean) => void;
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
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleExpansion}>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <span>{presetEntry.name || t("exerciseCard.workoutPreset", "Workout Preset")}</span>
          </div>
          <div className="flex items-center space-x-1">
            {/* Add actions for the preset itself if needed, e.g., edit preset entry details */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      // Handle editing the preset entry (name, description, notes)
                      // This would open a dialog similar to EditExerciseEntryDialog
                      // For now, just log
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
                    onClick={() => handleDelete(presetEntry.id)} // This will delete the preset entry and cascade to exercises
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
                handleDelete={handleDeleteExerciseEntry} // Pass the correct handler for individual entries
                handleEditExerciseDatabase={handleEditExerciseDatabase}
                setExerciseToPlay={setExerciseToPlay}
                setIsPlaybackModalOpen={setIsPlaybackModalOpen}
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