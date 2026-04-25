// hooks/Exercises/useExerciseFilters.ts
import { useState } from 'react';
import type { ExerciseOwnershipFilter } from '@/types/exercises';
import { useIsMobile } from '@/hooks/use-mobile';

export function useExerciseFilters() {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [ownershipFilter, setOwnershipFilter] =
    useState<ExerciseOwnershipFilter>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(isMobile ? 5 : 10);

  const handleSetSearchTerm = (value: React.SetStateAction<string>) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const handleSetCategoryFilter = (value: React.SetStateAction<string>) => {
    setCategoryFilter(value);
    setCurrentPage(1);
  };

  const handleSetOwnershipFilter = (
    value: React.SetStateAction<ExerciseOwnershipFilter>
  ) => {
    setOwnershipFilter(value);
    setCurrentPage(1);
  };

  const handleSetItemsPerPage = (value: React.SetStateAction<number>) => {
    setItemsPerPage(value);
    setCurrentPage(1);
  };

  return {
    searchTerm,
    setSearchTerm: handleSetSearchTerm,
    categoryFilter,
    setCategoryFilter: handleSetCategoryFilter,
    ownershipFilter,
    setOwnershipFilter: handleSetOwnershipFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage: handleSetItemsPerPage,
  };
}
