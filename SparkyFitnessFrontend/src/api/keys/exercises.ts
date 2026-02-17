import { ExerciseOwnershipFilter } from '../Exercises/exerciseService';

export const exerciseKeys = {
  all: ['exercises'] as const,
  lists: () => [...exerciseKeys.all, 'list'] as const,
  list: (
    searchTerm: string,
    categoryFilter: string,
    ownershipFilter: ExerciseOwnershipFilter,
    page: number,
    limit: number
  ) =>
    [
      ...exerciseKeys.lists(),
      { searchTerm, categoryFilter, ownershipFilter, page, limit },
    ] as const,
  details: () => [...exerciseKeys.all, 'detail'] as const,
  detail: (id: string) => [...exerciseKeys.details(), id] as const,
  impact: (id: string) => [...exerciseKeys.detail(id), 'impact'] as const,
};

export const presetKeys = {
  all: ['workoutPresets'] as const,
  lists: () => [...presetKeys.all, 'list'] as const,
  list: (page: number, limit: number) =>
    [...presetKeys.lists(), { page, limit }] as const,
  details: () => [...presetKeys.all, 'detail'] as const,
  detail: (id: string) => [...presetKeys.details(), id] as const,
  infinite: (userId?: string, limit: number = 10) =>
    [...presetKeys.lists(), 'infinite', { userId, limit }] as const,
};

export const exerciseSearchKeys = {
  all: ['exercises'] as const,
  providers: ['exercises', 'providers'] as const,
  filters: {
    all: ['exercises', 'filters'] as const,
    equipment: () => ['exercises', 'filters', 'equipment'] as const,
    muscles: () => ['exercises', 'filters', 'muscles'] as const,
    wger: () => ['exercises', 'filters', 'wger'] as const,
  },
  search: {
    all: ['exercises', 'search'] as const,
    internal: (query: string, equipment: string[], muscles: string[]) =>
      [
        'exercises',
        'search',
        'internal',
        { query, equipment, muscles },
      ] as const,
    external: (
      query: string,
      providerId: string,
      providerType: string,
      equipment: string[],
      muscles: string[],
      limit?: number
    ) =>
      [
        'exercises',
        'search',
        'external',
        query,
        providerId,
        providerType,
        { equipment, muscles, limit },
      ] as const,
  },
  suggestions: {
    recent: (userId: string, limit: number) =>
      ['exercises', 'recent', userId, { limit }] as const,
    top: (userId: string, limit: number) =>
      ['exercises', 'top', userId, { limit }] as const,
  },
};

export const freeExerciseDBKeys = {
  all: ['freeExerciseDB'] as const,
  muscles: () => [...freeExerciseDBKeys.all, 'muscles'] as const,
  equipment: () => [...freeExerciseDBKeys.all, 'equipment'] as const,
};

export const exerciseEntryKeys = {
  all: ['exerciseEntries'] as const,
  byDate: (date: string) => [...exerciseEntryKeys.all, 'date', date] as const,
  history: (exerciseId: string, limit?: number) =>
    [
      ...exerciseEntryKeys.all,
      'history',
      exerciseId,
      ...(limit ? [{ limit }] : []),
    ] as const,
  progress: (
    exerciseId: string,
    startDate: string,
    endDate: string,
    agg: string
  ) =>
    [
      ...exerciseEntryKeys.all,
      'progress',
      exerciseId,
      { startDate, endDate, agg },
    ] as const,
};
export const suggestedExercisesKeys = {
  all: ['exercises', 'suggested'] as const,
  byLimit: (limit: number) =>
    [...suggestedExercisesKeys.all, { limit }] as const,
};
