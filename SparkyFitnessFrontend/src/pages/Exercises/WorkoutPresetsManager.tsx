import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Plus,
  Edit,
  Trash2,
  CalendarPlus,
  Loader2,
  Layers,
  Dumbbell,
  CheckSquare,
  X,
  MoreHorizontal,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import type { WorkoutPreset } from '@/types/workout';
import WorkoutPresetForm from './WorkoutPresetForm';
import {
  useCreateWorkoutPresetMutation,
  useDeleteWorkoutPresetMutation,
  useUpdateWorkoutPresetMutation,
  useWorkoutPresets,
} from '@/hooks/Exercises/useWorkoutPresets';
import { useLogWorkoutPresetMutation } from '@/hooks/Exercises/useExerciseEntries';
import { usePreferences } from '@/contexts/PreferencesContext';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';

const WorkoutPresetsManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { weightUnit } = usePreferences();

  const [isAddPresetDialogOpen, setIsAddPresetDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<WorkoutPreset | null>(
    null
  );

  const { data, fetchNextPage, hasNextPage, isLoading, isFetchingNextPage } =
    useWorkoutPresets(user?.id);

  const { mutateAsync: createPreset } = useCreateWorkoutPresetMutation();
  const { mutateAsync: updatePreset } = useUpdateWorkoutPresetMutation();
  const { mutateAsync: deletePreset } = useDeleteWorkoutPresetMutation();
  const { mutateAsync: logWorkoutPreset } = useLogWorkoutPresetMutation();

  const presets = React.useMemo(
    () => data?.pages.flatMap((page) => page.presets) ?? [],
    [data]
  );

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIdsFromTable = React.useMemo(() => {
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

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const editablePresetIds = presets
    .filter((p) => p.user_id === user?.id)
    .map((p) => p.id.toString());

  const allSelected =
    editablePresetIds.length > 0 && selectedCount === editablePresetIds.length;

  const handleBulkDeleteConfirm = async () => {
    try {
      await Promise.all(Array.from(selectedIds).map((id) => deletePreset(id)));
    } catch (err) {
      // Error handling is handled by mutation
    } finally {
      clearSelection();
      setRowSelection({});
      setShowBulkDeleteDialog(false);
    }
  };

  const handleCreatePreset = async (
    newPresetData: Omit<
      WorkoutPreset,
      'id' | 'created_at' | 'updated_at' | 'user_id'
    >
  ) => {
    if (!user?.id) return;
    await createPreset({ ...newPresetData, user_id: user.id });
    setIsAddPresetDialogOpen(false);
  };

  const handleUpdatePreset = async (
    presetId: string,
    updatedPresetData: Partial<WorkoutPreset>
  ) => {
    await updatePreset({ id: presetId, data: updatedPresetData });
    setIsEditDialogOpen(false);
    setSelectedPreset(null);
  };

  const handleDeletePreset = React.useCallback(
    async (presetId: string) => {
      await deletePreset(presetId);
    },
    [deletePreset]
  );

  const handleLogPresetToDiary = React.useCallback(
    async (preset: WorkoutPreset) => {
      try {
        const today = formatDateToYYYYMMDD(new Date());
        await logWorkoutPreset({ presetId: preset.id, date: today });
        toast({
          title: t('common.success', 'Success'),
          description: t('workoutPresetsManager.logSuccess', {
            presetName: preset.name,
          }),
        });
      } catch (err) {
        toast({
          title: t('common.error', 'Error'),
          description: t('workoutPresetsManager.logError', {
            presetName: preset.name,
          }),
          variant: 'destructive',
        });
      }
    },
    [logWorkoutPreset, t]
  );

  const columns = React.useMemo<ColumnDef<WorkoutPreset>[]>(
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
        header: t('workoutPresetsManager.name', 'Name'),
        cell: ({ row }) => {
          const preset = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-semibold">{preset.name}</span>
              {preset.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {preset.description}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'exercises',
        header: t('workoutPresetsManager.exercises', 'Exercises'),
        cell: ({ row }) => {
          const count = row.original.exercises?.length || 0;
          return (
            <Badge variant="secondary" className="font-normal">
              {count} {count === 1 ? 'exercise' : 'exercises'}
            </Badge>
          );
        },
      },
      {
        id: 'stats',
        header: t('workoutPresetsManager.stats', 'Stats'),
        cell: ({ row }) => {
          const preset = row.original;
          const totalSets =
            preset.exercises?.reduce(
              (sum, ex) => sum + (ex.sets?.length || 0),
              0
            ) ?? 0;
          const totalWeight =
            preset.exercises?.reduce((sum, ex) => {
              const vol =
                ex.sets?.reduce(
                  (s, set) => s + (set.weight || 0) * (set.reps || 0),
                  0
                ) ?? 0;
              return sum + vol;
            }, 0) ?? 0;
          return (
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-blue-500" />
                <span>{totalSets} sets</span>
              </div>
              <div className="flex items-center gap-1">
                <Dumbbell className="w-3 h-3 text-indigo-500" />
                <span>
                  {totalWeight}
                  {weightUnit}
                </span>
              </div>
            </div>
          );
        },
        meta: { hideOnMobile: true, colSpan: 2 },
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const preset = row.original;
          const isOwned = preset.user_id === user?.id;
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
                  onClick={() => handleLogPresetToDiary(preset)}
                >
                  <CalendarPlus className="mr-2 h-4 w-4" />
                  {t('workoutPresetsManager.logToDiary', 'Log to Diary')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isOwned}
                  onClick={() => {
                    setSelectedPreset(preset);
                    setIsEditDialogOpen(true);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common.edit', 'Edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!isOwned}
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeletePreset(preset.id.toString())}
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
    [t, user?.id, weightUnit, handleLogPresetToDiary, handleDeletePreset]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t(
              'exercise.databaseManager.workoutPresetsCardTitle',
              'Workout Presets'
            )}
          </CardTitle>
          <div className="flex gap-2">
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
              onClick={() => setIsAddPresetDialogOpen(true)}
              size={isMobile ? 'icon' : 'default'}
              className="shrink-0"
              title={t('workoutPresetsManager.addPresetButton', 'Add presets')}
            >
              <Plus className={isMobile ? 'w-5 h-5' : 'h-4 w-4 mr-2'} />
              {!isMobile && (
                <span>
                  {t('workoutPresetsManager.addPresetButton', 'Add presets')}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {presets.length === 0 && !isLoading ? (
            <p className="text-center text-gray-400 py-10 italic">
              {t(
                'workoutPresetsManager.noPresetsFound',
                'No workout presets found.'
              )}
            </p>
          ) : (
            <DataTable
              titleColumnId="name"
              getRowId={(row) => row.id.toString()}
              onRowDoubleClick={(preset) => {
                if (preset.user_id === user?.id) {
                  setSelectedPreset(preset);
                  setIsEditDialogOpen(true);
                }
              }}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              columns={
                isEditMode ? columns : columns.filter((c) => c.id !== 'select')
              }
              data={presets}
              isLoading={isLoading}
            />
          )}

          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="ghost"
                onClick={() => {
                  fetchNextPage();
                  clearSelection();
                }}
                disabled={isFetchingNextPage}
                className="text-gray-500"
              >
                {isFetchingNextPage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  t('workoutPresetsManager.loadMore', 'Load more')
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={editablePresetIds.length}
        allSelected={allSelected}
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked) {
            selectAll(editablePresetIds);
            // Sync with table
            const newSelection: RowSelectionState = {};
            presets.forEach((p) => {
              if (p.user_id === user?.id) newSelection[p.id.toString()] = true;
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
        entityName={t('workoutPresetsManager.presets', 'presets')}
        onConfirm={handleBulkDeleteConfirm}
      />

      <WorkoutPresetForm
        isOpen={isAddPresetDialogOpen}
        onClose={() => setIsAddPresetDialogOpen(false)}
        onSave={handleCreatePreset}
      />

      {selectedPreset && (
        <WorkoutPresetForm
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedPreset(null);
          }}
          onSave={(updatedData) =>
            handleUpdatePreset(selectedPreset.id.toString(), updatedData)
          }
          initialPreset={selectedPreset}
        />
      )}
    </div>
  );
};

export default WorkoutPresetsManager;
