import type React from 'react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, Layers, ChevronRight } from 'lucide-react';
import type { WorkoutPreset } from '@/types/workout';
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

  const filteredPresets = useMemo(
    () =>
      allPresets.filter((preset) =>
        preset.name.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [allPresets, searchTerm]
  );

  const recentPresets = searchTerm === '' ? allPresets.slice(0, 3) : [];
  const topPresets = searchTerm === '' ? allPresets.slice(3, 6) : [];

  return (
    <div className="flex h-full flex-col space-y-6 py-4">
      <div className="relative px-1">
        <Search
          className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden="true"
        />
        <Input
          aria-label={t(
            'exercise.workoutPresetSelector.searchLabel',
            'Search workout templates'
          )}
          placeholder={t(
            'exercise.workoutPresetSelector.searchPlaceholder',
            'Search your workout presets...'
          )}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-11 rounded-xl border-gray-200 bg-gray-50 ps-11 focus:ring-blue-500 dark:border-gray-800 dark:bg-gray-900"
        />
      </div>

      <div className="flex-grow overflow-y-auto px-1 space-y-8 custom-scrollbar">
        {searchTerm === '' ? (
          <>
            <PresetSection
              title={t(
                'exercise.workoutPresetSelector.recentPresetsTitle',
                'Recent Presets'
              )}
              presets={recentPresets}
              onSelect={onPresetSelected}
              emptyMessage={t(
                'exercise.workoutPresetSelector.noRecentPresets',
                'No recent presets.'
              )}
            />
            {topPresets.length > 0 && (
              <PresetSection
                title={t(
                  'exercise.workoutPresetSelector.topPresetsTitle',
                  'More templates'
                )}
                presets={topPresets}
                onSelect={onPresetSelected}
                emptyMessage=""
              />
            )}
          </>
        ) : (
          <PresetSection
            title={t(
              'exercise.workoutPresetSelector.searchResultsTitle',
              'Search Results'
            )}
            presets={filteredPresets}
            onSelect={onPresetSelected}
            emptyMessage={t(
              'exercise.workoutPresetSelector.noMatchingPresets',
              'No presets found matching your search.'
            )}
          />
        )}
      </div>
    </div>
  );
};

const PresetSection: React.FC<{
  title: string;
  presets: WorkoutPreset[];
  onSelect: (preset: WorkoutPreset) => void;
  emptyMessage: string;
}> = ({ title, presets, onSelect, emptyMessage }) => (
  <div className="space-y-3">
    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500 px-1">
      {title}
    </h3>
    <div className="grid gap-3">
      {presets.length > 0 ? (
        presets.map((preset) => (
          <PresetSelectionCard
            key={preset.id}
            preset={preset}
            onClick={() => onSelect(preset)}
          />
        ))
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500 italic py-2 px-1">
          {emptyMessage}
        </p>
      )}
    </div>
  </div>
);

const PresetSelectionCard: React.FC<{
  preset: WorkoutPreset;
  onClick: () => void;
}> = ({ preset, onClick }) => {
  const { t } = useTranslation();
  const exerciseCount = preset.exercises?.length ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(
        'exercise.workoutPresetSelector.selectTemplate',
        'Select {{templateName}}',
        { templateName: preset.name }
      )}
      className="group w-full rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
    >
      <Card className="overflow-hidden rounded-xl border-0 bg-white shadow-sm transition-all duration-200 group-hover:shadow-md group-hover:ring-1 group-hover:ring-blue-500/30 dark:bg-gray-900">
        <div className="flex">
          <div className="w-1 flex-shrink-0 bg-gradient-to-b from-blue-500 to-indigo-600" />

          <div className="flex flex-1 items-center justify-between gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="truncate text-sm font-semibold leading-tight text-gray-900 dark:text-gray-50">
                  {preset.name}
                </span>
                {exerciseCount > 0 && (
                  <span className="flex-shrink-0 rounded-full border border-blue-100 bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-600 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                    {t(
                      'exercise.workoutPresetSelector.exerciseCount',
                      '{{count}} exercise',
                      { count: exerciseCount }
                    )}
                  </span>
                )}
              </div>

              {preset.description && (
                <p className="line-clamp-1 text-xs text-gray-500 dark:text-gray-400">
                  {preset.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden flex-col items-end text-end sm:flex">
                <div className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                  <Layers className="h-3 w-3" aria-hidden="true" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">
                    {t(
                      'exercise.workoutPresetSelector.templateBadge',
                      'Workout template'
                    )}
                  </span>
                </div>
              </div>
              <ChevronRight
                className="h-4 w-4 text-gray-300 transition-colors group-hover:text-blue-500 rtl:rotate-180"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </Card>
    </button>
  );
};

export default WorkoutPresetSelector;
