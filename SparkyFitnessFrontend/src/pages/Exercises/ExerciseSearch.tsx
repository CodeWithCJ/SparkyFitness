import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useAuth } from '@/hooks/useAuth';
import { debug, info, warn, error } from '@/utils/logging';
import {
  Plus,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Volume2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Share2, Users } from 'lucide-react';
import BodyMapFilter from './BodyMapFilter';
import {
  useFreeExerciseDBEquipment,
  useFreeExerciseDBMuscleGroups,
} from '@/hooks/Exercises/useFreeExerciseDB';
import {
  exerciseProvidersOptions,
  externalSearchOptions,
  internalSearchOptions,
  recentExercisesOptions,
  topExercisesOptions,
  useAddExerciseMutation,
} from '@/hooks/Exercises/useExerciseSearch';
import { useQueryClient } from '@tanstack/react-query';
import { Exercise } from '@/types/exercises';
import { DataProvider } from '@/types/settings';

interface ExerciseSearchProps {
  onExerciseSelect: (
    exercise: Exercise,
    sourceMode: 'internal' | 'external'
  ) => void;
  showInternalTab?: boolean; // New prop
  selectedDate?: string; // Add selectedDate prop
  onLogSuccess?: () => void; // Add onLogSuccess prop
  disableTabs?: boolean; // New prop to disable internal tabs
  initialSearchSource?: 'internal' | 'external'; // New prop for initial search source when tabs are disabled
}

