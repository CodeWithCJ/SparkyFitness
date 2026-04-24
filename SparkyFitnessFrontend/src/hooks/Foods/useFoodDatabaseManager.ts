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
    : ['calories', 'protein', 'carbs', 'fat'];

  const [searchTerm, setSearchTerm] = useState('');
  const [itemsPerPage, setItemsPerPage] = useState(10);
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

  const getPageNumbers = (current: number, total: number): number[] => {
    if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 3) return [1, 2, 3, 4, 5];
    if (current >= total - 2)
      return [total - 4, total - 3, total - 2, total - 1, total];
    return [current - 2, current - 1, current, current + 1, current + 2];
  };

  const getEmptyMessage = () => {
    switch (foodFilter) {
      case 'mine':
        return t(
          'foodDatabaseManager.noFoodsCreatedByYouFound',
          'No foods created by you found'
        );
      case 'family':
        return t(
          'foodDatabaseManager.noFamilyFoodsFound',
          'No family foods found'
        );
      case 'public':
        return t(
          'foodDatabaseManager.noPublicFoodsFound',
          'No public foods found'
        );
      case 'needs-review':
        return t(
          'foodDatabaseManager.noFoodsNeedYourReview',
          'No foods need your review'
        );
      default:
        return t('foodDatabaseManager.noFoodsFound', 'No foods found');
    }
  };

  const handlePageChange = (page: number) => setCurrentPage(page);

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
    getPageNumbers,
    getEmptyMessage,
    handlePageChange,
    handleEdit,
    handleSaveComplete,
    handleFoodSelected,
    handleAddFoodToMeal,
    handleDeleteRequest,
    handleConfirmDelete,
    handleCancelDelete,
  };
}
