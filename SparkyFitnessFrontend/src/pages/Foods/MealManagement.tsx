import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Edit, Trash2, Eye, Filter, Share2, Lock } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { error } from '@/utils/logging';
import type { Meal, MealFood, MealPayload } from '@/types/meal';
import { type MealFilter } from '@/api/Foods/meals';
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
import { mealKeys } from '@/api/keys/meals';
import {
  getNutrientMetadata,
  formatNutrientValue,
} from '@/utils/nutrientUtils';

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

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop'
    );

  const visibleNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : ['calories', 'protein', 'carbs', 'fat'];

  const { data: meals } = useMeals(filter);
  const { mutateAsync: deleteMeal } = useDeleteMealMutation();
  const { mutateAsync: updateMeal } = useUpdateMealMutation();
  const queryClient = useQueryClient();

  const handleCreateNewMeal = () => {
    setEditingMealId(undefined);
    setShowMealBuilderDialog(true);
  };

  const handleEditMeal = (mealId: string) => {
    setEditingMealId(mealId);
    setShowMealBuilderDialog(true);
  };

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

  const openDeleteConfirmation = async (mealId: string) => {
    try {
      const impact = await queryClient.fetchQuery(
        mealDeletionImpactOptions(mealId)
      );
      setDeletionImpact(impact);
      setMealToDelete(mealId);
    } catch (err) {
      error(loggingLevel, 'Failed to get meal deletion impact:', err);
    }
  };

  const handleMealSave = (meal: Meal) => {
    setShowMealBuilderDialog(false);
    queryClient.invalidateQueries({ queryKey: mealKeys.all });
  };

  const handleMealCancel = () => {
    setShowMealBuilderDialog(false);
  };

  const handleViewDetails = async (meal: Meal) => {
    try {
      // Fetch full meal details including foods
      const fullMeal = await queryClient.fetchQuery(mealViewOptions(meal.id));
      setViewingMeal(fullMeal);
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meal details:', err);
    }
  };

  const handleShareMeal = async (mealId: string) => {
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
  };

  const handleUnshareMeal = async (mealId: string) => {
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
  };

  const filteredMeals = meals
    ? meals.filter((meal) =>
        meal.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : [];

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('mealManagement.manageMeals', 'Meal Management')}
          </CardTitle>
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
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              placeholder={t(
                'mealManagement.searchMealsPlaceholder',
                'Search meals...'
              )}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select
                value={filter}
                onValueChange={(value: MealFilter) => setFilter(value)}
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
            <div className="space-y-4">
              {filteredMeals.map((meal) => (
                <Card key={meal.id}>
                  <CardContent className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold truncate">
                        {meal.name}
                        {meal.is_public && (
                          <Badge
                            variant="secondary"
                            className="ml-2 h-5 px-1.5 text-xs"
                          >
                            <Share2 className="h-3 w-3 mr-1" />
                            {t('mealManagement.public', 'Public')}
                          </Badge>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {meal.description ||
                          t('mealManagement.noDescription', {
                            defaultValue: 'No description',
                          })}
                      </p>

                      {/* Nutrition Display */}
                      <div className="mt-1">
                        <div
                          className="grid gap-y-1 gap-x-2 text-sm text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-1.5"
                          style={{
                            gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? '60px' : '70px'}, 1fr))`,
                          }}
                        >
                          {(() => {
                            // Calculate totals for all visible nutrients
                            const nutrientTotals: Record<string, number> = {};

                            if (meal.foods) {
                              meal.foods.forEach((f) => {
                                const scale =
                                  f.quantity / (f.serving_size || 1);

                                visibleNutrients.forEach((nutrient) => {
                                  // Handle calories separately or as a standard nutrient
                                  // Check standard properties first
                                  let val = 0;
                                  if (
                                    nutrient in f &&
                                    typeof f[nutrient as keyof typeof f] ===
                                      'number'
                                  ) {
                                    val = f[
                                      nutrient as keyof typeof f
                                    ] as number;
                                  } else if (
                                    f.custom_nutrients &&
                                    nutrient in f.custom_nutrients
                                  ) {
                                    // Check custom nutrients
                                    const customVal =
                                      f.custom_nutrients[nutrient];
                                    val =
                                      typeof customVal === 'number'
                                        ? customVal
                                        : Number(customVal) || 0;
                                  }

                                  nutrientTotals[nutrient] =
                                    (nutrientTotals[nutrient] || 0) +
                                    val * scale;
                                });
                              });
                            }

                            return visibleNutrients.map((key) => {
                              const meta = getNutrientMetadata(key);
                              const rawVal = nutrientTotals[key] || 0;
                              const val =
                                key === 'calories'
                                  ? Math.round(
                                      convertEnergy(rawVal, 'kcal', energyUnit)
                                    )
                                  : rawVal;

                              const unit =
                                key === 'calories'
                                  ? getEnergyUnitString(energyUnit)
                                  : meta.unit;

                              return (
                                <div key={key} className="flex flex-col">
                                  <span
                                    className={`font-medium text-sm ${meta.color}`}
                                  >
                                    {key === 'calories'
                                      ? val
                                      : formatNutrientValue(key, val, [])}
                                    <span className="text-xs ml-0.5 text-gray-500">
                                      {unit}
                                    </span>
                                  </span>
                                  <span
                                    className="text-xs text-gray-500 truncate"
                                    title={t(meta.label, meta.defaultLabel)}
                                  >
                                    {t(meta.label, meta.defaultLabel)}
                                  </span>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {meal.is_public ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleUnshareMeal(meal.id!)}
                            >
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {t('mealManagement.unshareMeal', 'Unshare Meal')}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => handleShareMeal(meal.id!)}
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('mealManagement.shareMeal', 'Share Meal')}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleEditMeal(meal.id!)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mealManagement.editMeal', 'Edit Meal')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => openDeleteConfirmation(meal.id!)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mealManagement.deleteMeal', 'Delete Meal')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => handleViewDetails(meal)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              'mealManagement.viewMealDetails',
                              'View Meal Details'
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={showMealBuilderDialog}
        onOpenChange={setShowMealBuilderDialog}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
    </TooltipProvider>
  );
};

export default MealManagement;
