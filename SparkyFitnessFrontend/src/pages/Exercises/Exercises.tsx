import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import AddExerciseDialog from '@/pages/Exercises/AddExerciseDialog';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Plus,
  CheckSquare,
  X,
  Edit,
  Trash2,
  Share2,
  Lock,
  Users,
  MoreHorizontal,
  Search,
  Filter,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import type { ExerciseOwnershipFilter } from '@/types/exercises';
import WorkoutPresetsManager from './WorkoutPresetsManager';
import WorkoutPlansManager from '@/pages/Exercises/WorkoutPlansManager';
import {
  useExercises,
  useUpdateExerciseShareStatusMutation,
} from '@/hooks/Exercises/useExercises';
import { useEditExerciseForm } from '@/hooks/Exercises/useEditExerciseForm';
import EditExerciseDialog from './EditExerciseDialog';
import { useDeleteExercise } from '@/hooks/Exercises/useDeleteExercise';
import { useExerciseFilters } from '@/hooks/Exercises/useExerciseFilter';
import {
  EXERCISE_CATEGORIES,
  EXERCISE_CATEGORY_META,
  ExerciseCategory,
} from '@/constants/exercises';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { getEnergyUnitString } from '@/utils/nutritionCalculations';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Exercise as ExerciseInterface } from '@/types/exercises';

const ExerciseDatabaseManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { energyUnit, convertEnergy } = usePreferences();
  const isMobile = useIsMobile();

  // Existing states for Exercise management
  const editForm = useEditExerciseForm();
  const {
    showSyncConfirmation,
    setShowSyncConfirmation,
    handleSyncConfirmation,
  } = editForm;
  const {
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    deletionImpact,
    handleDeleteRequest,
    confirmDelete,
    deleteExercise,
  } = useDeleteExercise();

  const {
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    ownershipFilter,
    setOwnershipFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = useExerciseFilters();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [sortOrder, setSortOrder] = useState<string>('name:asc');

  const { data } = useExercises(
    searchTerm,
    categoryFilter,
    ownershipFilter,
    currentPage,
    itemsPerPage,
    user?.id,
    sortOrder
  );

  const selectedIdsFromTable = useMemo(() => {
    return new Set<string>(Object.keys(rowSelection));
  }, [rowSelection]);

  const {
    selectedIds,
    selectAll,
    clearSelection,
    selectedCount,
    isEditMode,
    toggleEditMode,
  } = useBulkSelection(selectedIdsFromTable);

  // Clear selection when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      setRowSelection({});
    }
  }, [isEditMode]);

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);

  const editableExerciseIds = (data?.exercises || [])
    .filter((ex) => ex.user_id === user?.id)
    .map((ex) => ex.id);

  const allSelected =
    editableExerciseIds.length > 0 &&
    selectedCount === editableExerciseIds.length;

  const handleBulkDeleteConfirm = async () => {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deleteExercise({ id, forceDelete: true })
        )
      );
    } catch (err) {
      // Error handling is handled by mutation
    } finally {
      clearSelection();
      setRowSelection({});
      setShowBulkDeleteDialog(false);
    }
  };

  const { mutateAsync: updateExerciseShareStatus } =
    useUpdateExerciseShareStatusMutation();

  const currentExercises = data ? data.exercises : [];
  const totalExercisesCount = data ? data.totalCount : 0;
  const totalPages = Math.ceil(totalExercisesCount / itemsPerPage);

  const columns = useMemo<ColumnDef<ExerciseInterface>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
            disabled={row.original.user_id !== user?.id}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        id: 'name',
        header: t('exercise.databaseManager.name', 'Name'),
        enableSorting: true,
        cell: ({ row }) => {
          const exercise = row.original;
          const meta =
            EXERCISE_CATEGORY_META[exercise.category as ExerciseCategory] ??
            EXERCISE_CATEGORY_META['general'];
          const CategoryIcon = meta.icon;
          return (
            <div className="flex items-center gap-3">
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg}`}
              >
                <CategoryIcon className={`w-3.5 h-3.5 ${meta.color}`} />
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm">{exercise.name}</span>
                  {exercise.tags
                    ?.filter(
                      (tag) =>
                        !(
                          tag === 'private' && exercise.tags?.includes('public')
                        )
                    )
                    .map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] font-medium px-1 py-0 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex items-center gap-0.5"
                      >
                        {tag === 'public' && <Share2 className="w-2 w-2" />}
                        {tag === 'family' && <Users className="w-2 w-2" />}
                        {tag}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'category',
        id: 'category',
        header: t('exercise.databaseManager.category', 'Category'),
        // Disabled sorting for category since there is a dropdown above it
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400 capitalize">
            {row.original.category}
          </span>
        ),
      },
      {
        id: 'energy',
        accessorKey: 'calories_per_hour',
        header: t('exercise.databaseManager.energy', 'Energy'),
        // Disabled energy sorting because it's reported not working on backend
        enableSorting: false,
        cell: ({ row }) => {
          const caloriesPerHour = Math.round(
            convertEnergy(
              row.original.calories_per_hour ?? 0,
              'kcal',
              energyUnit
            )
          );
          return (
            <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
              {caloriesPerHour} {getEnergyUnitString(energyUnit)}/h
            </span>
          );
        },
        meta: { hideOnMobile: true },
      },
      {
        id: 'details',
        header: t('exercise.databaseManager.details', 'Details'),
        cell: ({ row }) => {
          const exercise = row.original;
          return (
            <div className="flex flex-col gap-0.5">
              {exercise.primary_muscles &&
                exercise.primary_muscles.length > 0 && (
                  <div className="text-[10px] text-gray-500 truncate max-w-[150px]">
                    <span className="font-medium">Muscles: </span>
                    {exercise.primary_muscles.join(', ')}
                  </div>
                )}
              {exercise.equipment && exercise.equipment.length > 0 && (
                <div className="text-[10px] text-gray-500 truncate max-w-[150px]">
                  <span className="font-medium">Equipment: </span>
                  {exercise.equipment.join(', ')}
                </div>
              )}
            </div>
          );
        },
        meta: { hideOnMobile: true },
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const exercise = row.original;
          const isOwned = exercise.user_id === user?.id;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Open menu</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {t('common.actions', 'Actions')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={!isOwned}
                  onClick={() => editForm.openEditDialog(exercise)}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common.edit', 'Edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isOwned}
                  onClick={() =>
                    updateExerciseShareStatus({
                      id: exercise.id,
                      sharedWithPublic: !exercise.shared_with_public,
                    })
                  }
                >
                  {exercise.shared_with_public ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      {t(
                        'exercise.databaseManager.makePrivateTooltip',
                        'Make Private'
                      )}
                    </>
                  ) : (
                    <>
                      <Share2 className="mr-2 h-4 w-4" />
                      {t(
                        'exercise.databaseManager.shareWithPublicTooltip',
                        'Share Public'
                      )}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!isOwned}
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeleteRequest(exercise)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete', 'Delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      t,
      user?.id,
      energyUnit,
      convertEnergy,
      editForm,
      handleDeleteRequest,
      updateExerciseShareStatus,
    ]
  );

  const displayColumns = useMemo(
    () => (isEditMode ? columns : columns.filter((c) => c.id !== 'select')),
    [isEditMode, columns]
  );

  return (
    <div className="space-y-6">
      {/* Exercises Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>
            {t('exercise.databaseManager.cardTitle', 'Exercises')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-row flex-wrap items-center gap-4">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder={t(
                    'exercise.databaseManager.searchPlaceholder',
                    'Search exercises...'
                  )}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    clearSelection();
                    setRowSelection({});
                  }}
                  className="pl-10"
                />
              </div>

              <div className="flex items-center gap-2 whitespace-nowrap">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select
                  onValueChange={(val) => {
                    setCategoryFilter(val);
                    clearSelection();
                    setRowSelection({});
                  }}
                  defaultValue={categoryFilter}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue
                      placeholder={t(
                        'exercise.databaseManager.allCategoriesPlaceholder',
                        'All Categories'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t(
                        'exercise.databaseManager.allCategoriesItem',
                        'All Categories'
                      )}
                    </SelectItem>
                    {EXERCISE_CATEGORIES.map(
                      ({ value, labelKey, defaultLabel }) => (
                        <SelectItem key={value} value={value}>
                          {t(labelKey, defaultLabel)}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>

                <Select
                  onValueChange={(value) => {
                    setOwnershipFilter(value as ExerciseOwnershipFilter);
                    clearSelection();
                    setRowSelection({});
                  }}
                  defaultValue={ownershipFilter}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue
                      placeholder={t(
                        'exercise.databaseManager.allOwnershipPlaceholder',
                        'All'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('exercise.databaseManager.allOwnershipItem', 'All')}
                    </SelectItem>
                    <SelectItem value="own">
                      {t(
                        'exercise.databaseManager.myOwnOwnershipItem',
                        'My Own'
                      )}
                    </SelectItem>
                    <SelectItem value="family">
                      {t(
                        'exercise.databaseManager.familyOwnershipItem',
                        'Family'
                      )}
                    </SelectItem>
                    <SelectItem value="public">
                      {t(
                        'exercise.databaseManager.publicOwnershipItem',
                        'Public'
                      )}
                    </SelectItem>
                    <SelectItem value="needs-review">
                      {t(
                        'exercise.databaseManager.needsReviewOwnershipItem',
                        'Needs Review'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 shrink-0 ml-auto">
                <Button
                  variant="outline"
                  size={isMobile ? 'icon' : 'default'}
                  onClick={toggleEditMode}
                  className={`shrink-0 ${
                    isEditMode
                      ? 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400'
                      : ''
                  }`}
                  title={
                    isEditMode
                      ? t('common.cancel', 'Cancel')
                      : t('common.select', 'Select')
                  }
                >
                  {isEditMode ? (
                    isMobile ? (
                      <X className="w-5 h-5" />
                    ) : (
                      t('common.cancel', 'Cancel')
                    )
                  ) : isMobile ? (
                    <CheckSquare className="w-5 h-5" />
                  ) : (
                    t('common.select', 'Select')
                  )}
                </Button>
                <Button
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                  onClick={() => setIsAddExerciseDialogOpen(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t(
                    'exercise.databaseManager.addExerciseButton',
                    'Add Exercise'
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <DataTable
              titleColumnId="name"
              getRowId={(row) => row.id}
              onRowDoubleClick={(ex) => {
                if (ex.user_id === user?.id) editForm.openEditDialog(ex);
              }}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              onSortingChange={(sorting) => {
                if (sorting.length > 0) {
                  const sort = sorting[0];
                  if (sort) {
                    setSortOrder(`${sort.id}:${sort.desc ? 'desc' : 'asc'}`);
                  }
                } else {
                  setSortOrder('name:asc');
                }
              }}
              manualSorting
              pagination={{
                pageIndex: currentPage - 1,
                pageSize: itemsPerPage,
              }}
              sorting={[
                {
                  id: sortOrder.split(':')[0] || 'name',
                  desc: sortOrder.split(':')[1] === 'desc',
                },
              ]}
              columns={displayColumns}
              data={currentExercises}
              isLoading={!data}
              manualPagination
              pageCount={totalPages}
              onPaginationChange={(pageIndex, pageSize) => {
                if (pageSize !== itemsPerPage) {
                  setItemsPerPage(pageSize);
                } else {
                  setCurrentPage(pageIndex + 1);
                }
              }}
            />
          </div>
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={editableExerciseIds.length}
        allSelected={allSelected}
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked) {
            selectAll(editableExerciseIds);
            // Sync with table
            const newSelection: RowSelectionState = {};
            currentExercises.forEach((ex) => {
              if (ex.user_id === user?.id) newSelection[ex.id] = true;
            });
            setRowSelection(newSelection);
          } else {
            clearSelection();
            setRowSelection({});
          }
        }}
      />

      <BulkDeleteDialog
        isOpen={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
        selectedCount={selectedCount}
        entityName={t('exercise.databaseManager.exercises', 'exercises')}
        onConfirm={handleBulkDeleteConfirm}
      />

      {/* Workout Presets Section */}
      <WorkoutPresetsManager />

      {/* Workout Plans Section */}
      <WorkoutPlansManager />

      <AddExerciseDialog
        open={isAddExerciseDialogOpen}
        onOpenChange={setIsAddExerciseDialogOpen}
        onExerciseAdded={() => {}}
        mode="database-manager"
      />

      {showDeleteConfirmation && (
        <ConfirmationDialog
          open={showDeleteConfirmation}
          onOpenChange={setShowDeleteConfirmation}
          onConfirm={confirmDelete}
          title={t('exercise.databaseManager.deleteConfirmationTitle')}
          description={
            deletionImpact?.isUsedByOthers
              ? t('exercise.databaseManager.deleteImpactDescription')
              : t('exercise.databaseManager.deleteConfirmationDescription')
          }
        />
      )}

      <EditExerciseDialog form={editForm} />

      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={setShowSyncConfirmation}
          onConfirm={handleSyncConfirmation}
          title={t('exercise.databaseManager.syncConfirmationTitle')}
          description={t(
            'exercise.databaseManager.syncConfirmationDescription',
            'Do you want to update all your past diary entries for this exercise with the new information?'
          )}
        />
      )}
    </div>
  );
};

export default ExerciseDatabaseManager;
