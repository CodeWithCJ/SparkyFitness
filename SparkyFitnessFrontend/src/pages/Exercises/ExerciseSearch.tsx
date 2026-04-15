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
import { Plus, Loader2, Search } from 'lucide-react';
import BodyMapFilter from './BodyMapFilter';

import { Exercise } from '@/types/exercises';
import { ExerciseSearchListItem } from './ExerciseSearchListItem';
import { useExerciseSearchHook } from '@/hooks/Exercises/useExerciseSearchHook';

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

  return (
    <div className="space-y-4">
      <div className="mt-4 space-y-4">
        {searchSource === 'external' && (
          <Select
            value={selectedProviderId || ''}
            onValueChange={(value) => {
              setSelectedProviderId(value);
              setSelectedProviderType(
                providers.find((p) => p.id === value)?.provider_type || null
              );
            }}
          >
            <SelectTrigger className="w-full mb-2">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.provider_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex space-x-2 items-center">
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(searchTerm);
                if (searchSource === 'external') setHasSearchedExternal(true);
              }
            }}
            className="flex-1"
          />
          <Button
            onClick={() => {
              handleSearch(searchTerm);
              if (searchSource === 'external') setHasSearchedExternal(true);
            }}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {availableEquipment.map((eq) => (
            <Button
              key={eq}
              variant={equipmentFilter.includes(eq) ? 'default' : 'outline'}
              onClick={() => handleEquipmentToggle(eq)}
            >
              {eq}
            </Button>
          ))}
        </div>

        <BodyMapFilter
          selectedMuscles={muscleGroupFilter}
          onMuscleToggle={handleMuscleToggle}
          availableMuscleGroups={availableMuscleGroups}
        />

        {loading && <div>Searching...</div>}

        {searchSource === 'internal' &&
          searchTerm.trim().length === 0 &&
          !loading && (
            <>
              {recentExercises.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2 border-b pb-4 mb-4">
                  {renderExerciseList(recentExercises, 'internal')}
                </div>
              )}
              {topExercises.length > 0 && (
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {renderExerciseList(topExercises, 'internal')}
                </div>
              )}
            </>
          )}

        {searchSource === 'internal' &&
          searchTerm.trim().length > 0 &&
          !loading && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {renderExerciseList(exercises, 'internal')}
            </div>
          )}

        {searchSource === 'external' &&
          hasSearchedExternal &&
          !loading &&
          exercises.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {renderExerciseList(
                exercises,
                'external',
                selectedProviderType !== 'nutritionix'
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default ExerciseSearch;
