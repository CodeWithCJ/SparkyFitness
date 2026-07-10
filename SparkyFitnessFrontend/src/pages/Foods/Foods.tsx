import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Filter,
  CheckSquare,
  X,
  Share2,
  Lock,
  Eye,
  MoreHorizontal,
  Edit,
  Copy,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import MealManagement from './MealManagement';
import MealPlanCalendar from './MealPlanCalendar';
import CustomFoodForm from '@/components/FoodSearch/CustomFoodForm';
import { Meal, MealFilter } from '@/types/meal';
import { useFoodDatabaseManager } from '@/hooks/Foods/useFoodDatabaseManager';
import DeleteFoodDialog, { PendingDeletion } from './DeleteFoodDialog';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import AllergenBadges from '@/components/AllergenBadges';

import { useBulkSelection } from '@/hooks/useBulkSelection';
import BulkActionToolbar from '@/components/BulkActionToolbar';
import BulkDeleteDialog from '@/components/BulkDeleteDialog';
import { DataTable } from '@/components/ui/DataTable';
import {
  ColumnDef,
  RowSelectionState,
  CellContext,
} from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';
import { Badge } from '@/components/ui/badge';
import type { Food, FoodVariant } from '@/types/food';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCustomNutrients } from '@/hooks/Foods/useCustomNutrients';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

