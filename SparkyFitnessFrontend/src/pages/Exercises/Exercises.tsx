import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import AddExerciseDialog from '@/pages/Exercises/AddExerciseDialog';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Plus } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import type { ExerciseOwnershipFilter } from '@/types/exercises';
import WorkoutPresetsManager from './WorkoutPresetsManager';
import WorkoutPlansManager from '@/pages/Exercises/WorkoutPlansManager';
import {
  useExercises,
  useUpdateExerciseShareStatusMutation,
} from '@/hooks/Exercises/useExercises';
import { useExerciseInvalidation } from '@/hooks/useInvalidateKeys';
import { useEditExerciseForm } from '@/hooks/Exercises/useEditExerciseForm';
import EditExerciseDialog from './EditExerciseDialog';
import { useDeleteExercise } from '@/hooks/Exercises/useDeleteExercise';
import { useExerciseFilters } from '@/hooks/Exercises/useExerciseFilter';
import ExerciseListItem from './ExerciseListItem';
import { EXERCISE_CATEGORIES } from '@/constants/exercises';

const ExerciseDatabaseManager = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { energyUnit, convertEnergy } = usePreferences();

  // Existing states for Exercise management
  const editForm = useEditExerciseForm();
  const {
    openEditDialog,
    showSyncConfirmation,
    setShowSyncConfirmation,
    handleSyncConfirmation,
  } = editForm;
  const {
    showDeleteConfirmation,
    setShowDeleteConfirmation,
    deletionImpact,
    exerciseToDelete,
    handleDeleteRequest,
    confirmDelete,
  } = useDeleteExercise();

  const {
    searchTerm,
    setSearchTerm,
    categoryFilter,
    setCategoryFilter,
    ownershipFilter,
    setOwnershipFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
  } = useExerciseFilters();

  const [isAddExerciseDialogOpen, setIsAddExerciseDialogOpen] = useState(false);
  const { data } = useExercises(
    searchTerm,
    categoryFilter,
    ownershipFilter,
    currentPage,
    itemsPerPage,
    user?.id
  );
  const { mutateAsync: updateExerciseShareStatus } =
    useUpdateExerciseShareStatusMutation();
  const invalidateExercises = useExerciseInvalidation();
  const currentExercises = data ? data.exercises : [];
  const totalExercisesCount = data ? data.totalCount : 0;
  const totalPages = Math.ceil(totalExercisesCount / itemsPerPage);

  return (
    <div className="space-y-6">
      {/* Exercises Section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('exercise.databaseManager.cardTitle', 'Exercises')}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <Input
                type="text"
                placeholder={t(
                  'exercise.databaseManager.searchPlaceholder',
                  'Search exercises...'
                )}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 min-w-[150px]"
              />
              <Select
                onValueChange={setCategoryFilter}
                defaultValue={categoryFilter}
              >
                <SelectTrigger className="w-48">
                  <SelectValue
                    placeholder={t(
                      'exercise.databaseManager.allCategoriesPlaceholder',
                      'All Categories'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t(
                      'exercise.databaseManager.allCategoriesItem',
                      'All Categories'
                    )}
                  </SelectItem>
                  {EXERCISE_CATEGORIES.map(
                    ({ value, labelKey, defaultLabel }) => (
                      <SelectItem key={value} value={value}>
                        {t(labelKey, defaultLabel)}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                onValueChange={(value) =>
                  setOwnershipFilter(value as ExerciseOwnershipFilter)
                }
                defaultValue={ownershipFilter}
              >
                <SelectTrigger className="w-32">
                  <SelectValue
                    placeholder={t(
                      'exercise.databaseManager.allOwnershipPlaceholder',
                      'All'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {t('exercise.databaseManager.allOwnershipItem', 'All')}
                  </SelectItem>
                  <SelectItem value="own">
                    {t('exercise.databaseManager.myOwnOwnershipItem', 'My Own')}
                  </SelectItem>
                  <SelectItem value="family">
                    {t(
                      'exercise.databaseManager.familyOwnershipItem',
                      'Family'
                    )}
                  </SelectItem>
                  <SelectItem value="public">
                    {t(
                      'exercise.databaseManager.publicOwnershipItem',
                      'Public'
                    )}
                  </SelectItem>
                  <SelectItem value="needs-review">
                    {t(
                      'exercise.databaseManager.needsReviewOwnershipItem',
                      'Needs Review'
                    )}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                className="bg-slate-900 hover:bg-slate-800 text-white"
                onClick={() => setIsAddExerciseDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t(
                  'exercise.databaseManager.addExerciseButton',
                  'Add Exercise'
                )}
              </Button>
            </div>
          </div>

          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">
              {t('exercise.databaseManager.allExercisesCount', {
                totalExercisesCount,
                defaultValue: `All Exercises (${totalExercisesCount})`,
              })}
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-muted-foreground">
                {t(
                  'exercise.databaseManager.itemsPerPageLabel',
                  'Items per page:'
                )}
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
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-4">
              {currentExercises.map((exercise) => (
                <ExerciseListItem
                  key={exercise.id}
                  exercise={exercise}
                  userId={user?.id}
                  energyUnit={energyUnit}
                  convertEnergy={convertEnergy}
                  onEdit={openEditDialog}
                  onDelete={handleDeleteRequest}
                  onToggleShare={(id, current) =>
                    updateExerciseShareStatus({
                      id,
                      sharedWithPublic: !current,
                    })
                  }
                />
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-6">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() =>
                        setCurrentPage(Math.max(1, currentPage - 1))
                      }
                      className={
                        currentPage === 1
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNumber: number;
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
                          onClick={() => setCurrentPage(pageNumber)}
                          isActive={pageNumber === currentPage}
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
                        setCurrentPage(Math.min(totalPages, currentPage + 1))
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
            </div>
          )}
        </CardContent>
      </Card>

      {/* Workout Presets Section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              'exercise.databaseManager.workoutPresetsCardTitle',
              'Workout Presets'
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutPresetsManager />
        </CardContent>
      </Card>

      {/* Workout Plans Section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              'exercise.databaseManager.workoutPlansCardTitle',
              'Workout Plans'
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutPlansManager />
        </CardContent>
      </Card>

      <AddExerciseDialog
        open={isAddExerciseDialogOpen}
        onOpenChange={setIsAddExerciseDialogOpen}
        mode="database-manager"
        onExerciseAdded={() => invalidateExercises()}
      />
      {/* Edit Exercise Dialog */}

      <EditExerciseDialog form={editForm} />
      {deletionImpact && exerciseToDelete && (
        <ConfirmationDialog
          open={showDeleteConfirmation}
          onOpenChange={setShowDeleteConfirmation}
          onConfirm={confirmDelete}
          title={t('exercise.databaseManager.deleteConfirmationTitle', {
            exerciseName: exerciseToDelete.name,
            defaultValue: `Delete ${exerciseToDelete.name}?`,
          })}
          description={
            <div>
              {deletionImpact.isUsedByOthers ? (
                <>
                  <p>
                    {t(
                      'exercise.databaseManager.deleteUsedByOthersDescription',
                      'This exercise is used by other users. Deleting it will affect their data and is not allowed; it will be hidden instead.'
                    )}
                  </p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>
                      {t('exercise.databaseManager.deleteUsedByOthersEntries', {
                        exerciseEntriesCount:
                          deletionImpact.exerciseEntriesCount,
                        defaultValue: `${deletionImpact.exerciseEntriesCount} diary entries (across users)`,
                      })}
                    </li>
                  </ul>
                </>
              ) : (
                <>
                  <p>
                    {t(
                      'exercise.databaseManager.deletePermanentDescription',
                      'This will permanently delete the exercise and all associated data for your account.'
                    )}
                  </p>
                  <ul className="list-disc pl-5 mt-2">
                    <li>
                      {t('exercise.databaseManager.deletePermanentEntries', {
                        exerciseEntriesCount:
                          deletionImpact.exerciseEntriesCount,
                        defaultValue: `${deletionImpact.exerciseEntriesCount} diary entries`,
                      })}
                    </li>
                  </ul>
                </>
              )}
            </div>
          }
          warning={
            deletionImpact.isUsedByOthers
              ? t(
                  'exercise.databaseManager.deleteUsedByOthersWarning',
                  'This exercise is used in workouts or diaries by other users. Deleting it will affect their data. It will be hidden instead.'
                )
              : undefined
          }
          variant={
            deletionImpact.isUsedByOthers ? 'destructive' : 'destructive'
          }
          confirmLabel={
            !deletionImpact.isUsedByOthers &&
            deletionImpact.exerciseEntriesCount > 0
              ? t(
                  'exercise.databaseManager.forceDeleteConfirmLabel',
                  'Force Delete'
                )
              : t('common.confirm', 'Confirm')
          }
        />
      )}
      {showSyncConfirmation && (
        <ConfirmationDialog
          open={showSyncConfirmation}
          onOpenChange={setShowSyncConfirmation}
          onConfirm={handleSyncConfirmation}
          title={t(
            'exercise.databaseManager.syncConfirmationTitle',
            'Sync Past Entries?'
          )}
          description={t(
            'exercise.databaseManager.syncConfirmationDescription',
            'Do you want to update all your past diary entries for this exercise with the new information?'
          )}
        />
      )}
    </div>
  );
};

export default ExerciseDatabaseManager;
