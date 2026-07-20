import type React from 'react';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Search, Layers, ChevronRight, Loader2, Filter } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { WorkoutPreset } from '@/types/workout';
import {
  useWorkoutPresets,
  useSearchWorkoutPresets,
} from '@/hooks/Exercises/useWorkoutPresets';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';

interface OwnershipFields {
  user_id?: string | null;
  userId?: string | null;
  is_public?: boolean | null;
  shared_with_public?: boolean | null;
  sharedWithPublic?: boolean | null;
}

const filterItems = <T,>(
  items: T[],
  filter: 'all' | 'mine' | 'family' | 'public',
  currentUserId?: string
): T[] => {
  if (filter === 'all') return items;
  return items.filter((item) => {
    const raw = item as unknown as OwnershipFields;
    const isOwner = !!(
      (raw.user_id && raw.user_id === currentUserId) ||
      (raw.userId && raw.userId === currentUserId)
    );
    const isPublic = !!(
      raw.is_public ||
      raw.shared_with_public ||
      raw.sharedWithPublic
    );

    if (filter === 'mine') {
      return isOwner;
    }
    if (filter === 'family') {
      return (
        !isOwner && !isPublic && (raw.user_id != null || raw.userId != null)
      );
    }
    if (filter === 'public') {
      return isPublic;
    }
    return true;
  });
};

interface WorkoutPresetSelectorProps {
  onPresetSelected: (preset: WorkoutPreset) => void;
}

const WorkoutPresetSelector: React.FC<WorkoutPresetSelectorProps> = ({
  onPresetSelected,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { user } = useAuth();

  const { data: presetData } = useWorkoutPresets(user?.id);
  const {
    data: searchResults,
    isLoading: isSearchLoading,
    isFetching: isSearchFetching,
  } = useSearchWorkoutPresets(debouncedSearchTerm, user?.id);

  const allPresets = useMemo(
    () => presetData?.pages.flatMap((page) => page.presets) ?? [],
    [presetData]
  );

  const [ownershipFilter, setOwnershipFilter] = useState<
    'all' | 'mine' | 'family' | 'public'
  >('all');

  const filteredAllPresets = useMemo(
    () => filterItems(allPresets, ownershipFilter, user?.id),
    [allPresets, ownershipFilter, user?.id]
  );

  const filteredPresets = useMemo(() => {
    if (!debouncedSearchTerm) return [];
    return searchResults ?? [];
  }, [searchResults, debouncedSearchTerm]);

  const filteredSearchPresets = useMemo(
    () => filterItems(filteredPresets, ownershipFilter, user?.id),
    [filteredPresets, ownershipFilter, user?.id]
  );

  const filteredRecentPresets = useMemo(
    () => (searchTerm === '' ? filteredAllPresets.slice(0, 3) : []),
    [filteredAllPresets, searchTerm]
  );
  const filteredTopPresets = useMemo(
    () => (searchTerm === '' ? filteredAllPresets.slice(3, 6) : []),
    [filteredAllPresets, searchTerm]
  );

  const showLoader = searchTerm !== '' && (isSearchLoading || isSearchFetching);

  return (
    <div className="flex flex-col h-full py-4 space-y-6">
      <div className="flex gap-2 items-center px-1">
        <div className="relative flex-1">
          {showLoader ? (
            <Loader2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
          ) : (
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          )}
          <Input
            placeholder={t(
              'exercise.workoutPresetSelector.searchPlaceholder',
              'Search your workout presets...'
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-11 bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 focus:ring-blue-500 rounded-xl h-11"
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Filter className="h-4 w-4 text-gray-500 shrink-0" />
          <Select
            value={ownershipFilter}
            onValueChange={(value: 'all' | 'mine' | 'family' | 'public') =>
              setOwnershipFilter(value)
            }
          >
            <SelectTrigger className="w-32 h-11 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 rounded-xl focus:ring-blue-500">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('exercise.workoutPresetSelector.ownership.all', 'All')}
              </SelectItem>
              <SelectItem value="mine">
                {t(
                  'exercise.workoutPresetSelector.ownership.mine',
                  'My Presets'
                )}
              </SelectItem>
              <SelectItem value="family">
                {t('exercise.workoutPresetSelector.ownership.family', 'Family')}
              </SelectItem>
              <SelectItem value="public">
                {t('exercise.workoutPresetSelector.ownership.public', 'Public')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-grow overflow-y-auto px-1 space-y-8 custom-scrollbar">
        {searchTerm === '' ? (
          <>
            <PresetSection
              title={t(
                'exercise.workoutPresetSelector.recentPresetsTitle',
                'Recent Presets'
              )}
              presets={filteredRecentPresets}
              onSelect={onPresetSelected}
              emptyMessage={t(
                'exercise.workoutPresetSelector.noRecentPresets',
                'No recent presets.'
              )}
            />
            <PresetSection
              title={t(
                'exercise.workoutPresetSelector.topPresetsTitle',
                'Top Presets'
              )}
              presets={filteredTopPresets}
              onSelect={onPresetSelected}
              emptyMessage={t(
                'exercise.workoutPresetSelector.noTopPresets',
                'No top presets.'
              )}
            />
          </>
        ) : showLoader && filteredSearchPresets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('exercise.workoutPresetSelector.searching', 'Searching...')}
            </p>
          </div>
        ) : (
          <PresetSection
            title={t(
              'exercise.workoutPresetSelector.searchResultsTitle',
              'Search Results'
            )}
            presets={filteredSearchPresets}
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
  const exerciseCount = preset.exercises?.length ?? 0;

  return (
    <Card
      onClick={onClick}
      className="group overflow-hidden border-0 shadow-sm bg-white dark:bg-gray-900 rounded-xl cursor-pointer hover:shadow-md hover:ring-1 hover:ring-blue-500/30 transition-all duration-200"
    >
      <div className="flex">
        <div className="w-1 flex-shrink-0 bg-gradient-to-b from-blue-500 to-indigo-600" />

        <div className="flex-1 flex items-center justify-between p-4 gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-gray-900 dark:text-gray-50 text-sm leading-tight truncate">
                {preset.name}
              </span>
              {exerciseCount > 0 && (
                <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800">
                  {exerciseCount}{' '}
                  {exerciseCount === 1 ? 'Exercise' : 'Exercises'}
                </span>
              )}
            </div>

            {preset.description && (
              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                {preset.description}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end text-right">
              <div className="flex items-center gap-1 text-gray-300 dark:text-gray-700">
                <Layers className="w-3 h-3" />
                <span className="text-[10px] font-medium uppercase tracking-wider">
                  Preset
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
          </div>
        </div>
      </div>
    </Card>
  );
};

export default WorkoutPresetSelector;
