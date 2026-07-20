import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Loader2, Search, Clock, TrendingUp, Filter } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import BodyMapFilter from './BodyMapFilter';

import { Exercise } from '@/types/exercises';
import { ExerciseSearchListItem } from './ExerciseSearchListItem';
import { useExerciseSearchHook } from '@/hooks/Exercises/useExerciseSearchHook';

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

interface ExerciseSearchProps {
  onExerciseSelect: (
    exercise: Exercise,
    sourceMode: 'internal' | 'external'
  ) => void;
  showInternalTab?: boolean;
  selectedDate?: string;
  onLogSuccess?: () => void;
  disableTabs?: boolean;
  initialSearchSource?: 'internal' | 'external';
}

const ExerciseSearch = ({
  onExerciseSelect,
  showInternalTab = true,
  disableTabs = false,
  initialSearchSource,
}: ExerciseSearchProps) => {
  const { t } = useTranslation();
  const {
    exercises,
    recentExercises,
    topExercises,
    loading,
    searchSource,
    providers,
    selectedProviderId,
    equipmentFilter,
    muscleGroupFilter,
    hasSearchedExternal,
    availableMuscleGroups,
    availableEquipment,
    searchTerm,
    selectedProviderType,
    handleSearch,
    handleAddExternalExercise,
    handleEquipmentToggle,
    handleMuscleToggle,
    setSelectedProviderId,
    setSelectedProviderType,
    setHasSearchedExternal,
    setSearchTerm,
  } = useExerciseSearchHook({
    showInternalTab,
    disableTabs,
    initialSearchSource,
  });

  const { user } = useAuth();
  const [ownershipFilter, setOwnershipFilter] = useState<
    'all' | 'mine' | 'family' | 'public'
  >('all');

  const filteredRecentExercises = useMemo(
    () => filterItems(recentExercises, ownershipFilter, user?.id),
    [recentExercises, ownershipFilter, user?.id]
  );
  const filteredTopExercises = useMemo(
    () => filterItems(topExercises, ownershipFilter, user?.id),
    [topExercises, ownershipFilter, user?.id]
  );
  const filteredExercises = useMemo(
    () => filterItems(exercises, ownershipFilter, user?.id),
    [exercises, ownershipFilter, user?.id]
  );

  const triggerSearch = () => {
    handleSearch(searchTerm);
    if (searchSource === 'external') setHasSearchedExternal(true);
  };

  const renderExerciseList = (
    list: Exercise[],
    type: 'internal' | 'external',
    isAdd = false
  ) =>
    list.map((exercise) => (
      <ExerciseSearchListItem
        key={`${type}-${exercise.id}`}
        exercise={exercise}
        actionText={
          isAdd
            ? t('exercise.exerciseSearch.add', 'Add')
            : t('exercise.exerciseSearch.selectButton', 'Select')
        }
        actionIcon={isAdd ? Plus : undefined}
        onAction={async (ex: Exercise) => {
          if (isAdd) {
            const newEx = await handleAddExternalExercise(ex);
            if (newEx) onExerciseSelect(newEx, 'external');
          } else {
            onExerciseSelect(ex, type);
          }
        }}
      />
    ));

  const isSearching = searchTerm.trim().length > 0;
  const showRecent =
    searchSource === 'internal' &&
    !isSearching &&
    !loading &&
    filteredRecentExercises.length > 0;
  const showTop =
    searchSource === 'internal' &&
    !isSearching &&
    !loading &&
    filteredTopExercises.length > 0;
  const showInternalResults =
    searchSource === 'internal' && isSearching && !loading;
  const showExternalResults =
    searchSource === 'external' &&
    hasSearchedExternal &&
    !loading &&
    exercises.length > 0;

  return (
    <div className="space-y-4 pt-2">
      {/* Provider selector (external only) */}
      {searchSource === 'external' && (
        <Select
          value={selectedProviderId ? String(selectedProviderId) : ''}
          onValueChange={(value) => {
            setSelectedProviderId(value);
            setSelectedProviderType(
              providers.find((p) => String(p.id) === value)?.provider_type ||
                null
            );
          }}
        >
          <SelectTrigger className="w-full h-9 text-sm border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <SelectValue placeholder="Select a provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.provider_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            type="text"
            placeholder={t(
              'exercise.exerciseSearch.placeholder',
              'Search exercises…'
            )}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') triggerSearch();
            }}
            className="pl-9 h-10 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 focus-visible:ring-blue-500"
          />
        </div>
        {searchSource === 'internal' && (
          <div className="flex items-center gap-1 shrink-0">
            <Filter className="h-4 w-4 text-gray-500 shrink-0" />
            <Select
              value={ownershipFilter}
              onValueChange={(value: 'all' | 'mine' | 'family' | 'public') =>
                setOwnershipFilter(value)
              }
            >
              <SelectTrigger className="w-32 h-10 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-blue-500">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('exerciseSearch.ownership.all', 'All')}
                </SelectItem>
                <SelectItem value="mine">
                  {t('exerciseSearch.ownership.mine', 'My Exercises')}
                </SelectItem>
                <SelectItem value="family">
                  {t('exerciseSearch.ownership.family', 'Family')}
                </SelectItem>
                <SelectItem value="public">
                  {t('exerciseSearch.ownership.public', 'Public')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <Button
          onClick={triggerSearch}
          disabled={loading}
          className="h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Equipment filter chips */}
      {availableEquipment.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {availableEquipment.map((eq) => (
            <button
              key={eq}
              onClick={() => handleEquipmentToggle(eq)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors capitalize
                ${
                  equipmentFilter.includes(eq)
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600'
                }`}
            >
              {eq}
            </button>
          ))}
        </div>
      )}

      {/* Body map */}
      <BodyMapFilter
        selectedMuscles={muscleGroupFilter}
        onMuscleToggle={handleMuscleToggle}
        availableMuscleGroups={availableMuscleGroups}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t('exercise.exerciseSearch.searching', 'Searching…')}</span>
        </div>
      )}

      {/* Recent exercises */}
      {showRecent && (
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-0.5">
            <Clock className="w-3 h-3" />
            {t('exercise.exerciseSearch.recent', 'Recent')}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
            {renderExerciseList(filteredRecentExercises, 'internal')}
          </div>
        </section>
      )}

      {/* Top exercises */}
      {showTop && (
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 px-0.5">
            <TrendingUp className="w-3 h-3" />
            {t('exercise.exerciseSearch.popular', 'Most Used')}
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
            {renderExerciseList(filteredTopExercises, 'internal')}
          </div>
        </section>
      )}

      {/* Internal search results */}
      {showInternalResults && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {filteredExercises.length > 0 ? (
            renderExerciseList(filteredExercises, 'internal')
          ) : (
            <p className="text-sm text-center text-gray-400 py-6">
              {t('exercise.exerciseSearch.noResults', 'No exercises found.')}
            </p>
          )}
        </div>
      )}

      {/* External search results */}
      {showExternalResults && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
          {renderExerciseList(
            exercises,
            'external',
            selectedProviderType !== 'nutritionix'
          )}
        </div>
      )}
    </div>
  );
};

export default ExerciseSearch;
