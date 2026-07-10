import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {
  Plus,
  Edit,
  Trash2,
  CalendarDays,
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
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';
import type { WorkoutPlanTemplate } from '@/types/workout';
import AddWorkoutPlanDialog from './AddWorkoutPlanDialog';
import {
  useCreateWorkoutPlanTemplateMutation,
  useDeleteWorkoutPlanTemplateMutation,
  useUpdateWorkoutPlanTemplateMutation,
  useWorkoutPlanTemplates,
} from '@/hooks/Exercises/useWorkoutPlans';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';

const WorkoutPlansManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { loggingLevel, formatDate } = usePreferences();
  const isMobile = useIsMobile();

  const [isAddPlanDialogOpen, setIsAddPlanDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<WorkoutPlanTemplate | null>(
    null
  );

  const { data: plans } = useWorkoutPlanTemplates(user?.id);
  const { mutateAsync: createWorkoutPlanTemplate } =
    useCreateWorkoutPlanTemplateMutation();
  const { mutateAsync: updateWorkoutPlanTemplate } =
    useUpdateWorkoutPlanTemplateMutation();
  const { mutateAsync: deleteWorkoutPlanTemplate } =
    useDeleteWorkoutPlanTemplateMutation();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIdsFromTable = React.useMemo(() => {
    const selected = new Set<string>();
    Object.keys(rowSelection).forEach((index) => {
      const plan = plans?.[parseInt(index)];
      if (plan) selected.add(plan.id);
    });
    return selected;
  }, [rowSelection, plans]);

  const {
    selectedIds,
    selectAll,
    clearSelection,
    selectedCount,
    isEditMode,
    toggleEditMode,
  } = useBulkSelection(selectedIdsFromTable);

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const editablePlanIds = (plans || []).map((p) => p.id);

  const allSelected =
    editablePlanIds.length > 0 && selectedCount === editablePlanIds.length;

  const handleBulkDeleteConfirm = async () => {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) => deleteWorkoutPlanTemplate(id))
      );
    } catch (err) {
      // Error handling is handled by mutation
    } finally {
      clearSelection();
      setRowSelection({});
      setShowBulkDeleteDialog(false);
    }
  };

  const handleCreatePlan = async (
    newPlanData: Omit<
      WorkoutPlanTemplate,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >
  ) => {
    if (!user?.id) return;
    try {
      await createWorkoutPlanTemplate({ userId: user.id, data: newPlanData });
      setIsAddPlanDialogOpen(false);
    } catch (err) {
      error(loggingLevel, 'Error creating workout plan:', err);
    }
  };

  const handleUpdatePlan = async (
    planId: string,
    updatedPlanData: Partial<WorkoutPlanTemplate>
  ) => {
    if (!user?.id) return;
    try {
      await updateWorkoutPlanTemplate({ id: planId, data: updatedPlanData });
      setIsEditDialogOpen(false);
      setSelectedPlan(null);
    } catch (err) {
      error(loggingLevel, 'Error updating workout plan:', err);
    }
  };

  const handleDeletePlan = React.useCallback(
    async (planId: string) => {
      if (!user?.id) return;
      try {
        await deleteWorkoutPlanTemplate(planId);
      } catch (err) {
        error(loggingLevel, 'Error deleting workout plan:', err);
      }
    },
    [user?.id, deleteWorkoutPlanTemplate, loggingLevel]
  );

  const handleTogglePlanActive = React.useCallback(
    async (planId: string, isActive: boolean) => {
      if (!user?.id) return;
      try {
        const planToUpdate = plans?.find((p) => p.id === planId);
        if (!planToUpdate) {
          toast({
            title: t('common.error'),
            description: t(
              'workoutPlansManager.updateStatusError',
              'Could not find the plan to update.'
            ),
            variant: 'destructive',
          });
          return;
        }
        await updateWorkoutPlanTemplate({
          id: planId,
          data: { ...planToUpdate, is_active: isActive },
        });
      } catch (err) {
        error(loggingLevel, 'Error toggling workout plan active status:', err);
      }
    },
    [user?.id, plans, t, updateWorkoutPlanTemplate, loggingLevel]
  );

  const columns = React.useMemo<ColumnDef<WorkoutPlanTemplate>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
            aria-label={t(
              'workoutPlansManager.selectAllPlans',
              'Select all workout plans'
            )}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t(
              'workoutPlansManager.selectPlan',
              'Select {{planName}}',
              { planName: row.original.plan_name }
            )}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'plan_name',
        header: t('workoutPlansManager.planName', 'Plan Name'),
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-semibold">{plan.plan_name}</span>
              {plan.description && (
                <span className="max-w-[200px] truncate text-xs text-muted-foreground">
                  {plan.description}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'is_active',
        header: t('workoutPlansManager.status', 'Status'),
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <button
              type="button"
              aria-label={t(
                plan.is_active
                  ? 'workoutPlansManager.deactivatePlan'
                  : 'workoutPlansManager.activatePlan',
                plan.is_active
                  ? 'Deactivate {{planName}}'
                  : 'Activate {{planName}}',
                { planName: plan.plan_name }
              )}
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlanActive(plan.id, !plan.is_active);
              }}
            >
              <Badge
                variant={plan.is_active ? 'default' : 'secondary'}
                className="cursor-pointer text-[10px] font-normal transition-opacity hover:opacity-80"
              >
                {plan.is_active
                  ? t('workoutPlansManager.activeStatus')
                  : t('workoutPlansManager.inactiveStatus')}
              </Badge>
            </button>
          );
        },
      },
      {
        id: 'dates',
        header: t('workoutPlansManager.duration', 'Duration'),
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" aria-hidden="true" />
              <span>{formatDate(plan.start_date!)}</span>
              <span aria-hidden="true">–</span>
              <span>
                {plan.end_date
                  ? formatDate(plan.end_date)
                  : t('workoutPlansManager.ongoingStatus', 'Ongoing')}
              </span>
            </div>
          );
        },
        meta: { colSpan: 2 },
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const plan = row.original;
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  aria-label={t(
                    'workoutPlansManager.openActions',
                    'Open actions for {{planName}}',
                    { planName: plan.plan_name }
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {t('common.actions', 'Actions')}
                </DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    setSelectedPlan(plan);
                    setIsEditDialogOpen(true);
                  }}
                >
                  <Edit className="h-4 w-4" aria-hidden="true" />
                  {t('common.edit', 'Edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleTogglePlanActive(plan.id, !plan.is_active)
                  }
                >
                  {plan.is_active ? (
                    <>
                      <X className="h-4 w-4" aria-hidden="true" />
                      {t('workoutPlansManager.deactivate', 'Deactivate')}
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4" aria-hidden="true" />
                      {t('workoutPlansManager.activate', 'Activate')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeletePlan(plan.id)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t('common.delete', 'Delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [t, formatDate, handleTogglePlanActive, handleDeletePlan]
  );

  if (!plans) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t(
              'exercise.databaseManager.workoutPlansCardTitle',
              'Workout Plans'
            )}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
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
              aria-label={
                isEditMode
                  ? t('common.cancel', 'Cancel')
                  : t('common.select', 'Select')
              }
            >
              {isEditMode ? (
                isMobile ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  t('common.cancel', 'Cancel')
                )
              ) : isMobile ? (
                <CheckSquare className="h-5 w-5" aria-hidden="true" />
              ) : (
                t('common.select', 'Select')
              )}
            </Button>
            <Button
              type="button"
              onClick={() => setIsAddPlanDialogOpen(true)}
              size={isMobile ? 'icon' : 'default'}
              className="shrink-0"
              title={t('workoutPlansManager.addPlanButton', 'Add Plan')}
              aria-label={t('workoutPlansManager.addPlanButton', 'Add Plan')}
            >
              <Plus
                className={isMobile ? 'h-5 w-5' : 'h-4 w-4'}
                aria-hidden="true"
              />
              {!isMobile && (
                <span>
                  {t('workoutPlansManager.addPlanButton', 'Add Plan')}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {plans.length === 0 ? (
            <p className="text-center text-gray-400 py-10 italic">
              {t(
                'workoutPlansManager.noPlansFound',
                'No workout plans found. Create one to get started!'
              )}
            </p>
          ) : (
            <DataTable
              titleColumnId="plan_name"
              onRowDoubleClick={(plan) => {
                setSelectedPlan(plan);
                setIsEditDialogOpen(true);
              }}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              columns={
                isEditMode ? columns : columns.filter((c) => c.id !== 'select')
              }
              data={plans}
            />
          )}
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={editablePlanIds.length}
        allSelected={allSelected}
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked) {
            selectAll(editablePlanIds);
            const newSelection: RowSelectionState = {};
            plans.forEach((_, index) => {
              newSelection[index] = true;
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
        entityName={t('workoutPlansManager.plans', 'plans')}
        onConfirm={handleBulkDeleteConfirm}
      />

      <AddWorkoutPlanDialog
        key={`add-${isAddPlanDialogOpen ? 'open' : 'closed'}`}
        isOpen={isAddPlanDialogOpen}
        onClose={() => setIsAddPlanDialogOpen(false)}
        onSave={handleCreatePlan}
        initialData={null}
      />

      <AddWorkoutPlanDialog
        key={`edit-${selectedPlan?.id ?? (isEditDialogOpen ? 'open' : 'closed')}`}
        isOpen={isEditDialogOpen}
        onClose={() => {
          setIsEditDialogOpen(false);
          setSelectedPlan(null);
        }}
        onSave={handleCreatePlan}
        initialData={selectedPlan}
        onUpdate={handleUpdatePlan}
      />
    </div>
  );
};

export default WorkoutPlansManager;
