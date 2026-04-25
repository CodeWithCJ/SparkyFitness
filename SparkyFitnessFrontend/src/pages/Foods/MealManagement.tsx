import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  Filter,
  Share2,
  Lock,
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
import { usePreferences } from '@/contexts/PreferencesContext';
import { error } from '@/utils/logging';
import type { Meal, MealFilter, MealFood, MealPayload } from '@/types/meal';
import type { MealDeletionImpact } from '@/types/meal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import MealBuilder from '@/components/MealBuilder';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  mealDeletionImpactOptions,
  mealViewOptions,
  useDeleteMealMutation,
  useMeals,
  useUpdateMealMutation,
} from '@/hooks/Foods/useMeals';
import { useQueryClient } from '@tanstack/react-query';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import { useMealInvalidation } from '@/hooks/useInvalidateKeys';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/ui/DataTable';
import {
  ColumnDef,
  RowSelectionState,
  CellContext,
} from '@tanstack/react-table';

// This component is now a standalone library for managing meal templates.
// Interactions with the meal plan calendar are handled by the calendar itself.
const MealManagement: React.FC = () => {
  const { t } = useTranslation();
  const { loggingLevel } = usePreferences();
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<MealFilter>('all');
  const [editingMealId, setEditingMealId] = useState<string | undefined>(
    undefined
  );
  const [showMealBuilderDialog, setShowMealBuilderDialog] = useState(false);
  const [viewingMeal, setViewingMeal] = useState<
    (Meal & { foods?: MealFood[] }) | null
  >(null);
  const [deletionImpact, setDeletionImpact] =
    useState<MealDeletionImpact | null>(null);
  const [mealToDelete, setMealToDelete] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const { nutrientDisplayPreferences, energyUnit, convertEnergy } =
    usePreferences();
  const { data: customNutrients = [] } = useCustomNutrients();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const { data: meals } = useMeals(filter);

  const filteredMeals = React.useMemo(
    () =>
      meals
        ? meals.filter((meal) =>
            meal.name.toLowerCase().includes(searchTerm.toLowerCase())
          )
        : [],
    [meals, searchTerm]
  );

  const selectedIdsFromTable = React.useMemo(() => {
    const selected = new Set<string>();
    Object.keys(rowSelection).forEach((index) => {
      const meal = filteredMeals[parseInt(index)];
      if (meal && meal.id) selected.add(meal.id);
    });
    return selected;
  }, [rowSelection, filteredMeals]);

  const {
    selectedIds,
    selectAll,
    clearSelection,
    selectedCount,
    isEditMode,
    toggleEditMode,
  } = useBulkSelection(selectedIdsFromTable);

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const getEnergyUnitString = React.useCallback(
    (unit: 'kcal' | 'kJ'): string => {
      return unit === 'kcal'
        ? t('common.kcalUnit', 'kcal')
        : t('common.kJUnit', 'kJ');
    },
    [t]
  );

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop'
    );

  const visibleNutrients = React.useMemo(
    () =>
      quickInfoPreferences
        ? quickInfoPreferences.visible_nutrients
        : ['calories', 'protein', 'carbs', 'fat'],
    [quickInfoPreferences]
  );

  const { mutateAsync: deleteMeal } = useDeleteMealMutation();
  const { mutateAsync: updateMeal } = useUpdateMealMutation();
  const queryClient = useQueryClient();
  const invalidateMeals = useMealInvalidation();

  const editableMealIds = (filteredMeals || []).map((m) => m.id!);

  const allSelected =
    editableMealIds.length > 0 && selectedCount === editableMealIds.length;

  const handleBulkDeleteConfirm = async () => {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deleteMeal({ mealId: id, force: true })
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

  const handleCreateNewMeal = () => {
    setEditingMealId(undefined);
    setShowMealBuilderDialog(true);
  };

  const handleEditMeal = React.useCallback((mealId: string) => {
    setEditingMealId(mealId);
    setShowMealBuilderDialog(true);
  }, []);

  const handleDeleteMeal = async (mealId: string, force: boolean = false) => {
    try {
      await deleteMeal({ mealId, force });
    } catch (err) {
      error(loggingLevel, 'Failed to delete meal:', err);
    } finally {
      setMealToDelete(null);
      setDeletionImpact(null);
    }
  };

  const openDeleteConfirmation = React.useCallback(
    async (mealId: string) => {
      try {
        const impact = await queryClient.fetchQuery(
          mealDeletionImpactOptions(mealId)
        );
        setDeletionImpact(impact);
        setMealToDelete(mealId);
      } catch (err) {
        error(loggingLevel, 'Failed to get meal deletion impact:', err);
      }
    },
    [queryClient, loggingLevel]
  );

  const handleMealSave = () => {
    setShowMealBuilderDialog(false);
    invalidateMeals();
  };

  const handleMealCancel = () => {
    setShowMealBuilderDialog(false);
  };

  const handleViewDetails = React.useCallback(
    async (meal: Meal) => {
      try {
        // Fetch full meal details including foods
        const fullMeal = await queryClient.fetchQuery(mealViewOptions(meal.id));
        setViewingMeal(fullMeal);
      } catch (err) {
        error(loggingLevel, 'Failed to fetch meal details:', err);
      }
    },
    [queryClient, loggingLevel]
  );

  const handleShareMeal = React.useCallback(
    async (mealId: string) => {
      try {
        const mealToUpdate = await queryClient.fetchQuery(
          mealViewOptions(mealId)
        );
        if (!mealToUpdate) {
          throw new Error('Meal not found.');
        }
        const mealPayload: MealPayload = {
          name: mealToUpdate.name,
          description: mealToUpdate.description,
          is_public: true,
          foods:
            mealToUpdate.foods?.map((food) => ({
              food_id: food.food_id,
              food_name: food.food_name,
              variant_id: food.variant_id,
              quantity: food.quantity,
              unit: food.unit,
              calories: food.calories,
              protein: food.protein,
              carbs: food.carbs,
              fat: food.fat,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
            })) || [],
        };
        await updateMeal({ mealId, mealPayload });
      } catch (err) {
        error(loggingLevel, 'Failed to share meal:', err);
      }
    },
    [queryClient, updateMeal, loggingLevel]
  );

  const handleUnshareMeal = React.useCallback(
    async (mealId: string) => {
      try {
        const mealToUpdate = await queryClient.fetchQuery(
          mealViewOptions(mealId)
        );
        if (!mealToUpdate) {
          throw new Error('Meal not found.');
        }
        const mealPayload: MealPayload = {
          name: mealToUpdate.name,
          description: mealToUpdate.description,
          is_public: false,
          foods:
            mealToUpdate.foods?.map((food) => ({
              food_id: food.food_id,
              food_name: food.food_name,
              variant_id: food.variant_id,
              quantity: food.quantity,
              unit: food.unit,
              calories: food.calories,
              protein: food.protein,
              carbs: food.carbs,
              fat: food.fat,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit,
            })) || [],
        };
        await updateMeal({ mealId, mealPayload });
      } catch (err) {
        error(loggingLevel, 'Failed to unshare meal:', err);
      }
    },
    [queryClient, updateMeal, loggingLevel]
  );

  const columns = React.useMemo<ColumnDef<Meal>[]>(
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
        accessorKey: 'name',
        header: t('mealManagement.name', 'Name'),
        cell: ({ row }) => {
          const meal = row.original;
          return (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{meal.name}</span>
                {meal.is_public && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                    <Share2 className="h-2.5 w-2.5 mr-1" />
                    {t('mealManagement.public', 'Public')}
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                {meal.description || t('mealManagement.noDescription')}
              </span>
            </div>
          );
        },
      },
      ...visibleNutrients.map((nutrient) => ({
        id: nutrient,
        header: () => {
          const meta = getNutrientMetadata(nutrient, customNutrients);
          return (
            <div className="flex flex-col">
              <span>{t(meta.label, meta.defaultLabel)}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                (
                {nutrient === 'calories'
                  ? getEnergyUnitString(energyUnit)
                  : meta.unit}
                )
              </span>
            </div>
          );
        },
        accessorFn: (meal: Meal) => {
          let total = 0;
          meal.foods?.forEach((f) => {
            const scale = f.quantity / (f.serving_size || 1);
            let val = 0;
            if (
              nutrient in f &&
              typeof f[nutrient as keyof typeof f] === 'number'
            ) {
              val = f[nutrient as keyof typeof f] as number;
            } else if (f.custom_nutrients && nutrient in f.custom_nutrients) {
              val = Number(f.custom_nutrients[nutrient]) || 0;
            }
            total += val * scale;
          });
          return nutrient === 'calories'
            ? Math.round(convertEnergy(total, 'kcal', energyUnit))
            : total;
        },
        cell: (info: CellContext<Meal, unknown>) => {
          const meta = getNutrientMetadata(nutrient, customNutrients);
          return (
            <span className={`font-medium ${meta.color}`}>
              {nutrient === 'calories'
                ? (info.getValue() as number)
                : formatNutrientValue(
                    nutrient,
                    info.getValue() as number,
                    customNutrients
                  )}
            </span>
          );
        },
        meta: {
          hideOnMobile: false,
        },
        enableSorting: true,
      })),
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const meal = row.original;
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
                <DropdownMenuItem onClick={() => handleViewDetails(meal)}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t('mealManagement.viewMealDetails', 'View Details')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleEditMeal(meal.id!)}>
                  <Edit className="mr-2 h-4 w-4" />
                  {t('mealManagement.editMeal', 'Edit Meal')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    meal.is_public
                      ? handleUnshareMeal(meal.id!)
                      : handleShareMeal(meal.id!)
                  }
                >
                  {meal.is_public ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      {t('mealManagement.unshareMeal', 'Make Private')}
                    </>
                  ) : (
                    <>
                      <Share2 className="mr-2 h-4 w-4" />
                      {t('mealManagement.shareMeal', 'Share Public')}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => openDeleteConfirmation(meal.id!)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('mealManagement.deleteMeal', 'Delete Meal')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      t,
      visibleNutrients,
      energyUnit,
      convertEnergy,
      handleEditMeal,
      openDeleteConfirmation,
      handleViewDetails,
      handleUnshareMeal,
      handleShareMeal,
      getEnergyUnitString,
      customNutrients,
    ]
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('mealManagement.manageMeals', 'Meal Management')}
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
              onClick={handleCreateNewMeal}
              size={isMobile ? 'icon' : 'default'}
              className="shrink-0"
              title={t('mealManagement.createNewMeal', 'Create New Meal')}
            >
              <Plus className={isMobile ? 'h-5 w-5' : 'mr-2 h-4 w-4'} />
              {!isMobile && (
                <span>
                  {t('mealManagement.createNewMeal', 'Create New Meal')}
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              placeholder={t(
                'mealManagement.searchMealsPlaceholder',
                'Search meals...'
              )}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                clearSelection();
                setRowSelection({});
              }}
              className="flex-1 min-w-[200px]"
            />
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select
                value={filter}
                onValueChange={(value: MealFilter) => {
                  setFilter(value);
                  clearSelection();
                  setRowSelection({});
                }}
              >
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('mealManagement.all', 'All')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('mealManagement.all', 'All')}
                  </SelectItem>
                  <SelectItem value="mine">
                    {t('mealManagement.myMeals', 'My Meals')}
                  </SelectItem>
                  <SelectItem value="family">
                    {t('mealManagement.family', 'Family')}
                  </SelectItem>
                  <SelectItem value="public">
                    {t('mealManagement.public', 'Public')}
                  </SelectItem>
                  <SelectItem value="needs-review">
                    {t('mealManagement.needsReview', 'Needs Review')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredMeals.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {t('mealManagement.noMealsFound', 'No meals found. Create one!')}
            </p>
          ) : (
            <DataTable
              titleColumnId="name"
              onRowDoubleClick={handleViewDetails}
              rowSelection={rowSelection}
              onRowSelectionChange={setRowSelection}
              columns={
                isEditMode ? columns : columns.filter((c) => c.id !== 'select')
              }
              data={filteredMeals}
            />
          )}
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={editableMealIds.length}
        allSelected={allSelected}
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked) {
            selectAll(editableMealIds);
            const newSelection: RowSelectionState = {};
            filteredMeals.forEach((meal, index) => {
              if (meal.id) newSelection[index] = true;
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
        entityName={t('mealManagement.meals', 'meals')}
        onConfirm={handleBulkDeleteConfirm}
      />
      <Dialog
        open={showMealBuilderDialog}
        onOpenChange={setShowMealBuilderDialog}
      >
        <DialogContent
          requireConfirmation
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {editingMealId
                ? t('mealManagement.editMealDialogTitle', 'Edit Meal')
                : t(
                    'mealManagement.createNewMealDialogTitle',
                    'Create New Meal'
                  )}
            </DialogTitle>
            <DialogDescription>
              {editingMealId
                ? t(
                    'mealManagement.editMealDialogDescription',
                    'Edit the details of your meal.'
                  )
                : t(
                    'mealManagement.createNewMealDialogDescription',
                    'Create a new meal by adding foods.'
                  )}
            </DialogDescription>
          </DialogHeader>
          <MealBuilder
            mealId={editingMealId}
            onSave={handleMealSave}
            onCancel={handleMealCancel}
          />
        </DialogContent>
      </Dialog>

      {/* View Meal Details Dialog */}
      <Dialog
        open={!!viewingMeal}
        onOpenChange={(isOpen) => !isOpen && setViewingMeal(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingMeal?.name}</DialogTitle>
            <DialogDescription>
              {viewingMeal?.description ||
                t(
                  'mealManagement.noDescriptionProvided',
                  'No description provided.'
                )}
            </DialogDescription>
          </DialogHeader>
          <div>
            <h4 className="font-semibold mb-2">
              {t('mealManagement.foodsInThisMeal', 'Foods in this Meal:')}
            </h4>
            {viewingMeal?.foods && viewingMeal.foods.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {viewingMeal.foods.map((food, index) => (
                  <li key={index}>
                    {food.quantity} {food.unit} - {food.food_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {t(
                  'mealManagement.noFoodsAddedToMealYet',
                  'No foods have been added to this meal yet.'
                )}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!mealToDelete}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setMealToDelete(null);
            setDeletionImpact(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('mealManagement.deleteMealDialogTitle', 'Delete Meal')}
            </DialogTitle>
          </DialogHeader>
          {deletionImpact && (
            <div>
              {deletionImpact.usedByOtherUsers ? (
                <p>
                  {t(
                    'mealManagement.usedByOtherUsersWarning',
                    'This meal is used in meal plans by other users. You can only hide it, which will prevent it from being used in the future.'
                  )}
                </p>
              ) : deletionImpact.usedByCurrentUser ? (
                <p>
                  {t(
                    'mealManagement.usedByCurrentUserWarning',
                    'This meal is used in your meal plans. Deleting it will remove it from those plans.'
                  )}
                </p>
              ) : (
                <p>
                  {t(
                    'mealManagement.confirmPermanentDelete',
                    'Are you sure you want to permanently delete this meal?'
                  )}
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end space-x-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setMealToDelete(null);
                setDeletionImpact(null);
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            {deletionImpact?.usedByOtherUsers ? (
              <Button
                variant="destructive"
                onClick={() => handleDeleteMeal(mealToDelete!)}
              >
                {t('mealManagement.hide', 'Hide')}
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() =>
                  handleDeleteMeal(
                    mealToDelete!,
                    deletionImpact?.usedByCurrentUser
                  )
                }
              >
                {t('mealManagement.delete', 'Delete')}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default MealManagement;
