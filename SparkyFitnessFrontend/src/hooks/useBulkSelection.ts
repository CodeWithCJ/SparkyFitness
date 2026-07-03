import { useState, useCallback } from 'react';

export interface UseBulkSelectionReturn {
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  selectedCount: number;
  isEditMode: boolean;
  toggleEditMode: () => void;
  setEditMode: (value: boolean) => void;
  setSelectedIds: (ids: Set<string>) => void;
}

export function useBulkSelection(
  externalSelectedIds?: Set<string>,
  onExternalSelectionChange?: (ids: Set<string>) => void
): UseBulkSelectionReturn {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(
    new Set()
  );
  const [isEditMode, setIsEditMode] = useState(false);

  const selectedIds = externalSelectedIds || internalSelectedIds;

  const updateSelectedIds = useCallback(
    (newIds: Set<string>) => {
      if (onExternalSelectionChange) {
        onExternalSelectionChange(newIds);
      } else {
        setInternalSelectedIds(newIds);
      }
    },
    [onExternalSelectionChange]
  );

  const toggleSelection = useCallback(
    (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      updateSelectedIds(newSet);
    },
    [selectedIds, updateSelectedIds]
  );

  const selectAll = useCallback(
    (ids: string[]) => {
      updateSelectedIds(new Set(ids));
    },
    [updateSelectedIds]
  );

  const clearSelection = useCallback(() => {
    updateSelectedIds(new Set());
  }, [updateSelectedIds]);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const setEditMode = useCallback(
    (value: boolean) => {
      setIsEditMode(value);
      if (!value) {
        updateSelectedIds(new Set());
      }
    },
    [updateSelectedIds]
  );

  const toggleEditMode = useCallback(() => {
    setIsEditMode((prev) => {
      const next = !prev;
      if (!next) {
        updateSelectedIds(new Set());
      }
      return next;
    });
  }, [updateSelectedIds]);

  return {
    selectedIds,
    toggleSelection,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount: selectedIds.size,
    isEditMode,
    toggleEditMode,
    setEditMode,
    setSelectedIds: updateSelectedIds,
  };
}
