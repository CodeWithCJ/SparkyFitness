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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, Plus, Filter } from 'lucide-react';
import FoodSearchDialog from '@/components/FoodSearch/FoodSearchDialog';
import FoodUnitSelector from '@/components/FoodUnitSelector';
import MealManagement from './MealManagement';
import MealPlanCalendar from './MealPlanCalendar';
import CustomFoodForm from '@/components/FoodSearch/CustomFoodForm';
import { MealFilter } from '@/types/meal';
import { useFoodDatabaseManager } from '@/hooks/Foods/useFoodDatabaseManager';
import { FoodCard } from './FoodCard';

const FoodDatabaseManager = () => {
  const { t } = useTranslation();
  const {
    user,
    isAuthenticated,
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
    getPageNumbers,
    foodToAddToMeal,
    togglePublicSharing,
    canEdit,
    getEmptyMessage,
    handlePageChange,
    handleEdit,
    handleSaveComplete,
    handleFoodSelected,
    handleAddFoodToMeal,
    handleDeleteRequest,
  } = useFoodDatabaseManager();
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
            {t('foodDatabaseManager.foodDatabase', 'Food Database')}
          </CardTitle>
          <Button
            size={isMobile ? 'icon' : 'default'}
            onClick={() => setShowFoodSearchDialog(true)}
            className="shrink-0"
            title={t('foodDatabaseManager.addNewFood', 'Add New Food')}
          >
            <Plus className={isMobile ? 'w-5 h-5' : 'w-4 h-4 mr-2'} />
            {!isMobile && (
              <span>{t('foodDatabaseManager.addNewFood', 'Add New Food')}</span>
            )}
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
                  placeholder={t(
                    'foodDatabaseManager.searchFoodsPlaceholder',
                    'Search foods...'
                  )}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Filter dropdown */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <Filter className="h-4 w-4 text-gray-500" />
                <Select
                  value={foodFilter}
                  onValueChange={(value: MealFilter) => setFoodFilter(value)}
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Sort by dropdown */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm">
                  {t('foodDatabaseManager.sortBy', 'Sort by:')}
                </span>
                <Select value={sortOrder} onValueChange={setSortOrder}>
                  <SelectTrigger className="w-32">
                    <SelectValue
                      placeholder={t(
                        'foodDatabaseManager.nameAsc',
                        'Name (A-Z)'
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name:asc">
                      {t('foodDatabaseManager.nameAsc', 'Name (A-Z)')}
                    </SelectItem>
                    <SelectItem value="name:desc">
                      {t('foodDatabaseManager.nameDesc', 'Name (Z-A)')}
                    </SelectItem>
                    <SelectItem value="calories:asc">
                      {t(
                        'foodDatabaseManager.caloriesLowToHigh',
                        'Calories (Low to High)'
                      )}
                    </SelectItem>
                    <SelectItem value="calories:desc">
                      {t(
                        'foodDatabaseManager.caloriesHighToLow',
                        'Calories (High to Low)'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Items per page selector */}
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-sm">
                  {t('foodDatabaseManager.itemsPerPage', 'Items per page:')}
                </span>
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
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {loading ? (
            <div>
              {t('foodDatabaseManager.loadingFoods', 'Loading foods...')}
            </div>
          ) : (
            <>
              {foodData?.foods.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {getEmptyMessage()}
                </div>
              ) : (
                <div className="grid gap-3">
                  {foodData?.foods.map((food) => (
                    <FoodCard
                      food={food}
                      isMobile={isMobile}
                      visibleNutrients={visibleNutrients}
                      userId={user?.id}
                      canEdit={canEdit}
                      onEdit={handleEdit}
                      onDelete={handleDeleteRequest}
                      onTogglePublic={togglePublicSharing}
                    />
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
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
                    }
                  />
                </PaginationItem>

                {getPageNumbers(currentPage, totalPages).map((pageNumber) => (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      onClick={() => handlePageChange(pageNumber)}
                      isActive={currentPage === pageNumber}
                      className="cursor-pointer"
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                ))}

                <PaginationItem>
                  <PaginationNext
                    onClick={() =>
                      handlePageChange(Math.min(totalPages, currentPage + 1))
                    }
                    className={
                      currentPage === totalPages
                        ? 'pointer-events-none opacity-50'
                        : 'cursor-pointer'
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
        <DialogContent
          requireConfirmation
          className="max-w-4xl max-h-[90vh] overflow-y-auto"
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

      {/* FoodUnitSelector Dialog */}
      {foodToAddToMeal && (
        <FoodUnitSelector
          food={foodToAddToMeal}
          open={showFoodUnitSelectorDialog}
          onOpenChange={setShowFoodUnitSelectorDialog}
          onSelect={handleAddFoodToMeal}
        />
      )}

      {pendingDeletion && (
        <Dialog open onOpenChange={handleCancelDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t('foodDatabaseManager.deleteFoodConfirmTitle', {
                  foodName: pendingDeletion.food.name,
                  defaultValue: `Delete ${pendingDeletion.food.name}?`,
                })}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('foodDatabaseManager.foodUsedIn', 'This food is used in:')}
              </p>
              <ul className="list-disc pl-5 mt-2">
                <li>
                  {t('foodDatabaseManager.diaryEntries', {
                    count: pendingDeletion.impact.foodEntriesCount,
                    defaultValue: `${pendingDeletion.impact.foodEntriesCount} diary entries`,
                  })}
                </li>
                <li>
                  {t('foodDatabaseManager.mealComponents', {
                    count: pendingDeletion.impact.mealFoodsCount,
                    defaultValue: `${pendingDeletion.impact.mealFoodsCount} meal components`,
                  })}
                </li>
                <li>
                  {t('foodDatabaseManager.mealPlanEntries', {
                    count: pendingDeletion.impact.mealPlansCount,
                    defaultValue: `${pendingDeletion.impact.mealPlansCount} meal plan entries`,
                  })}
                </li>
                <li>
                  {t('foodDatabaseManager.mealPlanTemplateEntries', {
                    count:
                      pendingDeletion.impact.mealPlanTemplateAssignmentsCount,
                    defaultValue: `${pendingDeletion.impact.mealPlanTemplateAssignmentsCount} meal plan template entries`,
                  })}
                </li>
              </ul>
              {pendingDeletion.impact.otherUserReferences > 0 && (
                <div className="mt-4 p-4 bg-yellow-100 text-yellow-800 rounded-md">
                  <p className="font-bold">
                    {t('foodDatabaseManager.warning', 'Warning!')}
                  </p>
                  <p className="text-yellow-700 dark:text-yellow-400">
                    {t(
                      'foodDatabaseManager.foodUsedByOtherUsersWarning',
                      'This food is used by other users...'
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end space-x-2 mt-4">
              <Button variant="outline" onClick={handleCancelDelete}>
                {t('foodDatabaseManager.cancel', 'Cancel')}
              </Button>
              {pendingDeletion.impact.totalReferences === 0 ? (
                <Button
                  variant="destructive"
                  onClick={() => handleConfirmDelete(true)}
                >
                  {t('foodDatabaseManager.delete', 'Delete')}
                </Button>
              ) : pendingDeletion.impact.otherUserReferences > 0 ? (
                <Button onClick={() => handleConfirmDelete(false)}>
                  {t('foodDatabaseManager.hide', 'Hide')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleConfirmDelete(false)}
                  >
                    {t('foodDatabaseManager.hide', 'Hide')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleConfirmDelete(true)}
                  >
                    {t('foodDatabaseManager.forceDelete', 'Force Delete')}
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
    </div>
  );
};

export default FoodDatabaseManager;
