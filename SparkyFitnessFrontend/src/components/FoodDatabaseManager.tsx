import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Search,
  Edit,
  Trash2,
  Plus,
  Share2,
  Users,
  Filter,
  Lock,
} from "lucide-react";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useAuth } from "@/hooks/useAuth";
import { usePreferences } from "@/contexts/PreferencesContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { info } from "@/utils/logging"; // Import the info function
import EnhancedCustomFoodForm from "./EnhancedCustomFoodForm";
import FoodSearchDialog from "./FoodSearchDialog";
import FoodUnitSelector from "./FoodUnitSelector"; // Import FoodUnitSelector
import {
  loadFoods,
  togglePublicSharing,
  deleteFood as deleteFoodService,
  getFoodDeletionImpact,
  FoodFilter,
} from "@/services/foodService";
import { createFoodEntry } from "@/services/foodEntryService"; // Import foodEntryService
import { Food, FoodVariant, FoodDeletionImpact } from "@/types/food";
import MealManagement from "./MealManagement"; // Import MealManagement
import MealPlanCalendar from "./MealPlanCalendar"; // Import MealPlanCalendar

const FoodDatabaseManager: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { nutrientDisplayPreferences, loggingLevel, energyUnit, convertEnergy } = usePreferences();
  const isMobile = useIsMobile();
  const platform = isMobile ? "mobile" : "desktop";

  const getEnergyUnitString = (unit: 'kcal' | 'kJ' = energyUnit): string => {
    return unit === 'kcal' ? t('common.kcalUnit', 'kcal') : t('common.kJUnit', 'kJ');
  };

  const nutrientDetails: {
    [key: string]: { color: string; label: string; unit: string };
  } = {
    calories: {
      color: "text-gray-900 dark:text-gray-100",
      label: getEnergyUnitString(),
      unit: "",
    },
    protein: { color: "text-blue-600", label: "protein", unit: "g" },
    carbs: { color: "text-orange-600", label: "carbs", unit: "g" },
    fat: { color: "text-yellow-600", label: "fat", unit: "g" },
    dietary_fiber: { color: "text-green-600", label: "fiber", unit: "g" },
    sugar: { color: "text-pink-500", label: "sugar", unit: "g" },
    sodium: { color: "text-purple-500", label: "sodium", unit: "mg" },
    cholesterol: { color: "text-indigo-500", label: "cholesterol", unit: "mg" },
    saturated_fat: { color: "text-red-500", label: "sat fat", unit: "g" },
    trans_fat: { color: "text-red-700", label: "trans fat", unit: "g" },
    potassium: { color: "text-teal-500", label: "potassium", unit: "mg" },
    vitamin_a: { color: "text-yellow-400", label: "vit a", unit: "mcg" },
    vitamin_c: { color: "text-orange-400", label: "vit c", unit: "mg" },
    iron: { color: "text-gray-500", label: "iron", unit: "mg" },
    calcium: { color: "text-blue-400", label: "calcium", unit: "mg" },
    glycemic_index: { color: "text-purple-600", label: "GI", unit: "" },
  };

  const quickInfoPreferences = nutrientDisplayPreferences.find(
    (p) => p.view_group === "quick_info" && p.platform === platform,
  ) || nutrientDisplayPreferences.find(
    (p) => p.view_group === "quick_info" && p.platform === "desktop",
  );
  const visibleNutrients = quickInfoPreferences
    ? quickInfoPreferences.visible_nutrients
    : ["calories", "protein", "carbs", "fat"];

  const [foods, setFoods] = useState<Food[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFoodSearchDialog, setShowFoodSearchDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [foodFilter, setFoodFilter] = useState<FoodFilter>("all");
  const [sortOrder, setSortOrder] = useState<string>("name:asc");
  const [showFoodUnitSelectorDialog, setShowFoodUnitSelectorDialog] =
    useState(false); // New state
  const [foodToAddToMeal, setFoodToAddToMeal] = useState<Food | null>(null); // New state
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [deletionImpact, setDeletionImpact] =
    useState<FoodDeletionImpact | null>(null);
  const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);

  useEffect(() => {
    if (user && activeUserId) {
      // Always fetch foods when user and activeUserId are available
      fetchFoodsData();
    }
  }, [
    user,
    activeUserId,
    searchTerm,
    currentPage,
    itemsPerPage,
    foodFilter,
    sortOrder,
  ]); // Removed activeTab from dependencies

  useEffect(() => {
    const handleRefresh = () => fetchFoodsData();
    window.addEventListener("foodDatabaseRefresh", handleRefresh);
    return () => {
      window.removeEventListener("foodDatabaseRefresh", handleRefresh);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, itemsPerPage, foodFilter]);

  const fetchFoodsData = async () => {
    try {
      setLoading(true);

      const { foods: fetchedFoods, totalCount: fetchedTotalCount } =
        await loadFoods(
          searchTerm,
          foodFilter,
          currentPage,
          itemsPerPage,
          activeUserId,
          sortOrder, // Pass the new sortOrder
        );
      setFoods(fetchedFoods || []);
      setTotalCount(fetchedTotalCount || 0);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleShareFood = async (foodId: string, currentState: boolean) => {
    try {
      await togglePublicSharing(foodId, currentState);

      toast({
        title: t("common.success", "Success"),
        description: !currentState
          ? t("foodDatabaseManager.foodSharedWithPublic", "Food shared with public")
          : t("foodDatabaseManager.foodMadePrivate", "Food made private"),
      });

      fetchFoodsData();
    } catch (error: any) {
      console.error("Error:", error);
    }
  };

  const handleDeleteRequest = async (food: Food) => {
    if (!user || !activeUserId) return;
    try {
      const impact = await getFoodDeletionImpact(food.id);
      setDeletionImpact(impact);
      setFoodToDelete(food);
      setShowDeleteConfirmation(true);
    } catch (error: any) {
      console.error("Error fetching deletion impact:", error);
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("foodDatabaseManager.failedToFetchDeletionImpact", "Could not fetch deletion impact. Please try again."),
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async (force: boolean = false) => {
    if (!foodToDelete || !activeUserId) return;
    info(loggingLevel, `confirmDelete called with force: ${force}`);
    try {
      const result = await deleteFoodService(foodToDelete.id, activeUserId, force);
      toast({
        title: t("common.success", "Success"),
        description: result.message, // Use the message from the backend
      });
      fetchFoodsData();
    } catch (error: any) { // Add type annotation for error
      console.error("Error deleting food:", error);
      toast({
        title: t("common.error", "Error"),
        description: error.message || t("foodDatabaseManager.failedToDeleteFood", "Failed to delete food."), // Use error message from backend if available
        variant: "destructive",
      });
    } finally {
      setShowDeleteConfirmation(false);
      setFoodToDelete(null);
      setDeletionImpact(null);
    }
  };

  const handleEdit = (food: Food) => {
    setEditingFood(food);
    setShowEditDialog(true);
  };

  const handleSaveComplete = (savedFood: Food) => {
    fetchFoodsData();
    setShowEditDialog(false);
    setEditingFood(null);
  };

  const handleFoodSelected = (food: Food) => {
    setShowFoodSearchDialog(false);
    fetchFoodsData();
    toast({
      title: t("foodDatabaseManager.foodAdded", "Food Added"),
      description: t("foodDatabaseManager.foodAddedSuccess", { foodName: food.name, defaultValue: `${food.name} has been added to your database.` }),
    });
  };

  const handleAddFoodToMeal = async (
    food: Food,
    quantity: number,
    unit: string,
    selectedVariant: FoodVariant,
  ) => {
    if (!user || !activeUserId) {
      toast({
        title: t("common.error", "Error"),
        description: t("foodDatabaseManager.userNotAuthenticated", "User not authenticated."),
        variant: "destructive",
      });
      return;
    }

    try {
      await createFoodEntry({
        user_id: activeUserId,
        food_id: food.id!,
        meal_type: "breakfast", // Default to breakfast for now, or make dynamic
        quantity: quantity,
        unit: unit,
        entry_date: new Date().toISOString().split("T")[0], // Current date
        variant_id: selectedVariant.id || null,
      });

      toast({
        title: t("common.success", "Success"),
        description: t("foodDatabaseManager.foodAddedToMealSuccess", { foodName: food.name, defaultValue: `${food.name} has been added to your meal.` }),
      });
      setShowFoodUnitSelectorDialog(false);
      setFoodToAddToMeal(null);
    } catch (error: any) {
      console.error("Error adding food to meal:", error);
      toast({
        title: t("common.error", "Error"),
        description: t("foodDatabaseManager.failedToAddFoodToMeal", { foodName: food.name, defaultValue: `Failed to add ${food.name} to meal.` }),
        variant: "destructive",
      });
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const canEdit = (food: Food) => {
    // Only allow editing if the user owns the food
    return food.user_id === user?.id;
  };

  const getFoodSourceBadge = (food: Food) => {
    if (!food.user_id) {
      return (
        <Badge variant="outline" className="text-xs w-fit">
          {t("foodDatabaseManager.system", "System")}
        </Badge>
      );
    }

    if (food.user_id === user?.id) {
      return (
        <Badge variant="secondary" className="text-xs w-fit">
          {t("foodDatabaseManager.private", "Private")}
        </Badge>
      );
    }

    if (food.user_id !== user?.id && !food.shared_with_public) {
      return (
        <Badge
          variant="outline"
          className="text-xs w-fit bg-blue-50 text-blue-700"
        >
          {t("foodDatabaseManager.family", "Family")}
        </Badge>
      );
    }
    return null; // No badge from getFoodSourceBadge if it's public and not owned by user
  };

  const getFilterTitle = () => {
    switch (foodFilter) {
      case "all":
        return t("foodDatabaseManager.allFoodsCount", { count: totalCount, defaultValue: `All Foods (${totalCount})` });
      case "mine":
        return t("foodDatabaseManager.myFoodsCount", { count: totalCount, defaultValue: `My Foods (${totalCount})` });
      case "family":
        return t("foodDatabaseManager.familyFoodsCount", { count: totalCount, defaultValue: `Family Foods (${totalCount})` });
      case "public":
        return t("foodDatabaseManager.publicFoodsCount", { count: totalCount, defaultValue: `Public Foods (${totalCount})` });
      case "needs-review":
        return t("foodDatabaseManager.foodsNeedingReviewCount", { count: totalCount, defaultValue: `Foods Needing Review (${totalCount})` });
      default:
        return t("foodDatabaseManager.foodsCount", { count: totalCount, defaultValue: `Foods (${totalCount})` });
    }
  };

  const getEmptyMessage = () => {
    switch (foodFilter) {
      case "all":
        return t("foodDatabaseManager.noFoodsFound", "No foods found");
      case "mine":
        return t("foodDatabaseManager.noFoodsCreatedByYouFound", "No foods created by you found");
      case "family":
        return t("foodDatabaseManager.noFamilyFoodsFound", "No family foods found");
      case "public":
        return t("foodDatabaseManager.noPublicFoodsFound", "No public foods found");
      case "needs-review":
        return t("foodDatabaseManager.noFoodsNeedYourReview", "No foods need your review");
      default:
        return t("foodDatabaseManager.noFoodsFound", "No foods found");
    }
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage);

  if (!user || !activeUserId) {
    return <div>{t("foodDatabaseManager.pleaseSignInToManageFoodDatabase", "Please sign in to manage your food database.")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* Food Database Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-2xl font-bold">{t("foodDatabaseManager.foodDatabase", "Food Database")}</CardTitle>
          <Button
            className="whitespace-nowrap"
            onClick={() => setShowFoodSearchDialog(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            {t("foodDatabaseManager.addNewFood", "Add New Food")}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Controls in a single row: Search, Filter, Items per page, Add button */}
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-row flex-wrap items-center gap-4">
              {/* Search box */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder={t("foodDatabaseManager.searchFoodsPlaceholder", "Search foods...")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter dropdown */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select value={foodFilter} onValueChange={(value: FoodFilter) => setFoodFilter(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder={t("foodDatabaseManager.all", "All")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("foodDatabaseManager.all", "All")}</SelectItem>
                    <SelectItem value="mine">{t("foodDatabaseManager.myFoods", "My Foods")}</SelectItem>
                    <SelectItem value="family">{t("foodDatabaseManager.family", "Family")}</SelectItem>
                    <SelectItem value="public">{t("foodDatabaseManager.public", "Public")}</SelectItem>
                    <SelectItem value="needs-review">{t("foodDatabaseManager.needsReview", "Needs Review")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Sort by dropdown */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm">{t("foodDatabaseManager.sortBy", "Sort by:")}</span>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder={t("foodDatabaseManager.nameAsc", "Name (A-Z)")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name:asc">{t("foodDatabaseManager.nameAsc", "Name (A-Z)")}</SelectItem>
                    <SelectItem value="name:desc">{t("foodDatabaseManager.nameDesc", "Name (Z-A)")}</SelectItem>
                    <SelectItem value="calories:asc">
                      {t("foodDatabaseManager.caloriesLowToHigh", "Calories (Low to High)")}
                    </SelectItem>
                    <SelectItem value="calories:desc">
                      {t("foodDatabaseManager.caloriesHighToLow", "Calories (High to Low)")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Items per page selector */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm">{t("foodDatabaseManager.itemsPerPage", "Items per page:")}</span>
                <Select
                  value={itemsPerPage.toString()}
                  onValueChange={(value) => setItemsPerPage(Number(value))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="15">15</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {loading ? (
            <div>{t("foodDatabaseManager.loadingFoods", "Loading foods...")}</div>
          ) : (
            <>
              {foods.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {getEmptyMessage()}
                </div>
              ) : (
                <div className="grid gap-3">
                  {foods.map((food) => (
                    <div
                      key={food.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-4"
                    >
                      <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                          <span className="font-medium">{food.name}</span>
                          {food.brand && (
                            <Badge variant="secondary" className="text-xs w-fit">
                              {food.brand}
                            </Badge>
                          )}
                          {getFoodSourceBadge(food)}
                          {food.shared_with_public && (
                            <Badge
                              variant="outline"
                              className="text-xs w-fit bg-green-50 text-green-700"
                            >
                              <Share2 className="h-3 w-3 mr-1" />
                              {t("foodDatabaseManager.public", "Public")}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t("foodDatabaseManager.perServing", {
                            servingSize: food.default_variant?.serving_size || 0,
                            servingUnit: food.default_variant?.serving_unit || "",
                            defaultValue: `Per ${food.default_variant?.serving_size || 0} ${food.default_variant?.serving_unit || ""}`
                          })}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className={`grid grid-flow-col-dense gap-x-4 text-xs sm:text-sm text-gray-600 dark:text-gray-400`}>
                          {visibleNutrients.map((nutrient) => {
                            const details = nutrientDetails[nutrient];
                            if (!details) return null;
                            const value = (food.default_variant?.[nutrient as keyof FoodVariant] as number) || 0; // This value is in kcal
                            return (
                              <div key={nutrient} className="whitespace-nowrap">
                                <span className={`font-medium ${details.color}`}>
                                  {typeof value === 'number'
                                    ? nutrient === "calories"
                                      ? Math.round(convertEnergy(value, 'kcal', energyUnit))
                                      : value.toFixed(nutrient === "calories" ? 0 : 1)
                                    : value}
                                  {nutrient === "calories" ? getEnergyUnitString(energyUnit) : details.unit}
                                </span>{" "}
                                {details.label}
                              </div>
                            );
                          })}
                        </div>
                        {/* Action Buttons */}
                        <div className="flex items-center space-x-2 justify-end">
                          {/* Share/Lock Button */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    handleShareFood(
                                      food.id,
                                      food.shared_with_public || false,
                                    )
                                  }
                                  disabled={!canEdit(food)} // Disable if not editable
                                >
                                  {food.shared_with_public ? (
                                    <Share2 className="w-4 h-4" />
                                  ) : (
                                    <Lock className="w-4 h-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {canEdit(food)
                                    ? food.shared_with_public
                                      ? t("foodDatabaseManager.makePrivate", "Make private")
                                      : t("foodDatabaseManager.shareWithPublic", "Share with public")
                                    : t("foodDatabaseManager.notEditable", "Not editable")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          {/* Edit Button */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(food)}
                                  disabled={!canEdit(food)} // Disable if not editable
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{canEdit(food) ? t("foodDatabaseManager.editFood", "Edit food") : t("foodDatabaseManager.notEditable", "Not editable")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>

                          {/* Delete Button */}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteRequest(food)}
                                  disabled={!canEdit(food)} // Disable if not editable
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{canEdit(food) ? t("foodDatabaseManager.deleteFood", "Delete food") : t("foodDatabaseManager.notEditable", "Not editable")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() =>
                      handlePageChange(Math.max(1, currentPage - 1))
                    }
                    className={
                      currentPage === 1
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>

                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNumber;
                  if (totalPages <= 5) {
                    pageNumber = i + 1;
                  } else if (currentPage <= 3) {
                    pageNumber = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNumber = totalPages - 4 + i;
                  } else {
                    pageNumber = currentPage - 2 + i;
                  }

                  return (
                    <PaginationItem key={pageNumber}>
                      <PaginationLink
                        onClick={() => handlePageChange(pageNumber)}
                        isActive={currentPage === pageNumber}
                        className="cursor-pointer"
                      >
                        {pageNumber}
                      </PaginationLink>
                    </PaginationItem>
                  );
                })}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      handlePageChange(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? "pointer-events-none opacity-50"
                        : "cursor-pointer"
                    }
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </CardContent>
      </Card>

      {/* Meal Management Section */}
      <MealManagement />

      {/* Meal Plan Calendar Section */}
      <MealPlanCalendar />

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("foodDatabaseManager.editFoodDialogTitle", "Edit Food")}</DialogTitle>
            <DialogDescription>
              {t("foodDatabaseManager.editFoodDialogDescription", "Edit the details of the selected food item.")}
            </DialogDescription>
          </DialogHeader>
          {editingFood && (
            <EnhancedCustomFoodForm
              food={editingFood}
              onSave={handleSaveComplete}
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
          showUnitSelector={false}
        />
      )}

      {deletionImpact && foodToDelete && (
        <Dialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("foodDatabaseManager.deleteFoodConfirmTitle", { foodName: foodToDelete.name, defaultValue: `Delete ${foodToDelete.name}?` })}</DialogTitle>
            </DialogHeader>
            <div>
              <p>{t("foodDatabaseManager.foodUsedIn", "This food is used in:")}</p>
              <ul className="list-disc pl-5 mt-2">
                <li>{t("foodDatabaseManager.diaryEntries", { count: deletionImpact.foodEntriesCount, defaultValue: `${deletionImpact.foodEntriesCount} diary entries` })}</li>
                <li>{t("foodDatabaseManager.mealComponents", { count: deletionImpact.mealFoodsCount, defaultValue: `${deletionImpact.mealFoodsCount} meal components` })}</li>
                <li>{t("foodDatabaseManager.mealPlanEntries", { count: deletionImpact.mealPlansCount, defaultValue: `${deletionImpact.mealPlansCount} meal plan entries` })}</li>
                <li>
                  {t("foodDatabaseManager.mealPlanTemplateEntries", { count: deletionImpact.mealPlanTemplateAssignmentsCount, defaultValue: `${deletionImpact.mealPlanTemplateAssignmentsCount} meal plan template entries` })}
                </li>
              </ul>
              {deletionImpact.otherUserReferences > 0 && (
                <div className="mt-4 p-4 bg-yellow-100 text-yellow-800 rounded-md">
                  <p className="font-bold">{t("foodDatabaseManager.warning", "Warning!")}</p>
                  <p>{t("foodDatabaseManager.foodUsedByOtherUsersWarning", "This food is used by other users. You can only hide it. Hiding will prevent other users from adding this food in the future, but it will not affect their existing history, meals, or meal plans.")}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={() => setShowDeleteConfirmation(false)}>
                {t("foodDatabaseManager.cancel", "Cancel")}
              </Button>
              {deletionImpact.totalReferences === 0 ? (
                <Button variant="destructive" onClick={() => confirmDelete(true)}>
                  {t("foodDatabaseManager.delete", "Delete")}
                </Button>
              ) : deletionImpact.otherUserReferences > 0 ? (
                <Button onClick={() => confirmDelete(false)}>{t("foodDatabaseManager.hide", "Hide")}</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => confirmDelete(false)}>
                    {t("foodDatabaseManager.hide", "Hide")}
                  </Button>
                  <Button variant="destructive" onClick={() => confirmDelete(true)}>
                    {t("foodDatabaseManager.forceDelete", "Force Delete")}
                  </Button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <FoodSearchDialog
        open={showFoodSearchDialog}
        onOpenChange={setShowFoodSearchDialog}
        onFoodSelect={handleFoodSelected}
        title={t("foodDatabaseManager.addFoodToDatabaseTitle", "Add Food to Database")}
        description={t("foodDatabaseManager.addFoodToDatabaseDescription", "Search for foods to add to your personal database.")}
        hideDatabaseTab={true}
        hideMealTab={true}
      />
    </div>
  );
};

export default FoodDatabaseManager;
