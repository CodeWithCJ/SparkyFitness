import React from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteExerciseHistoryV2 } from '@/hooks/Exercises/useExerciseEntries';
import ExerciseEntryDisplay from '@/pages/Diary/ExerciseEntryDisplay';
import ExercisePresetEntryDisplay from '@/pages/Diary/ExercisePresetEntryDisplay';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useDeleteExerciseEntryMutation,
  useDeleteExercisePresetEntryMutation,
} from '@/hooks/Exercises/useExerciseEntries';
import { ExerciseEntry, Exercise } from '@/types/exercises';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const ExerciseHistoryPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { energyUnit, convertEnergy, getEnergyUnitString } = usePreferences();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const queryUserId = searchParams.get('userId');
  const targetUserId = queryUserId || activeUserId || user?.id;

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteExerciseHistoryV2(targetUserId || undefined);

  const { mutate: deleteEntry } = useDeleteExerciseEntryMutation();
  const { mutate: deletePreset } = useDeleteExercisePresetEntryMutation();

  const handleDeleteExerciseEntry = (id: string) => {
    if (
      window.confirm(
        t('common.confirmDelete', 'Are you sure you want to delete this entry?')
      )
    ) {
      deleteEntry(id);
    }
  };

  const handleDeletePreset = (id: string) => {
    if (
      window.confirm(
        t(
          'common.confirmDelete',
          'Are you sure you want to delete this workout?'
        )
      )
    ) {
      deletePreset(id);
    }
  };

  // Dummy handlers for Edit and Playback (could be integrated better if needed)
  const handleEdit = (entry: ExerciseEntry) => {
    console.log('Edit', entry);
    // Ideally open EditExerciseEntryDialog
  };
  const handleEditExerciseDatabase = (id: string) => {
    console.log('Edit DB', id);
  };
  const setExerciseToPlay = (ex: Exercise | null) => {
    console.log('Play', ex);
  };
  const setIsPlaybackModalOpen = (open: boolean) => {
    console.log('Playback modal', open);
  };

  const allSessions = data?.pages.flatMap((page) => page.sessions) || [];

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-10 text-destructive">
        {t('exercise.history.errorLoading', 'Error loading exercise history.')}
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(-1)}
          aria-label={t('common.back', 'Back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">
          {t('exercise.history.title', 'Workout History')}
        </h1>
      </div>

      {allSessions.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          {t('exercise.history.noSessions', 'No workout history found.')}
        </div>
      ) : (
        <div className="space-y-6">
          {allSessions.map((session) => {
            if (session.type === 'preset') {
              return (
                <ExercisePresetEntryDisplay
                  key={session.id}
                  presetEntry={session}
                  currentUserId={user?.id}
                  handleDelete={handleDeletePreset}
                  handleDeleteExerciseEntry={handleDeleteExerciseEntry}
                  handleEdit={handleEdit}
                  handleEditExerciseDatabase={handleEditExerciseDatabase}
                  setExerciseToPlay={setExerciseToPlay}
                  setIsPlaybackModalOpen={setIsPlaybackModalOpen}
                  energyUnit={energyUnit}
                  convertEnergy={convertEnergy}
                  getEnergyUnitString={getEnergyUnitString}
                />
              );
            } else {
              return (
                <ExerciseEntryDisplay
                  key={session.id}
                  exerciseEntry={session}
                  currentUserId={user?.id}
                  handleDelete={handleDeleteExerciseEntry}
                  handleEdit={handleEdit}
                  handleEditExerciseDatabase={handleEditExerciseDatabase}
                  setExerciseToPlay={setExerciseToPlay}
                  setIsPlaybackModalOpen={setIsPlaybackModalOpen}
                  energyUnit={energyUnit}
                  convertEnergy={convertEnergy}
                  getEnergyUnitString={getEnergyUnitString}
                />
              );
            }
          })}

          <div className="py-8 flex justify-center">
            {hasNextPage ? (
              <Button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                variant="outline"
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.loadingMore', 'Loading more...')}
                  </>
                ) : (
                  t('common.loadMore', 'Load More')
                )}
              </Button>
            ) : (
              allSessions.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'exercise.history.endOfHistory',
                    'You have reached the end of your history.'
                  )}
                </p>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseHistoryPage;
