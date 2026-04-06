import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import type { Exercise } from '@/types/exercises';
import { DataProvider } from '@/types/settings';
import { useQueryClient } from '@tanstack/react-query';
import { error } from 'console';
import {
  useAddExerciseMutation,
  recentExercisesOptions,
  topExercisesOptions,
  internalSearchOptions,
  externalSearchOptions,
  exerciseProvidersOptions,
} from './useExerciseSearch';
import {
  useFreeExerciseDBMuscleGroups,
  useFreeExerciseDBEquipment,
} from './useFreeExerciseDB';
import { usePreferences } from '@/contexts/PreferencesContext';

interface ExerciseSearchProps {
  showInternalTab?: boolean;
  disableTabs?: boolean;
  initialSearchSource?: 'internal' | 'external';
}
export function useExerciseSearchHook({
  showInternalTab = true,
  disableTabs = false,
  initialSearchSource,
}: ExerciseSearchProps) {
  const { user } = useAuth();

  const { loggingLevel, itemDisplayLimit } = usePreferences();
  const [searchTerm, setSearchTerm] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recentExercises, setRecentExercises] = useState<Exercise[]>([]);
  const [topExercises, setTopExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const searchSource =
    disableTabs && initialSearchSource
      ? initialSearchSource
      : showInternalTab
        ? 'internal'
        : 'external';
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  const [selectedProviderType, setSelectedProviderType] = useState<
    string | null
  >(null);
  const [equipmentFilter, setEquipmentFilter] = useState<string[]>([]);
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<string[]>([]);
  const [hasSearchedExternal, setHasSearchedExternal] = useState(false);

  const queryClient = useQueryClient();
  const { data: availableMuscleGroups = [] } = useFreeExerciseDBMuscleGroups();
  const { data: availableEquipment = [] } = useFreeExerciseDBEquipment();
  const { mutateAsync: addExercise } = useAddExerciseMutation();

  const handleSearch = useCallback(
    async (query: string, isInitialLoad = false) => {
      const hasSearchTerm = query.trim().length > 0;
      const hasFilters =
        equipmentFilter.length > 0 || muscleGroupFilter.length > 0;

      if (
        searchSource === 'external' &&
        !hasSearchTerm &&
        !hasFilters &&
        !isInitialLoad
      ) {
        setExercises([]);
        return;
      }

      if (
        searchSource === 'internal' &&
        !hasSearchTerm &&
        !hasFilters &&
        !isInitialLoad
      ) {
        try {
          const recent = await queryClient.fetchQuery(
            recentExercisesOptions(user?.id || '', itemDisplayLimit)
          );
          const top = await queryClient.fetchQuery(
            topExercisesOptions(user?.id || '', itemDisplayLimit)
          );
          setRecentExercises(recent);
          setTopExercises(top);
          setExercises([]);
        } catch (err) {
          error(loggingLevel, 'Error fetching recent/top exercises:', err);
        }
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        let data: Exercise[] = [];
        if (searchSource === 'internal') {
          setRecentExercises([]);
          setTopExercises([]);
          data = await queryClient.fetchQuery(
            internalSearchOptions(query, equipmentFilter, muscleGroupFilter)
          );
        } else {
          if (!selectedProviderId || !selectedProviderType)
            return setLoading(false);
          data = await queryClient.fetchQuery(
            externalSearchOptions(
              query,
              selectedProviderId,
              selectedProviderType,
              equipmentFilter,
              muscleGroupFilter,
              itemDisplayLimit
            )
          );
        }
        setExercises(data || []);
      } catch (err) {
        error(loggingLevel, 'Error searching exercises:', err);
      } finally {
        setLoading(false);
      }
    },
    [
      queryClient,
      equipmentFilter,
      itemDisplayLimit,
      loggingLevel,
      muscleGroupFilter,
      searchSource,
      selectedProviderId,
      user?.id,
      selectedProviderType,
    ]
  );

  const handleAddExternalExercise = async (
    exercise: Exercise
  ): Promise<Exercise | undefined> => {
    if (!selectedProviderType) return;
    setLoading(true);
    try {
      return await addExercise({ exercise, type: selectedProviderType });
    } catch (err) {
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchSource === 'internal' && user?.id) handleSearch('', true);
  }, [searchSource, user?.id, handleSearch]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchSource === 'internal') {
        const isBroadSearch =
          searchTerm.trim().length === 0 &&
          equipmentFilter.length === 0 &&
          muscleGroupFilter.length === 0;
        isBroadSearch
          ? handleSearch('', true)
          : handleSearch(searchTerm, false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [
    searchTerm,
    equipmentFilter,
    muscleGroupFilter,
    searchSource,
    handleSearch,
  ]);

  const fetchProviders = useCallback(async () => {
    try {
      const exerciseProviders = await queryClient.fetchQuery(
        exerciseProvidersOptions()
      );
      setProviders(exerciseProviders);
      if (exerciseProviders[0]) {
        setSelectedProviderId(exerciseProviders[0].id);
        setSelectedProviderType(exerciseProviders[0].provider_type);
      }
    } catch (err) {}
  }, [queryClient]);

  useEffect(() => {
    if (searchSource === 'external') fetchProviders();
  }, [searchSource, fetchProviders]);

  const handleEquipmentToggle = (equipment: string) =>
    setEquipmentFilter((prev) =>
      prev.includes(equipment)
        ? prev.filter((item) => item !== equipment)
        : [...prev, equipment]
    );
  const handleMuscleToggle = (muscle: string) =>
    setMuscleGroupFilter((prev) =>
      prev.includes(muscle)
        ? prev.filter((item) => item !== muscle)
        : [...prev, muscle]
    );
  return {
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
  };
}
