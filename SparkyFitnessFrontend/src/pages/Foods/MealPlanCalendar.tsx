import React, { useState, useCallback, useMemo } from 'react';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { debug } from '@/utils/logging';
import { toast } from '@/hooks/use-toast';
import type { MealPlanTemplate } from '@/types/meal';
import MealPlanTemplateForm from './MealPlanTemplateForm';
import {
  Edit,
  Plus,
  Trash2,
  CheckSquare,
  X,
  CalendarDays,
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
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useCreateMealPlanMutation,
  useDeleteMealPlanMutation,
  useMealPlanTemplates,
  useUpdateMealPlanMutation,
} from '@/hooks/Foods/useMealplanTemplate';
import { useFoodEntryInvalidation } from '@/hooks/useInvalidateKeys';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/DataTable';
import { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';

const MealPlanCalendar: React.FC = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { loggingLevel } = usePreferences();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<
    MealPlanTemplate | undefined
  >(undefined);
  const isMobile = useIsMobile();
  const invalidate = useFoodEntryInvalidation();
  const { data: templates, isLoading } = useMealPlanTemplates(activeUserId);
  const { mutateAsync: createMealPlanTemplate } = useCreateMealPlanMutation();
  const { mutateAsync: updateMealPlanTemplate } = useUpdateMealPlanMutation();
  const { mutateAsync: deleteMealPlanTemplate } = useDeleteMealPlanMutation();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedIdsFromTable = useMemo(() => {
    const selected = new Set<string>();
    Object.keys(rowSelection).forEach((index) => {
      const template = templates?.[parseInt(index)];
      if (template && template.id) selected.add(template.id);
    });
    return selected;
  }, [rowSelection, templates]);

  const {
    selectedIds,
    selectAll,
    clearSelection,
    selectedCount,
    isEditMode,
    toggleEditMode,
  } = useBulkSelection(selectedIdsFromTable);

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const handleCreate = () => {
    setSelectedTemplate(undefined);
    setIsFormOpen(true);
  };

  const handleEdit = useCallback((template: MealPlanTemplate) => {
    setSelectedTemplate(template);
    setIsFormOpen(true);
  }, []);

  const handleSave = async (templateData: Partial<MealPlanTemplate>) => {
    if (!activeUserId) return;
    try {
      const now = new Date();
      const currentClientDate = formatDateToYYYYMMDD(now);

      if (templateData.id) {
        const updatedTemplate = await updateMealPlanTemplate({
          userId: activeUserId,
          templateData,
          currentClientDate,
        });
        debug(
          loggingLevel,
          'MealPlanCalendar: Updating template in state:',
          updatedTemplate
        );
      } else {
        const newTemplate = await createMealPlanTemplate({
          userId: activeUserId,
          templateData,
          currentClientDate,
        });
        debug(
          loggingLevel,
          'MealPlanCalendar: Adding new template to state:',
          newTemplate
        );
      }
      setIsFormOpen(false);
      invalidate();
    } catch (error) {
      // Handled by mutation cache
    }
  };

  const handleDelete = useCallback(
    async (templateId: string) => {
      if (!activeUserId) return;
      try {
        const now = new Date();
        const currentClientDate = formatDateToYYYYMMDD(now);

        await deleteMealPlanTemplate({
          userId: activeUserId,
          templateId,
          currentClientDate,
        });
        invalidate();
      } catch (error) {
        // Handled by mutation cache
      }
    },
    [activeUserId, deleteMealPlanTemplate, invalidate]
  );

  const handleTogglePlanActive = useCallback(
    async (templateId: string, isActive: boolean) => {
      if (!activeUserId) return;
      try {
        const templateToUpdate = templates?.find((t) => t.id === templateId);
        if (!templateToUpdate) {
          toast({
            title: t('common.error'),
            description: t('mealPlanCalendar.updateStatusError'),
            variant: 'destructive',
          });
          return;
        }
        const currentClientDate = formatDateToYYYYMMDD(new Date());

        await updateMealPlanTemplate({
          userId: activeUserId,
          templateData: { ...templateToUpdate, is_active: isActive },
          currentClientDate,
        });
      } catch (error) {
        // Handled by mutation cache
      }
    },
    [activeUserId, templates, t, updateMealPlanTemplate]
  );

  const handleBulkDeleteConfirm = async () => {
    if (!activeUserId) return;
    try {
      const now = new Date();
      const currentClientDate = formatDateToYYYYMMDD(now);

      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deleteMealPlanTemplate({
            userId: activeUserId,
            templateId: id,
            currentClientDate,
          })
        )
      );
      invalidate();
    } catch (err) {
      // Error handling by mutation
    } finally {
      clearSelection();
      setRowSelection({});
      setShowBulkDeleteDialog(false);
    }
  };

  const columns = useMemo<ColumnDef<MealPlanTemplate>[]>(
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
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'plan_name',
        header: t('mealPlanCalendar.planName', 'Plan Name'),
        cell: ({ row }) => {
          const template = row.original;
          return (
            <div className="flex flex-col">
              <span className="font-semibold">{template.plan_name}</span>
              {template.description && (
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                  {template.description}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'is_active',
        header: t('mealPlanCalendar.status', 'Status'),
        cell: ({ row }) => {
          const template = row.original;
          return (
            <Badge
              variant={template.is_active ? 'default' : 'secondary'}
              className="font-normal text-[10px] cursor-pointer hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                handleTogglePlanActive(template.id!, !template.is_active);
              }}
            >
              {template.is_active
                ? t('mealPlanCalendar.activeStatus', 'Active')
                : t('mealPlanCalendar.inactiveStatus', 'Inactive')}
            </Badge>
          );
        },
      },
      {
        id: 'duration',
        header: t('mealPlanCalendar.duration', 'Duration'),
        cell: ({ row }) => {
          const template = row.original;
          return (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              <span>{new Date(template.start_date).toLocaleDateString()}</span>
              <span>-</span>
              <span>
                {template.end_date
                  ? new Date(template.end_date).toLocaleDateString()
                  : t('mealPlanCalendar.ongoingStatus', 'Indefinite')}
              </span>
            </div>
          );
        },
        meta: { colSpan: 2 },
      },
      {
        id: 'meals',
        header: t('mealPlanCalendar.mealsHeader', 'Meals'),
        cell: ({ row }) => (
          <Badge variant="outline" className="font-normal">
            {t('mealPlanCalendar.weeklyMeals', {
              count: row.original.assignments.length,
            })}
          </Badge>
        ),
        meta: { hideOnMobile: true },
      },
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const template = row.original;
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
                <DropdownMenuItem onClick={() => handleEdit(template)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common.edit', 'Edit')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    handleTogglePlanActive(template.id!, !template.is_active)
                  }
                >
                  {template.is_active ? (
                    <>
                      <X className="mr-2 h-4 w-4" />
                      {t('mealPlanCalendar.deactivate', 'Deactivate')}
                    </>
                  ) : (
                    <>
                      <CheckSquare className="mr-2 h-4 w-4" />
                      {t('mealPlanCalendar.activate', 'Activate')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => {
                    if (
                      window.confirm(
                        t('mealPlanCalendar.deleteTemplateConfirmation')
                      )
                    ) {
                      handleDelete(template.id!);
                    }
                  }}
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
    [t, handleTogglePlanActive, handleEdit, handleDelete]
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('mealPlanCalendar.title')}
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
              onClick={handleCreate}
              size={isMobile ? 'icon' : 'default'}
              className="shrink-0"
              title={t('mealPlanCalendar.createNewPlan')}
            >
              <Plus className={isMobile ? 'h-5 w-5' : 'h-4 w-4 mr-2'} />
              {!isMobile && <span>{t('mealPlanCalendar.createNewPlan')}</span>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            titleColumnId="plan_name"
            onRowDoubleClick={handleEdit}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            columns={
              isEditMode ? columns : columns.filter((c) => c.id !== 'select')
            }
            data={templates || []}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={templates?.length || 0}
        allSelected={
          templates?.length ? selectedCount === templates.length : false
        }
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked && templates) {
            selectAll(templates.map((t) => t.id!));
            const newSelection: RowSelectionState = {};
            templates.forEach((_, index) => {
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
        entityName={t('mealPlanCalendar.templates', 'meal plan templates')}
        onConfirm={handleBulkDeleteConfirm}
      />

      {isFormOpen && (
        <MealPlanTemplateForm
          template={selectedTemplate}
          onSave={handleSave}
          onClose={() => setIsFormOpen(false)}
        />
      )}
    </div>
  );
};

export default MealPlanCalendar;
