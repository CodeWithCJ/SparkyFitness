import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from "react-i18next";
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
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { toast } from '@/hooks/use-toast';
import { debug, info, warn, error } from '@/utils/logging';
import { Meal, MealFood, MealPayload } from '@/types/meal';
import { getMeals, deleteMeal, getMealById, MealFilter, getMealDeletionImpact, updateMeal } from '@/services/mealService';
import { MealDeletionImpact } from '@/types/meal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import MealBuilder from './MealBuilder';

// This component is now a standalone library for managing meal templates.
// Interactions with the meal plan calendar are handled by the calendar itself.
const MealManagement: React.FC = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { loggingLevel } = usePreferences();
  const [meals, setMeals] = useState<Meal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<MealFilter>('all');
  const [editingMealId, setEditingMealId] = useState<string | undefined>(undefined);
  const [showMealBuilderDialog, setShowMealBuilderDialog] = useState(false);
  const [viewingMeal, setViewingMeal] = useState<Meal & { foods?: MealFood[] } | null>(null);
  const [deletionImpact, setDeletionImpact] = useState<MealDeletionImpact | null>(null);
  const [mealToDelete, setMealToDelete] = useState<string | null>(null);

  const fetchMeals = useCallback(async () => {
    if (!activeUserId) return;
    try {
      const fetchedMeals = await getMeals(activeUserId, filter);
      setMeals(fetchedMeals || []); // Ensure it's always an array
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meals:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.failedToLoadMeals', 'Failed to load meals.'),
        variant: 'destructive',
      });
    }
  }, [activeUserId, loggingLevel, filter]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  const handleCreateNewMeal = () => {
    setEditingMealId(undefined);
    setShowMealBuilderDialog(true);
  };

  const handleEditMeal = (mealId: string) => {
    setEditingMealId(mealId);
    setShowMealBuilderDialog(true);
  };

  const handleDeleteMeal = async (mealId: string, force: boolean = false) => {
    if (!activeUserId) return;
    try {
      const result = await deleteMeal(activeUserId, mealId, force);
      toast({
        title: t('common.success', 'Success'),
        description: result.message,
      });
      fetchMeals();
    } catch (err) {
      error(loggingLevel, 'Failed to delete meal:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.failedToDeleteMeal', { errorMessage: err instanceof Error ? err.message : String(err), defaultValue: `Failed to delete meal: ${err instanceof Error ? err.message : String(err)}` }),
        variant: 'destructive',
      });
    } finally {
      setMealToDelete(null);
      setDeletionImpact(null);
    }
  };

  const openDeleteConfirmation = async (mealId: string) => {
    if (!activeUserId) return;
    try {
      const impact = await getMealDeletionImpact(activeUserId, mealId);
      setDeletionImpact(impact);
      setMealToDelete(mealId);
    } catch (err) {
      error(loggingLevel, 'Failed to get meal deletion impact:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.couldNotCheckMealUsage', 'Could not check meal usage.'),
        variant: 'destructive',
      });
    }
  };

  const handleMealSave = (meal: Meal) => {
    setShowMealBuilderDialog(false);
    fetchMeals();
    toast({
      title: t('common.success', 'Success'),
      description: t('mealManagement.mealSavedSuccessfully', { mealName: meal.name, defaultValue: `Meal "${meal.name}" saved successfully.` }),
    });
  };

  const handleMealCancel = () => {
    setShowMealBuilderDialog(false);
  };

  const handleViewDetails = async (meal: Meal) => {
    if (!activeUserId) return;
    try {
      // Fetch full meal details including foods
      const fullMeal = await getMealById(activeUserId, meal.id!);
      setViewingMeal(fullMeal);
    } catch (err) {
      error(loggingLevel, 'Failed to fetch meal details:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.couldNotLoadMealDetails', 'Could not load meal details.'),
        variant: 'destructive',
      });
    }
  };

  const handleShareMeal = async (mealId: string) => {
    if (!activeUserId) return;
    try {
      const mealToUpdate = await getMealById(activeUserId, mealId);
      if (!mealToUpdate) {
        throw new Error('Meal not found.');
      }
      const mealPayload: MealPayload = {
        name: mealToUpdate.name,
        description: mealToUpdate.description,
        is_public: true,
        foods: mealToUpdate.foods?.map(food => ({
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
      await updateMeal(activeUserId, mealId, mealPayload);
      toast({
        title: t('common.success', 'Success'),
        description: t('mealManagement.mealSharedPublicly', 'Meal shared publicly.'),
      });
      fetchMeals();
    } catch (err) {
      error(loggingLevel, 'Failed to share meal:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.failedToShareMeal', { errorMessage: err instanceof Error ? err.message : String(err), defaultValue: `Failed to share meal: ${err instanceof Error ? err.message : String(err)}` }),
        variant: 'destructive',
      });
    }
  };

  const handleUnshareMeal = async (mealId: string) => {
    if (!activeUserId) return;
    try {
      const mealToUpdate = await getMealById(activeUserId, mealId);
      if (!mealToUpdate) {
        throw new Error('Meal not found.');
      }
      const mealPayload: MealPayload = {
        name: mealToUpdate.name,
        description: mealToUpdate.description,
        is_public: false,
        foods: mealToUpdate.foods?.map(food => ({
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
      await updateMeal(activeUserId, mealId, mealPayload);
      toast({
        title: t('common.success', 'Success'),
        description: t('mealManagement.mealUnshared', 'Meal unshared.'),
      });
      fetchMeals();
    } catch (err) {
      error(loggingLevel, 'Failed to unshare meal:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('mealManagement.failedToUnshareMeal', { errorMessage: err instanceof Error ? err.message : String(err), defaultValue: `Failed to unshare meal: ${err instanceof Error ? err.message : String(err)}` }),
        variant: 'destructive',
      });
    }
  };




  const filteredMeals = meals.filter(meal =>
    meal.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t('mealManagement.manageMeals', 'Meal Management')}</CardTitle>
          <Button onClick={handleCreateNewMeal}>
            <Plus className="mr-2 h-4 w-4" /> {t('mealManagement.createNewMeal', 'Create New Meal')}
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 mb-4">
            <Input
              placeholder={t('mealManagement.searchMealsPlaceholder', 'Search meals...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-[200px]"
            />
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <Select value={filter} onValueChange={(value: MealFilter) => setFilter(value)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder={t('mealManagement.all', 'All')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('mealManagement.all', 'All')}</SelectItem>
                  <SelectItem value="mine">{t('mealManagement.myMeals', 'My Meals')}</SelectItem>
                  <SelectItem value="family">{t('mealManagement.family', 'Family')}</SelectItem>
                  <SelectItem value="public">{t('mealManagement.public', 'Public')}</SelectItem>
                  <SelectItem value="needs-review">{t('mealManagement.needsReview', 'Needs Review')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredMeals.length === 0 ? (
            <p className="text-center text-muted-foreground">{t('mealManagement.noMealsFound', 'No meals found. Create one!')}</p>
          ) : (
            <div className="space-y-4">
              {filteredMeals.map(meal => (
                <Card key={meal.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">
                        {meal.name}
                        {meal.is_public && <Badge variant="secondary" className="ml-2"><Share2 className="h-3 w-3 mr-1" />{t('mealManagement.public', 'Public')}</Badge>}
                      </h3>
                      <p className="text-sm text-muted-foreground">{meal.description || t('mealManagement.noDescription', { defaultValue: 'No description' })}</p>

                      {/* Nutrition Display */}
                      <div className="flex gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0;
                          if (meal.foods) {
                            meal.foods.forEach(f => {
                              const scale = f.quantity / (f.serving_size || 1);
                              totalCalories += (f.calories || 0) * scale;
                              totalProtein += (f.protein || 0) * scale;
                              totalCarbs += (f.carbs || 0) * scale;
                              totalFat += (f.fat || 0) * scale;
                            });
                          }
                          return (
                            <>
                              <div className="whitespace-nowrap">
                                <span className="font-medium text-gray-900 dark:text-gray-100">{Math.round(totalCalories)}</span> kcal
                              </div>
                              <div className="whitespace-nowrap">
                                <span className="font-medium text-blue-600">{totalProtein.toFixed(1)}g</span> protein
                              </div>
                              <div className="whitespace-nowrap">
                                <span className="font-medium text-orange-600">{totalCarbs.toFixed(1)}g</span> carbs
                              </div>
                              <div className="whitespace-nowrap">
                                <span className="font-medium text-yellow-600">{totalFat.toFixed(1)}g</span> fat
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      {meal.is_public ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => handleUnshareMeal(meal.id!)}>
                              <Share2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{t('mealManagement.unshareMeal', 'Unshare Meal')}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" onClick={() => handleShareMeal(meal.id!)}>
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
                          <Button variant="outline" size="icon" onClick={() => handleEditMeal(meal.id!)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mealManagement.editMeal', 'Edit Meal')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={() => openDeleteConfirmation(meal.id!)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mealManagement.deleteMeal', 'Delete Meal')}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="outline" size="icon" onClick={() => handleViewDetails(meal)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('mealManagement.viewMealDetails', 'View Meal Details')}</p>
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
      <Dialog open={showMealBuilderDialog} onOpenChange={setShowMealBuilderDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingMealId ? t('mealManagement.editMealDialogTitle', 'Edit Meal') : t('mealManagement.createNewMealDialogTitle', 'Create New Meal')}</DialogTitle>
            <DialogDescription>
              {editingMealId ? t('mealManagement.editMealDialogDescription', 'Edit the details of your meal.') : t('mealManagement.createNewMealDialogDescription', 'Create a new meal by adding foods.')}
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
      <Dialog open={!!viewingMeal} onOpenChange={(isOpen) => !isOpen && setViewingMeal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingMeal?.name}</DialogTitle>
            <DialogDescription>
              {viewingMeal?.description || t('mealManagement.noDescriptionProvided', 'No description provided.')}
            </DialogDescription>
          </DialogHeader>
          <div>
            <h4 className="font-semibold mb-2">{t('mealManagement.foodsInThisMeal', 'Foods in this Meal:')}</h4>
            {viewingMeal?.foods && viewingMeal.foods.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1">
                {viewingMeal.foods.map((food, index) => (
                  <li key={index}>
                    {food.quantity} {food.unit} - {food.food_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">{t('mealManagement.noFoodsAddedToMealYet', 'No foods have been added to this meal yet.')}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!mealToDelete} onOpenChange={(isOpen) => { if (!isOpen) { setMealToDelete(null); setDeletionImpact(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('mealManagement.deleteMealDialogTitle', 'Delete Meal')}</DialogTitle>
          </DialogHeader>
          {deletionImpact && (
            <div>
              {deletionImpact.usedByOtherUsers ? (
                <p>{t('mealManagement.usedByOtherUsersWarning', 'This meal is used in meal plans by other users. You can only hide it, which will prevent it from being used in the future.')}</p>
              ) : deletionImpact.usedByCurrentUser ? (
                <p>{t('mealManagement.usedByCurrentUserWarning', 'This meal is used in your meal plans. Deleting it will remove it from those plans.')}</p>
              ) : (
                <p>{t('mealManagement.confirmPermanentDelete', 'Are you sure you want to permanently delete this meal?')}</p>
              )}
            </div>
          )}
          <div className="flex justify-end space-x-2 mt-4">
            <Button variant="outline" onClick={() => { setMealToDelete(null); setDeletionImpact(null); }}>{t('common.cancel', 'Cancel')}</Button>
            {deletionImpact?.usedByOtherUsers ? (
              <Button variant="destructive" onClick={() => handleDeleteMeal(mealToDelete!)}>{t('mealManagement.hide', 'Hide')}</Button>
            ) : (
              <Button variant="destructive" onClick={() => handleDeleteMeal(mealToDelete!, deletionImpact?.usedByCurrentUser)}>{t('mealManagement.delete', 'Delete')}</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default MealManagement;