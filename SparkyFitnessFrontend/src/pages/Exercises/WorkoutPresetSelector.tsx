import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import type { WorkoutPreset } from '@/types/workout';
import { Card, CardContent } from '@/components/ui/card';
import { useWorkoutPresets } from '@/hooks/Exercises/useWorkoutPresets';
import { useAuth } from '@/hooks/useAuth';

interface WorkoutPresetSelectorProps {
  onPresetSelected: (preset: WorkoutPreset) => void;
}

const WorkoutPresetSelector: React.FC<WorkoutPresetSelectorProps> = ({
  onPresetSelected,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const { user } = useAuth();

  const { data: presetData } = useWorkoutPresets(user?.id);

  const allPresets = useMemo(
    () => presetData?.pages.flatMap((page) => page.presets) ?? [],
    [presetData]
  );
  const recentPresets = allPresets.slice(0, 3);
  const topPresets = allPresets.slice(3, 6);

  const filteredPresets = allPresets.filter((preset) =>
    preset.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handlePresetClick = (preset: WorkoutPreset) => {
    onPresetSelected(preset);
  };

  return (
    <div className="flex-grow overflow-y-auto py-4">
      <Input
        placeholder={t(
          'exercise.workoutPresetSelector.searchPlaceholder',
          'Search your workout presets...'
        )}
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="mb-4"
      />

      {searchTerm === '' ? (
        <>
          <h3 className="text-lg font-semibold mb-2">
            {t(
              'exercise.workoutPresetSelector.recentPresetsTitle',
              'Recent Presets'
            )}
          </h3>
          <div className="space-y-2 mb-4">
            {recentPresets.length > 0 ? (
              recentPresets.map((preset) => (
                <Card
                  key={preset.id}
                  className="cursor-pointer"
                  onClick={() => handlePresetClick(preset)}
                >
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {preset.description}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">
                {t(
                  'exercise.workoutPresetSelector.noRecentPresets',
                  'No recent presets.'
                )}
              </p>
            )}
          </div>

          <h3 className="text-lg font-semibold mb-2">
            {t('exercise.workoutPresetSelector.topPresetsTitle', 'Top Presets')}
          </h3>
          <div className="space-y-2">
            {topPresets.length > 0 ? (
              topPresets.map((preset) => (
                <Card
                  key={preset.id}
                  className="cursor-pointer"
                  onClick={() => handlePresetClick(preset)}
                >
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {preset.description}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">
                {t(
                  'exercise.workoutPresetSelector.noTopPresets',
                  'No top presets.'
                )}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold mb-2">
            {t(
              'exercise.workoutPresetSelector.searchResultsTitle',
              'Search Results'
            )}
          </h3>
          <div className="space-y-2">
            {filteredPresets.length > 0 ? (
              filteredPresets.map((preset) => (
                <Card
                  key={preset.id}
                  className="cursor-pointer"
                  onClick={() => handlePresetClick(preset)}
                >
                  <CardContent className="p-4">
                    <p className="font-medium">{preset.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {preset.description}
                    </p>
                  </CardContent>
                </Card>
              ))
            ) : (
              <p className="text-muted-foreground">
                {t(
                  'exercise.workoutPresetSelector.noMatchingPresets',
                  'No presets found matching your search.'
                )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WorkoutPresetSelector;
