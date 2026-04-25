// hooks/useFoodDatabaseManager.ts
import { useState } from 'react';
import { formatDateToYYYYMMDD } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from '@/hooks/use-toast';
import { info } from '@/utils/logging';
import type { Food, FoodVariant, FoodDeletionImpact } from '@/types/food';
import { MealFilter } from '@/types/meal';
import type { Meal } from '@/types/meal';
import {
  foodDeletionImpactOptions,
  useCreateFoodMutation,
  useDeleteFoodMutation,
  useFoods,
  useToggleFoodPublicMutation,
} from '@/hooks/Foods/useFoods';
import { useQueryClient } from '@tanstack/react-query';

export function useFoodDatabaseManager() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { nutrientDisplayPreferences, loggingLevel } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? 'mobile' : 'desktop';
  const queryClient = useQueryClient();

  const quickInfoPreferences =
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === platform
    ) ||
    nutrientDisplayPreferences.find(
      (p) => p.view_group === 'quick_info' && p.platform === 'desktop'
    );

  const visibleNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : ['calories', 'protein', 'carbs', 'fat', 'dietary_fiber'];

  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(isMobile ? 5 : 10);
  const [currentPage, setCurrentPage] = useState(1);
  const [foodFilter, setFoodFilter] = useState<MealFilter>('all');
  const [sortOrder, setSortOrder] = useState<string>('name:asc');

  const [showFoodSearchDialog, setShowFoodSearchDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [showFoodUnitSelectorDialog, setShowFoodUnitSelectorDialog] =
    useState(false);
  const [foodToAddToMeal, setFoodToAddToMeal] = useState<Food | null>(null);

  const [pendingDeletion, setPendingDeletion] = useState<{
    food: Food;
    impact: FoodDeletionImpact;
  } | null>(null);

  const { data: foodData, isLoading: loading } = useFoods(
    searchTerm,
    foodFilter,
    currentPage,
    itemsPerPage,
    sortOrder
  );
  const { mutate: togglePublicSharing } = useToggleFoodPublicMutation();
  const { mutateAsync: deleteFood } = useDeleteFoodMutation();
  const { mutateAsync: createFoodEntry } = useCreateFoodMutation();

  const totalPages = foodData
    ? Math.ceil(foodData.totalCount / itemsPerPage)
    : 0;

  const canEdit = (food: Food) => food.user_id === user?.id;

  const handlePageChange = (page: number, pageSize?: number) => {
    if (pageSize !== undefined && pageSize !== itemsPerPage) {
      setItemsPerPage(pageSize);
      setCurrentPage(1);
    } else {
      setCurrentPage(page);
    }
  };

  const handleEdit = (food: Food) => {
    setEditingFood(food);
    setShowEditDialog(true);
  };

  const handleSaveComplete = () => {
    setShowEditDialog(false);
    setEditingFood(null);
  };

  const handleFoodSelected = (item: Food | Meal, type: 'food' | 'meal') => {
    setShowFoodSearchDialog(false);
    if (type === 'food') {
      setFoodToAddToMeal(item as Food);
      setShowFoodUnitSelectorDialog(true);
    }
  };

  const handleAddFoodToMeal = async (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant
  ) => {
    if (!user || !activeUserId) {
      toast({
        title: t('common.error', 'Error'),
        description: t(
          'foodDatabaseManager.userNotAuthenticated',
          'User not authenticated.'
        ),
        variant: 'destructive',
      });
      return;
    }

    await createFoodEntry({
      foodData: {
        food_id: food.id!,
        meal_type: 'breakfast',
        quantity,
        unit,
        entry_date: formatDateToYYYYMMDD(new Date()),
        variant_id: selectedVariant.id || null,
      },
    });

    setShowFoodUnitSelectorDialog(false);
    setFoodToAddToMeal(null);
  };

  const handleDeleteRequest = async (food: Food) => {
    if (!user || !activeUserId) return;
    const impact = await queryClient.fetchQuery(
      foodDeletionImpactOptions(food.id)
    );
    setPendingDeletion({ food, impact });
  };

  const handleConfirmDelete = async (force: boolean = false) => {
    if (!pendingDeletion || !activeUserId) return;
    info(loggingLevel, `confirmDelete called with force: ${force}`);
    await deleteFood({ foodId: pendingDeletion.food.id, force });
    setPendingDeletion(null);
  };

  const handleCancelDelete = () => setPendingDeletion(null);

  return {
    user,
    isAuthenticated: !!user && !!activeUserId,
    isMobile,
    visibleNutrients,
    searchTerm,
    setSearchTerm,
    itemsPerPage,
    setItemsPerPage,
    currentPage,
    setCurrentPage,
    foodFilter,
    setFoodFilter,
    sortOrder,
    setSortOrder,
    foodData,
    loading,
    totalPages,
    showFoodSearchDialog,
    setShowFoodSearchDialog,
    showEditDialog,
    setShowEditDialog,
    editingFood,
    showFoodUnitSelectorDialog,
    setShowFoodUnitSelectorDialog,
    foodToAddToMeal,
    pendingDeletion,
    togglePublicSharing,
    canEdit,
    handlePageChange,
    handleEdit,
    handleSaveComplete,
    handleFoodSelected,
    handleAddFoodToMeal,
    handleDeleteRequest,
    handleConfirmDelete,
    handleCancelDelete,
    deleteFood,
  };
}
