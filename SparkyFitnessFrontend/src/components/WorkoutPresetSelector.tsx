import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WorkoutPreset } from "@/types/workout";
import { getWorkoutPresets } from "@/services/workoutPresetService";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { debug, info, error } from "@/utils/logging";
import { usePreferences } from "@/contexts/PreferencesContext";

interface WorkoutPresetSelectorProps {
  onPresetSelected: (preset: WorkoutPreset) => void;
}

const WorkoutPresetSelector: React.FC<WorkoutPresetSelectorProps> = ({
  onPresetSelected,
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel } = usePreferences();
  const [searchTerm, setSearchTerm] = useState("");
  const [allPresets, setAllPresets] = useState<WorkoutPreset[]>([]);
  const [filteredPresets, setFilteredPresets] = useState<WorkoutPreset[]>([]);
  const [recentPresets, setRecentPresets] = useState<WorkoutPreset[]>([]);
  const [topPresets, setTopPresets] = useState<WorkoutPreset[]>([]);

  const fetchWorkoutPresets = useCallback(async () => {
    if (!user?.id) return;
    debug(loggingLevel, "WorkoutPresetSelector: Fetching workout presets.");
    try {
      const paginatedResult = await getWorkoutPresets(1, 20); // Fetching up to 100 presets for now
      info(loggingLevel, "WorkoutPresetSelector: Fetched presets:", paginatedResult);
      const presets = paginatedResult.presets;
      setAllPresets(presets);
      // For now, just use a simple slice for recent/top.
      // In a real app, this would involve more sophisticated logic
      // based on user history or popularity.
      setRecentPresets(presets.slice(0, 3));
      setTopPresets(presets.slice(3, 6));
    } catch (err) {
      error(loggingLevel, "WorkoutPresetSelector: Failed to load workout presets:", err);
      toast({
        title: t("common.errorOccurred", "Error"),
        description: t("workoutPresetsManager.failedToLoadPresets", "Failed to load workout presets."),
        variant: "destructive",
      });
    }
  }, [user?.id, loggingLevel, toast]);

  useEffect(() => {
    fetchWorkoutPresets();
  }, [fetchWorkoutPresets]);

  useEffect(() => {
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    setFilteredPresets(
      allPresets.filter((preset) =>
        preset.name.toLowerCase().includes(lowerCaseSearchTerm)
      )
    );
  }, [searchTerm, allPresets]);

  const handlePresetClick = (preset: WorkoutPreset) => {
    onPresetSelected(preset);
  };

  return (
    <div className="flex-grow overflow-y-auto py-4">
      <Input
        placeholder={t("exercise.workoutPresetSelector.searchPlaceholder", "Search your workout presets...")}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4"
      />

      {searchTerm === "" ? (
        <>
          <h3 className="text-lg font-semibold mb-2">{t("exercise.workoutPresetSelector.recentPresetsTitle", "Recent Presets")}</h3>
          <div className="space-y-2 mb-4">
            {recentPresets.length > 0 ? (
              recentPresets.map((preset) => (
                <Card key={preset.id} className="cursor-pointer" onClick={() => handlePresetClick(preset)}>
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">{preset.description}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">{t("exercise.workoutPresetSelector.noRecentPresets", "No recent presets.")}</p>
            )}
          </div>

          <h3 className="text-lg font-semibold mb-2">{t("exercise.workoutPresetSelector.topPresetsTitle", "Top Presets")}</h3>
          <div className="space-y-2">
            {topPresets.length > 0 ? (
              topPresets.map((preset) => (
                <Card key={preset.id} className="cursor-pointer" onClick={() => handlePresetClick(preset)}>
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">{preset.description}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">{t("exercise.workoutPresetSelector.noTopPresets", "No top presets.")}</p>
            )}
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold mb-2">{t("exercise.workoutPresetSelector.searchResultsTitle", "Search Results")}</h3>
          <div className="space-y-2">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <Card key={preset.id} className="cursor-pointer" onClick={() => handlePresetClick(preset)}>
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">{preset.description}</p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">{t("exercise.workoutPresetSelector.noMatchingPresets", "No presets found matching your search.")}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WorkoutPresetSelector;