const ExerciseSearch = ({
  onExerciseSelect,
  showInternalTab = true,
  disableTabs = false,
  initialSearchSource,
}: ExerciseSearchProps) => {
  const { t } = useTranslation();
  const { loggingLevel, itemDisplayLimit, energyUnit, convertEnergy } =
    usePreferences(); // Get itemDisplayLimit from preferences, energyUnit, convertEnergy
  const { user } = useAuth(); // New
  const { toast } = useToast();
  debug(loggingLevel, 'ExerciseSearch: Component rendered.');

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    return unit === 'kcal'
      ? t('common.kcalUnit', 'kcal')
      : t('common.kJUnit', 'kJ');
  };
  const [searchTerm, setSearchTerm] = useState('');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [recentExercises, setRecentExercises] = useState<Exercise[]>([]);
  const [topExercises, setTopExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(false);
  const searchSource =
    disableTabs && initialSearchSource
      ? initialSearchSource
      : showInternalTab
        ? 'internal'
        : 'external';
  const [providers, setProviders] = useState<DataProvider[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    null
  );
  const [selectedProviderType, setSelectedProviderType] = useState<
    string | null
  >(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [equipmentFilter, setEquipmentFilter] = useState<string[]>([]); // New state for equipment filter
  const [muscleGroupFilter, setMuscleGroupFilter] = useState<string[]>([]); // New state for muscle group filter
  const [hasSearchedExternal, setHasSearchedExternal] = useState(false); // New state to track if external search has been performed

  const queryClient = useQueryClient();
  const { data: availableMuscleGroups = [] } = useFreeExerciseDBMuscleGroups();
  const { data: availableEquipment = [] } = useFreeExerciseDBEquipment();
  const { mutateAsync: addExercise } = useAddExerciseMutation();

  const handleSearch = async (query: string, isInitialLoad = false) => {
    debug(
      loggingLevel,
      `ExerciseSearch: Searching exercises with query: "${query}" from source: "${searchSource}" and provider ID: "${selectedProviderId}", type: "${selectedProviderType}", equipment: "${equipmentFilter.join(',')}", muscles: "${muscleGroupFilter.join(',')}"`
    );
    const hasSearchTerm = query.trim().length > 0;
    const hasFilters =
      equipmentFilter.length > 0 || muscleGroupFilter.length > 0;

    if (
      searchSource === 'external' &&
      !hasSearchTerm &&
      !hasFilters &&
      !isInitialLoad
    ) {
      debug(
        loggingLevel,
        'ExerciseSearch: External search query and filters are empty, clearing exercises.'
      );
      setExercises([]);
      return;
    }
    // For internal search, allow to proceed even with empty search term to show all exercises
    if (
      searchSource === 'internal' &&
      !hasSearchTerm &&
      !hasFilters &&
      !isInitialLoad
    ) {
      debug(
        loggingLevel,
        'ExerciseSearch: Internal search query and filters are empty, performing a broad search.'
      );
      // If no search term and no filters, fetch recent and top exercises
      try {
        const recent = await queryClient.fetchQuery(
          recentExercisesOptions(user?.id || '', itemDisplayLimit)
        );
        const top = await queryClient.fetchQuery(
          topExercisesOptions(user?.id || '', itemDisplayLimit)
        );
        // Combine and deduplicate
        setRecentExercises(recent);
        setTopExercises(top);
        setExercises([]); // Clear the main exercises list
      } catch (err) {
        error(
          loggingLevel,
          'ExerciseSearch: Error fetching recent/top exercises:',
          err
        );
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let data: Exercise[] = [];
      if (searchSource === 'internal') {
        setRecentExercises([]);
        setTopExercises([]);
        data = await queryClient.fetchQuery(
          internalSearchOptions(query, equipmentFilter, muscleGroupFilter)
        );
      } else {
        if (!selectedProviderId || !selectedProviderType) {
          warn(
            loggingLevel,
            'ExerciseSearch: No external provider selected (ID or Type missing).'
          );
          setLoading(false);
          return;
        }
        data = await queryClient.fetchQuery(
          externalSearchOptions(
            query,
            selectedProviderId,
            selectedProviderType,
            equipmentFilter,
            muscleGroupFilter,
            itemDisplayLimit
          )
        ); // Pass ID, Type, filters, and itemDisplayLimit
      }
      info(loggingLevel, 'ExerciseSearch: Exercises search results:', data);
      setExercises(data || []);
    } catch (err) {
      error(loggingLevel, 'ExerciseSearch: Error searching exercises:', err);
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t(
          'exercise.exerciseSearch.failedToSearchExercises',
          'Failed to search exercises: {{errorMessage}}',
          { errorMessage: err instanceof Error ? err.message : String(err) }
        ),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      debug(loggingLevel, 'ExerciseSearch: Loading state set to false.');
    }
  };

  const handleAddExternalExercise = async (
    exercise: Exercise
  ): Promise<Exercise | undefined> => {
    setLoading(true);
    try {
      const newExercise = await addExercise({
        exercise,
        type: selectedProviderType,
      });
      if (newExercise) {
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'exercise.exerciseSearch.addExternalExerciseSuccess',
            '{{exerciseName}} added to your exercises. You can now log it from the diary page.',
            { exerciseName: exercise.name }
          ),
        });
      }
      return newExercise;
    } catch (error) {
      toast({
        title: t('common.errorOccurred', 'Error'),
        description: t(
          'exercise.exerciseSearch.addExternalExerciseError',
          'Failed to add exercise: {{errorMessage}}',
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
          }
        ),
        variant: 'destructive',
      });
      return undefined;
    } finally {
      setLoading(false);
    }
  };

  // Effect for initial data load
  useEffect(() => {
    if (searchSource === 'internal' && user?.id) {
      handleSearch('', true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchSource, user?.id]);

  // Effect for handling search logic
  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchSource === 'internal') {
        const isBroadSearch =
          searchTerm.trim().length === 0 &&
          equipmentFilter.length === 0 &&
          muscleGroupFilter.length === 0;
        if (!isBroadSearch) {
          handleSearch(searchTerm, false);
        } else {
          // If search term is cleared, re-fetch recent and top
          handleSearch('', true);
        }
      }
    }, 300);

    return () => {
      clearTimeout(handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, equipmentFilter, muscleGroupFilter, searchSource]);

  const fetchProviders = useCallback(async () => {
    debug(
      loggingLevel,
      'ExerciseSearch: fetchProviders triggered. Current searchSource:',
      searchSource
    );
    try {
      const exerciseProviders = await queryClient.fetchQuery(
        exerciseProvidersOptions()
      );
      setProviders(exerciseProviders);
      if (exerciseProviders.length > 0) {
        setSelectedProviderId(exerciseProviders[0].id);
        setSelectedProviderType(exerciseProviders[0].provider_type);
      } else {
        warn(
          loggingLevel,
          'ExerciseSearch: No enabled exercise providers found.'
        );
      }
    } catch (err) {
      error(
        loggingLevel,
        'ExerciseSearch: Error fetching external data providers:',
        err
      );
      toast({
        title: 'Error',
        description: `Failed to load external providers: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      });
    }
  }, [loggingLevel, toast, searchSource, queryClient]); // Dependencies for useCallback

  useEffect(() => {
    if (searchSource === 'external') {
      fetchProviders();
    }
  }, [searchSource, fetchProviders]); // Dependencies for useEffect

  const handleNextImage = () => {
    setCurrentImageIndex(
      (prevIndex) => (prevIndex + 1) % (exercises[0]?.images?.length || 1)
    );
  };

  const handlePrevImage = () => {
    setCurrentImageIndex(
      (prevIndex) =>
        (prevIndex - 1 + (exercises[0]?.images?.length || 1)) %
        (exercises[0]?.images?.length || 1)
    );
  };

  const handleSpeakInstructions = (instructions: string | string[]) => {
    if (window.speechSynthesis && window.speechSynthesis.speak) {
      const textToSpeak = Array.isArray(instructions)
        ? instructions.join('. ')
        : instructions;
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      window.speechSynthesis.speak(utterance);
    } else {
      toast({
        title: t(
          'exercise.exerciseSearch.textToSpeechNotSupported',
          'Text-to-Speech Not Supported'
        ),
        description: t(
          'exercise.exerciseSearch.textToSpeechNotSupportedDescription',
          'Your browser does not support the Web Speech API.'
        ),
        variant: 'destructive',
      });
    }
  };

  const handleEquipmentToggle = (equipment: string) => {
    setEquipmentFilter((prev) =>
      prev.includes(equipment)
        ? prev.filter((item) => item !== equipment)
        : [...prev, equipment]
    );
  };

  const handleMuscleToggle = (muscle: string) => {
    setMuscleGroupFilter((prev) =>
      prev.includes(muscle)
        ? prev.filter((item) => item !== muscle)
        : [...prev, muscle]
    );
  };

  return (
    <div className="space-y-4">
      {searchSource === 'internal' && (
        <div className="mt-4 space-y-4">
          <div className="flex space-x-2 items-center">
            <Input
              type="text"
              placeholder={t(
                'exercise.exerciseSearch.searchYourExercises',
                'Search your exercises...'
              )}
              value={searchTerm}
              onChange={(e) => {
                debug(
                  loggingLevel,
                  'ExerciseSearch: Internal search term input changed:',
                  e.target.value
                );
                setSearchTerm(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  debug(
                    loggingLevel,
                    'ExerciseSearch: Enter key pressed, triggering internal search.'
                  );
                  handleSearch(searchTerm);
                }
              }}
              className="flex-1"
            />
            <Button onClick={() => handleSearch(searchTerm)} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
          {/* Equipment Filters */}
          <div className="flex flex-wrap gap-2">
            {availableEquipment.map((eq) => (
              <Button
                key={eq}
                variant={equipmentFilter.includes(eq) ? 'default' : 'outline'}
                onClick={() => handleEquipmentToggle(eq)}
              >
                {eq}
              </Button>
            ))}
          </div>

          {/* Muscle Group Filters (Body Map) */}
          <BodyMapFilter
            selectedMuscles={muscleGroupFilter}
            onMuscleToggle={handleMuscleToggle}
            availableMuscleGroups={availableMuscleGroups}
          />

          {loading && (
            <div>{t('exercise.exerciseSearch.loading', 'Searching...')}</div>
          )}
          {searchTerm.trim().length === 0 && !loading && (
            <>
              {recentExercises.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold mb-2">
                    {t(
                      'exercise.exerciseSearch.recentExercises',
                      'Recent Exercises'
                    )}
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-2 border-b pb-4 mb-4">
                    {recentExercises.map((exercise) => (
                      <div
                        key={`recent-${exercise.id}`}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="font-medium">{exercise.name}</div>
                          <div className="text-sm text-gray-500">
                            {exercise.category} •{' '}
                            {Math.round(
                              convertEnergy(
                                exercise.calories_per_hour,
                                'kcal',
                                energyUnit
                              )
                            )}{' '}
                            {getEnergyUnitString(energyUnit)}
                          </div>
                          {exercise.description && (
                            <div className="text-xs text-gray-400">
                              {exercise.description}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => onExerciseSelect(exercise, 'internal')}
                        >
                          {t('exercise.exerciseSearch.selectButton', 'Select')}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {topExercises.length > 0 && (
                <div>
                  <h3 className="text-md font-semibold mb-2">
                    {t('exercise.exerciseSearch.topExercises', 'Top Exercises')}
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-2">
                    {topExercises.map((exercise) => (
                      <div
                        key={`top-${exercise.id}`}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="font-medium">{exercise.name}</div>
                          <div className="text-sm text-gray-500">
                            {exercise.category} •{' '}
                            {Math.round(
                              convertEnergy(
                                exercise.calories_per_hour,
                                'kcal',
                                energyUnit
                              )
                            )}{' '}
                            {getEnergyUnitString(energyUnit)}
                          </div>
                          {exercise.description && (
                            <div className="text-xs text-gray-400">
                              {exercise.description}
                            </div>
                          )}
                        </div>
                        <Button
                          onClick={() => onExerciseSelect(exercise, 'internal')}
                        >
                          {t('exercise.exerciseSearch.selectButton', 'Select')}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {recentExercises.length === 0 && topExercises.length === 0 && (
                <div className="text-center text-gray-500">
                  {t(
                    'exercise.exerciseSearch.noRecentOrTopExercises',
                    'No recent or top exercises found.'
                  )}
                </div>
              )}
            </>
          )}
          {searchTerm.trim().length > 0 && !loading && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {exercise.name}
                      {exercise.tags &&
                        exercise.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="outline"
                            className="text-xs"
                          >
                            {tag === 'public' && (
                              <Share2 className="h-3 w-3 mr-1" />
                            )}
                            {tag === 'family' && (
                              <Users className="h-3 w-3 mr-1" />
                            )}
                            {tag.charAt(0).toUpperCase() + tag.slice(1)}
                          </Badge>
                        ))}
                    </div>
                    <div className="text-sm text-gray-500">
                      {exercise.category} •{' '}
                      {Math.round(
                        convertEnergy(
                          exercise.calories_per_hour,
                          'kcal',
                          energyUnit
                        )
                      )}{' '}
                      {getEnergyUnitString(energyUnit)}
                    </div>
                    {exercise.description && (
                      <div className="text-xs text-gray-400">
                        {exercise.description}
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={() => onExerciseSelect(exercise, 'internal')}
                  >
                    {t('exercise.exerciseSearch.selectButton', 'Select')}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {searchTerm &&
            !loading &&
            exercises.length === 0 &&
            recentExercises.length === 0 &&
            topExercises.length === 0 && (
              <div className="text-center text-gray-500">
                {t(
                  'exercise.exerciseSearch.noExercisesFoundInDatabase',
                  'No exercises found in your database.'
                )}
              </div>
            )}
        </div>
      )}
      {searchSource === 'external' && (
        <div className="mt-4 space-y-4">
          <Select
            value={selectedProviderId || ''}
            onValueChange={(value) => {
              const provider = providers.find((p) => p.id === value);
              setSelectedProviderId(value);
              setSelectedProviderType(provider ? provider.provider_type : null);
            }}
          >
            <SelectTrigger className="w-full mb-2">
              <SelectValue
                placeholder={t(
                  'exercise.exerciseSearch.selectProviderPlaceholder',
                  'Select a provider'
                )}
              />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {' '}
                  {/* Use provider.id for value */}
                  {provider.provider_name} {/* Display provider_name */}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex space-x-2 items-center">
            <Input
              type="text"
              placeholder={
                selectedProviderType === 'nutritionix'
                  ? t(
                      'exercise.exerciseSearch.describeYourExercise',
                      "Describe your exercise (e.g., 'ran 3 miles', 'swam for 30 minutes')"
                    )
                  : t(
                      'exercise.exerciseSearch.searchOnlineDatabase',
                      'Search {{providerName}} database...',
                      { providerName: selectedProviderType || 'Online' }
                    )
              }
              value={searchTerm}
              onChange={(e) => {
                debug(
                  loggingLevel,
                  'ExerciseSearch: External search term input changed:',
                  e.target.value
                );
                setSearchTerm(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  debug(
                    loggingLevel,
                    'ExerciseSearch: Enter key pressed, triggering search.'
                  );
                  handleSearch(searchTerm);
                  setHasSearchedExternal(true);
                }
              }}
              className="flex-1"
            />
            <Button
              onClick={() => {
                handleSearch(searchTerm);
                setHasSearchedExternal(true);
              }}
              disabled={
                loading ||
                (!searchTerm.trim() &&
                  equipmentFilter.length === 0 &&
                  muscleGroupFilter.length === 0)
              }
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>
          </div>
          {/* Equipment Filters */}
          <div className="flex flex-wrap gap-2">
            {availableEquipment.map((eq) => (
              <Button
                key={eq}
                variant={equipmentFilter.includes(eq) ? 'default' : 'outline'}
                onClick={() => handleEquipmentToggle(eq)}
              >
                {eq}
              </Button>
            ))}
          </div>

          {/* Muscle Group Filters (Body Map) */}
          <BodyMapFilter
            selectedMuscles={muscleGroupFilter}
            onMuscleToggle={handleMuscleToggle}
            availableMuscleGroups={availableMuscleGroups}
          />

          {loading && (
            <div>{t('exercise.exerciseSearch.loading', 'Searching...')}</div>
          )}
          {!hasSearchedExternal && !loading && (
            <div className="text-center text-gray-500">
              {t(
                'exercise.exerciseSearch.enterSearchTerm',
                'Enter a search term and click the search button to find exercises.'
              )}
            </div>
          )}
          {hasSearchedExternal && !loading && exercises.length === 0 && (
            <div className="text-center text-gray-500">
              {t(
                'exercise.exerciseSearch.noExercisesFoundOnline',
                'No exercises found in {{providerName}} database for "{{searchTerm}}".',
                { providerName: selectedProviderType || 'Online', searchTerm }
              )}
            </div>
          )}
          <div className="max-h-60 overflow-y-auto space-y-2">
            {exercises.map((exercise) => (
              <div
                key={exercise.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {exercise.name}
                    {exercise.source === 'wger' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800">
                        {t('exercise.exerciseSearch.wgerSource', 'Wger')}
                      </span>
                    )}
                    {exercise.source === 'free-exercise-db' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800">
                        {t(
                          'exercise.exerciseSearch.freeExerciseDBSource',
                          'Free Exercise DB'
                        )}
                      </span>
                    )}
                    {exercise.source === 'nutritionix' && (
                      <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-800">
                        {t(
                          'exercise.exerciseSearch.nutritionixSource',
                          'Nutritionix'
                        )}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {exercise.category}
                    {exercise.calories_per_hour &&
                      ` • ${Math.round(convertEnergy(exercise.calories_per_hour, 'kcal', energyUnit))} ${getEnergyUnitString(energyUnit)}`}
                    {exercise.level &&
                      ` • ${t('exercise.exerciseCard.level', 'Level')}: ${exercise.level}`}
                    {exercise.force &&
                      ` • ${t('exercise.exerciseCard.force', 'Force')}: ${exercise.force}`}
                    {exercise.mechanic &&
                      ` • ${t('exercise.exerciseCard.mechanic', 'Mechanic')}: ${exercise.mechanic}`}
                  </div>
                  {exercise.equipment && exercise.equipment.length > 0 && (
                    <div className="text-xs text-gray-400">
                      {t('exercise.exerciseCard.equipment', 'Equipment')}:{' '}
                      {exercise.equipment.join(', ')}
                    </div>
                  )}
                  {exercise.primary_muscles &&
                    exercise.primary_muscles.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {t(
                          'exercise.exerciseCard.primaryMuscles',
                          'Primary Muscles'
                        )}
                        : {exercise.primary_muscles.join(', ')}
                      </div>
                    )}
                  {exercise.secondary_muscles &&
                    exercise.secondary_muscles.length > 0 && (
                      <div className="text-xs text-gray-400">
                        {t(
                          'exercise.exerciseCard.secondaryMuscles',
                          'Secondary Muscles'
                        )}
                        : {exercise.secondary_muscles.join(', ')}
                      </div>
                    )}
                  {exercise.instructions &&
                    exercise.instructions.length > 0 && (
                      <div className="text-xs text-gray-400 flex items-center">
                        {t(
                          'exercise.exerciseCard.instructions',
                          'Instructions'
                        )}
                        : {exercise.instructions[0]}...
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleSpeakInstructions(exercise.instructions)
                          }
                          className="ml-2"
                        >
                          <Volume2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  {exercise.description && (
                    <div className="text-xs text-gray-400">
                      {exercise.description}
                    </div>
                  )}
                  {exercise.images && exercise.images.length > 0 && (
                    <div className="relative w-32 h-32 mt-2">
                      <img
                        src={exercise.images[currentImageIndex]}
                        alt={exercise.name}
                        className="w-full h-full object-contain"
                      />
                      {exercise.images.length > 1 && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute left-0 top-1/2 -translate-y-1/2"
                            onClick={handlePrevImage}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-1/2 -translate-y-1/2"
                            onClick={handleNextImage}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  onClick={async () => {
                    debug(
                      loggingLevel,
                      'ExerciseSearch: Add/Select button clicked for external exercise:',
                      exercise.name
                    );
                    const newExercise =
                      await handleAddExternalExercise(exercise);
                    if (newExercise) {
                      onExerciseSelect(newExercise, 'external');
                    }
                  }}
                >
                  {selectedProviderType === 'nutritionix' ? (
                    t('exercise.exerciseSearch.selectButton', 'Select')
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />{' '}
                      {t('exercise.exerciseSearch.add', 'Add')}
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExerciseSearch;