const FoodDatabaseManager = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [viewingFood, setViewingFood] = useState<Food | null>(null);
  const { data: customNutrients = [] } = useCustomNutrients();

  const {
    user,
    isAuthenticated,
    visibleNutrients,
    searchTerm,
    setSearchTerm,
    itemsPerPage,
    currentPage,
    foodFilter,
    setFoodFilter,
    sortOrder,
    setSortOrder,
    foodData,
    loading,
    totalPages,
    pendingDeletion,
    handleConfirmDelete,
    handleCancelDelete,
    showFoodSearchDialog,
    setShowFoodSearchDialog,
    showEditDialog,
    setShowEditDialog,
    editingFood,
    showFoodUnitSelectorDialog,
    setShowFoodUnitSelectorDialog,
    handleFoodSelected,
    foodToAddToMeal,
    togglePublicSharing,
    canEdit,
    handlePageChange,
    handleEdit,
    handleDuplicate,
    handleDuplicateComplete,
    showDuplicateDialog,
    duplicatingFood,
    isDuplicating,
    handleSaveComplete,
    handleAddFoodToMeal,
    handleDeleteRequest,
    deleteFood,
  } = useFoodDatabaseManager();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Sync rowSelection with useBulkSelection
  // Since we use getRowId={(row) => row.id}, rowSelection keys are food IDs.
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

  // Clear table selection when exiting edit mode
  useEffect(() => {
    if (!isEditMode) {
      setRowSelection({});
    }
  }, [isEditMode]);

  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);

  const editableFoodIds = useMemo(() => {
    return foodData?.foods.filter((f) => canEdit(f)).map((f) => f.id) || [];
  }, [foodData, canEdit]);

  const allSelected =
    editableFoodIds.length > 0 && selectedCount === editableFoodIds.length;

  const handleBulkDeleteConfirm = async () => {
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          deleteFood({ foodId: id, force: true })
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

  const getFoodSourceBadge = useCallback(
    (food: Food) => {
      if (!food.user_id) {
        return (
          <Badge variant="outline" className="w-fit text-xs">
            {t('foodDatabaseManager.system', 'System')}
          </Badge>
        );
      }
      if (food.user_id === user?.id && !food.shared_with_public) {
        return (
          <Badge variant="secondary" className="w-fit text-xs">
            {t('foodDatabaseManager.private', 'Private')}
          </Badge>
        );
      }
      return (
        <Badge
          variant="outline"
          className="w-fit bg-blue-50 text-xs text-blue-700"
        >
          {t('foodDatabaseManager.family', 'Family')}
        </Badge>
      );
    },
    [user?.id, t]
  );

  const columns = useMemo<ColumnDef<Food>[]>(
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
              'foodDatabaseManager.selectAllFoods',
              'Select all foods'
            )}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={t(
              'foodDatabaseManager.selectFood',
              'Select {{foodName}}',
              { foodName: row.original.name }
            )}
            disabled={!canEdit(row.original)}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: 'name',
        id: 'name',
        header: t('foodDatabaseManager.name', 'Name'),
        enableSorting: true,
        cell: ({ row }) => {
          const food = row.original;
          return (
            <div className="flex min-w-[150px] flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {food.name}
                </span>
                {food.brand && (
                  <Badge
                    variant="secondary"
                    className="h-5 border border-blue-200/50 bg-blue-100/50 px-1.5 text-[10px] font-black uppercase tracking-tight text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  >
                    {food.brand}
                  </Badge>
                )}
                {getFoodSourceBadge(food)}
                {food.shared_with_public && (
                  <Badge
                    variant="outline"
                    className="h-5 bg-green-50 px-1.5 text-[10px] font-bold text-green-700"
                  >
                    <Share2 className="me-1 h-2.5 w-2.5" aria-hidden="true" />
                    {t('foodDatabaseManager.public', 'Public')}
                  </Badge>
                )}
              </div>
              <span className="text-[10px] text-gray-500">
                {t('foodDatabaseManager.perServing', {
                  servingSize: food.default_variant?.serving_size || 0,
                  servingUnit: food.default_variant?.serving_unit || '',
                  defaultValue: `Per ${food.default_variant?.serving_size || 0} ${food.default_variant?.serving_unit || ''}`,
                })}
              </span>
              <AllergenBadges
                allergens={food.default_variant?.allergens}
                traces={food.default_variant?.traces}
              />
            </div>
          );
        },
      },
      ...visibleNutrients.map((nutrient) => {
        const meta = getNutrientMetadata(nutrient, customNutrients);
        const isCustom = meta.group === 'custom';

        return {
          id: nutrient,
          header: () => (
            <div className="flex flex-col text-center">
              <span>{t(meta.label, meta.defaultLabel)}</span>
              <span className="text-[10px] font-normal text-muted-foreground">
                ({getLocalizedUnitLabel(meta.unit, t)})
              </span>
            </div>
          ),
          accessorFn: (row: Food) => {
            if (isCustom) {
              return row.default_variant?.custom_nutrients?.[nutrient] || 0;
            }
            return (
              (row.default_variant?.[
                nutrient as keyof FoodVariant
              ] as number) || 0
            );
          },
          cell: (info: CellContext<Food, unknown>) => (
            <div className="text-center">
              <span className={`font-medium ${meta.color}`}>
                {formatNutrientValue(
                  nutrient,
                  info.getValue() as number,
                  customNutrients
                )}
              </span>
            </div>
          ),
          meta: {
            hideOnMobile: false,
          },
          // Sorting is disabled for dietary_fiber and custom nutrients as requested
          enableSorting: !isCustom && nutrient !== 'dietary_fiber',
        };
      }),
      {
        id: 'actions',
        header: t('common.actions', 'Actions'),
        cell: ({ row }) => {
          const food = row.original;
          const isEditable = canEdit(food);
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  aria-label={t(
                    'foodDatabaseManager.openFoodActions',
                    'Open actions for {{foodName}}',
                    { foodName: food.name }
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {t('common.actions', 'Actions')}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setViewingFood(food)}>
                  <Eye className="me-2 h-4 w-4" />
                  {t('common.view', 'View details')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isEditable}
                  onClick={() => handleEdit(food)}
                >
                  <Edit className="me-2 h-4 w-4" />
                  {t('foodDatabaseManager.editFood', 'Edit food')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isDuplicating}
                  onClick={() => handleDuplicate(food)}
                >
                  <Copy className="me-2 h-4 w-4" />
                  {t('foodDatabaseManager.duplicateFood', 'Duplicate food')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!isEditable}
                  onClick={() =>
                    togglePublicSharing({
                      foodId: food.id,
                      currentState: food.shared_with_public || false,
                    })
                  }
                >
                  {food.shared_with_public ? (
                    <>
                      <Lock className="me-2 h-4 w-4" />
                      {t('foodDatabaseManager.makePrivate', 'Make private')}
                    </>
                  ) : (
                    <>
                      <Share2 className="me-2 h-4 w-4" />
                      {t(
                        'foodDatabaseManager.shareWithPublic',
                        'Share with public'
                      )}
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!isEditable}
                  className="text-destructive focus:text-destructive"
                  onClick={() => handleDeleteRequest(food)}
                >
                  <Trash2 className="me-2 h-4 w-4" />
                  {t('foodDatabaseManager.deleteFood', 'Delete food')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        },
      },
    ],
    [
      visibleNutrients,
      t,
      canEdit,
      handleEdit,
      handleDuplicate,
      isDuplicating,
      handleDeleteRequest,
      togglePublicSharing,
      getFoodSourceBadge,
      customNutrients,
    ]
  );

  const displayColumns = useMemo(
    () => (isEditMode ? columns : columns.filter((c) => c.id !== 'select')),
    [isEditMode, columns]
  );

  if (!isAuthenticated) {
    return (
      <div>
        {t('foodDatabaseManager.pleaseSignInToManageFoodDatabase', '...')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Food Database Section */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold tracking-tight sm:text-2xl">
            {t('foodDatabaseManager.foodDatabase', 'Food Database')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Controls */}
          <div className="mb-4 flex flex-col gap-4">
            <div className="flex flex-row flex-wrap items-center gap-4">
              <div className="relative min-w-[180px] flex-1">
                <Search className="absolute start-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t(
                    'foodDatabaseManager.searchFoodsPlaceholder',
                    'Search foods...'
                  )}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="ps-10"
                />
              </div>

              {/* Filter dropdown */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select
                  value={foodFilter}
                  onValueChange={(value: MealFilter) => {
                    setFoodFilter(value);
                    clearSelection();
                    setRowSelection({});
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue
                      placeholder={t('foodDatabaseManager.all', 'All')}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {t('foodDatabaseManager.all', 'All')}
                    </SelectItem>
                    <SelectItem value="mine">
                      {t('foodDatabaseManager.myFoods', 'My Foods')}
                    </SelectItem>
                    <SelectItem value="family">
                      {t('foodDatabaseManager.family', 'Family')}
                    </SelectItem>
                    <SelectItem value="public">
                      {t('foodDatabaseManager.public', 'Public')}
                    </SelectItem>
                    <SelectItem value="needs-review">
                      {t('foodDatabaseManager.needsReview', 'Needs Review')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="ms-auto flex shrink-0 gap-2">
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
                  aria-label={
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
                  size={isMobile ? 'icon' : 'default'}
                  onClick={() => setShowFoodSearchDialog(true)}
                  className="shrink-0"
                  title={t('foodDatabaseManager.addNewFood', 'Add New Food')}
                  aria-label={t(
                    'foodDatabaseManager.addNewFood',
                    'Add New Food'
                  )}
                >
                  <Plus className={isMobile ? 'h-5 w-5' : 'me-2 h-4 w-4'} />
                  {!isMobile && (
                    <span>
                      {t('foodDatabaseManager.addNewFood', 'Add New Food')}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <DataTable
            titleColumnId="name"
            getRowId={(row) => row.id}
            onRowDoubleClick={setViewingFood}
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
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
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
            data={foodData?.foods || []}
            isLoading={loading}
            manualPagination
            pageCount={totalPages}
            onPaginationChange={(pageIndex, pageSize) => {
              handlePageChange(pageIndex + 1, pageSize);
            }}
          />
        </CardContent>
      </Card>

      <BulkActionToolbar
        selectedCount={selectedCount}
        totalCount={editableFoodIds.length}
        allSelected={allSelected}
        onClear={() => {
          clearSelection();
          setRowSelection({});
        }}
        onDelete={() => setShowBulkDeleteDialog(true)}
        onSelectAll={(checked) => {
          if (checked) {
            selectAll(editableFoodIds);
            // Sync with table
            const newSelection: RowSelectionState = {};
            foodData?.foods.forEach((food) => {
              if (canEdit(food)) newSelection[food.id] = true;
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
        entityName={t('foodDatabaseManager.foods', 'foods')}
        onConfirm={handleBulkDeleteConfirm}
      />

      {/* Meal Management Section */}
      <MealManagement />

      {/* Meal Plan Calendar Section */}
      <MealPlanCalendar />

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent
          requireConfirmation
          className="max-h-[90vh] max-w-4xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {t('foodDatabaseManager.editFoodDialogTitle', 'Edit Food')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'foodDatabaseManager.editFoodDialogDescription',
                'Edit the details of the selected food item.'
              )}
            </DialogDescription>
          </DialogHeader>
          {editingFood && (
            <CustomFoodForm food={editingFood} onSave={handleSaveComplete} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDuplicateDialog}
        onOpenChange={(open) => {
          if (!open) handleDuplicateComplete();
        }}
      >
        <DialogContent
          requireConfirmation
          className="max-h-[90vh] max-w-4xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {t(
                'foodDatabaseManager.duplicateFoodDialogTitle',
                'Duplicate Food'
              )}
            </DialogTitle>
            <DialogDescription>
              {t(
                'foodDatabaseManager.duplicateFoodDialogDescription',
                'Adjust the details and save this as a new food. The original is not changed.'
              )}
            </DialogDescription>
          </DialogHeader>
          {duplicatingFood && (
            <CustomFoodForm
              food={duplicatingFood}
              onSave={handleDuplicateComplete}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* FoodUnitSelector Dialog */}
      {foodToAddToMeal && (
        <FoodUnitSelector
          food={foodToAddToMeal}
          open={showFoodUnitSelectorDialog}
          onOpenChange={setShowFoodUnitSelectorDialog}
          onSelect={handleAddFoodToMeal}
        />
      )}

      <FoodSearchDialog
        open={showFoodSearchDialog}
        onOpenChange={setShowFoodSearchDialog}
        onFoodSelect={(item: Food | Meal, type: 'food' | 'meal') =>
          handleFoodSelected(item, type)
        }
        title={t(
          'foodDatabaseManager.addFoodToDatabaseTitle',
          'Add Food to Database'
        )}
        description={t(
          'foodDatabaseManager.addFoodToDatabaseDescription',
          'Search for foods to add to your personal database.'
        )}
        hideDatabaseTab={true}
        hideMealTab={true}
      />

      <DeleteFoodDialog
        pendingDeletion={pendingDeletion as PendingDeletion | null}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <Dialog
        open={!!viewingFood}
        onOpenChange={(open) => !open && setViewingFood(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              {viewingFood?.name}
              {viewingFood?.brand && (
                <Badge
                  variant="secondary"
                  className="text-sm font-black uppercase tracking-tight bg-blue-100 text-blue-700"
                >
                  {viewingFood.brand}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewingFood && getFoodSourceBadge(viewingFood)}
              <div className="mt-2 text-base font-medium text-gray-600">
                {t('foodDatabaseManager.perServing', {
                  servingSize: viewingFood?.default_variant?.serving_size || 0,
                  servingUnit: viewingFood?.default_variant?.serving_unit || '',
                })}
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Array.from(
              new Set([
                ...visibleNutrients,
                ...Object.keys(
                  viewingFood?.default_variant?.custom_nutrients || {}
                ),
              ])
            ).map((nutrient) => {
              const meta = getNutrientMetadata(nutrient, customNutrients);
              const val =
                (viewingFood?.default_variant?.[
                  nutrient as keyof FoodVariant
                ] as number) ||
                Number(
                  viewingFood?.default_variant?.custom_nutrients?.[nutrient]
                ) ||
                0;

              if (val === 0 && !visibleNutrients.includes(nutrient))
                return null;

              return (
                <div
                  key={nutrient}
                  className="flex flex-col rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"
                >
                  <span className="mb-1 text-[10px] font-bold uppercase text-gray-500">
                    {t(meta.label, meta.defaultLabel)}
                  </span>
                  <span className={cn('text-lg font-bold', meta.color)}>
                    {formatNutrientValue(nutrient, val, customNutrients)}
                    <span className="ms-1 text-xs font-normal text-gray-400">
                      {getLocalizedUnitLabel(meta.unit, t)}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex justify-end">
            <Button variant="outline" onClick={() => setViewingFood(null)}>
              {t('common.close', 'Close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FoodDatabaseManager;
