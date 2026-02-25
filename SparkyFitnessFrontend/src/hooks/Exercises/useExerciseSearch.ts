import {
  searchExercises,
  searchExternalExercises,
  getRecentExercises,
  getTopExercises,
  addExternalExerciseToUserExercises,
  addNutritionixExercise,
  addFreeExerciseDBExercise,
  Exercise,
  getAvailableEquipment,
  getAvailableMuscleGroups,
  getAvailableExercises,
} from '@/api/Exercises/exerciseSearchService';
import { exerciseKeys, exerciseSearchKeys } from '@/api/keys/exercises';
import i18n from '@/i18n';
import {
  getExternalDataProviders,
  getProviderCategory,
} from '@/api/Settings/externalProviderService';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const internalSearchOptions = (
  query: string,
  equipment: string[],
  muscles: string[]
) => ({
  queryKey: exerciseSearchKeys.search.internal(query, equipment, muscles),
  queryFn: () => searchExercises(query, equipment, muscles),
  enabled:
    query.trim().length > 0 || equipment.length > 0 || muscles.length > 0,
  staleTime: 1000 * 60 * 5,
});

export const externalSearchOptions = (
  query: string,
  pId: string | null,
  pType: string | null,
  eq: string[],
  mus: string[],
  limit?: number
) => ({
  queryKey: exerciseSearchKeys.search.external(
    query,
    pId || '',
    pType || '',
    eq,
    mus,
    limit
  ),
  queryFn: () => searchExternalExercises(query, pId!, pType!, eq, mus, limit),
  enabled:
    !!pId &&
    !!pType &&
    (query.trim().length > 0 || eq.length > 0 || mus.length > 0),
  staleTime: 1000 * 60 * 10,
});

export const recentExercisesOptions = (userId: string, limit: number = 5) => ({
  queryKey: exerciseSearchKeys.suggestions.recent(userId, limit),
  queryFn: () => getRecentExercises(userId, limit),
  enabled: !!userId,
  meta: {
    errorMessage: i18n.t(
      'exercise.suggestions.recentLoadError',
      'Failed to load recent exercises.'
    ),
  },
});

export const topExercisesOptions = (userId: string, limit: number = 5) => ({
  queryKey: exerciseSearchKeys.suggestions.top(userId, limit),
  queryFn: () => getTopExercises(userId, limit),
  enabled: !!userId,
  meta: {
    errorMessage: i18n.t(
      'exercise.suggestions.topLoadError',
      'Failed to load top exercises.'
    ),
  },
});

// Verfügbare Provider
export const exerciseProvidersOptions = () => ({
  queryKey: exerciseSearchKeys.providers,
  queryFn: async () => {
    const fetched = await getExternalDataProviders();
    return fetched.filter(
      (p) => getProviderCategory(p).includes('exercise') && p.is_active
    );
  },
});

export const useAddExerciseMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      exercise,
      type,
    }: {
      exercise: Exercise;
      type: string;
    }) => {
      if (type === 'wger')
        return addExternalExerciseToUserExercises(exercise.id);
      if (type === 'nutritionix') return addNutritionixExercise(exercise);
      if (type === 'free-exercise-db')
        return addFreeExerciseDBExercise(exercise.id);
      throw new Error('Unknown provider type');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: exerciseSearchKeys.search.all,
      });
      queryClient.invalidateQueries({ queryKey: exerciseKeys.all });
    },
  });
};

export const useAvailableEquipment = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: exerciseSearchKeys.filters.equipment(),
    queryFn: getAvailableEquipment,
    meta: {
      errorMessage: t(
        'exerciseSearch.failedToLoadEquipment',
        'Failed to load equipment.'
      ),
    },
  });
};

export const useAvailableMuscleGroups = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: exerciseSearchKeys.filters.muscles(),
    queryFn: getAvailableMuscleGroups,
    meta: {
      errorMessage: t(
        'exerciseSearch.failedToLoadMuscles',
        'Failed to load muscle groups.'
      ),
    },
  });
};

export const useAvailableExercises = (
  muscle?: string | null,
  equipment?: string | null
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: exerciseSearchKeys.search.internal(
      '',
      equipment ? [equipment] : [],
      muscle ? [muscle] : []
    ),
    queryFn: () => getAvailableExercises(muscle, equipment),
    meta: {
      errorMessage: t(
        'exerciseSearch.failedToLoadExercises',
        'Failed to load exercises.'
      ),
    },
  });
};
