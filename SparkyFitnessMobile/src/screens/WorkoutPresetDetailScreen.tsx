import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import RestPeriodChip, { formatRest } from '../components/RestPeriodChip';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useDeleteWorkoutPreset,
  usePreferences,
  useProfile,
  useServerConnection,
} from '../hooks';
import { weightFromKg } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutPresetExercise, WorkoutPresetSet } from '../types/workoutPresets';

type WorkoutPresetDetailScreenProps = RootStackScreenProps<'WorkoutPresetDetail'>;

const EM_DASH = '—';

function formatSetSummary(set: WorkoutPresetSet, weightUnit: 'kg' | 'lbs'): string {
  // Time-based set: render duration only — these are stored without reps/weight,
  // so falling back to "— × —" would look like missing data.
  if (set.duration != null) {
    return formatRest(set.duration);
  }
  const repsText = set.reps != null ? String(set.reps) : EM_DASH;
  const weightText = set.weight != null
    ? `${parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1))} ${weightUnit}`
    : EM_DASH;
  return `${repsText} × ${weightText}`;
}

interface PresetExerciseRowProps {
  exercise: WorkoutPresetExercise;
  weightUnit: 'kg' | 'lbs';
}

const PresetExerciseRow: React.FC<PresetExerciseRowProps> = ({ exercise, weightUnit }) => {
  return (
    <View className="bg-surface rounded-xl px-4 py-4 mb-3">
      <Text className="text-base font-semibold text-text-primary mb-2">
        {exercise.exercise_name}
      </Text>
      {exercise.sets.length === 0 ? (
        <Text className="text-sm text-text-secondary">No sets</Text>
      ) : (
        exercise.sets.map((set, index) => (
          <View
            key={set.id}
            className={`flex-row items-center justify-between py-2 ${
              index < exercise.sets.length - 1 ? 'border-b border-border-subtle' : ''
            }`}
          >
            <View className="flex-row items-center flex-1">
              <Text className="text-sm text-text-muted w-10">{set.set_number}</Text>
              <Text className="text-sm text-text-primary ml-2">
                {formatSetSummary(set, weightUnit)}
              </Text>
            </View>
            <RestPeriodChip readOnly value={set.rest_time} />
          </View>
        ))
      )}
    </View>
  );
};

const WorkoutPresetDetailScreen: React.FC<WorkoutPresetDetailScreenProps> = ({
  navigation,
  route,
}) => {
  const preset = route.params.updatedPreset ?? route.params.preset;
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { preferences } = usePreferences();
  const { profile } = useProfile();
  const { isConnected } = useServerConnection();
  // Workout screens only know how to display kg or lbs. Coerce st_lbs to lbs so
  // we never quietly hand an unsupported unit to weightFromKg.
  const weightUnit: 'kg' | 'lbs' =
    preferences?.default_weight_unit === 'kg' ? 'kg' : 'lbs';
  const exerciseCount = preset.exercises?.length ?? 0;

  // WorkoutPreset uses snake_case `user_id` (it's a thin wrapper over server
  // JSON), unlike Exercise/FoodInfoItem which use camelCase `userId`.
  const canManagePreset = !!(
    isConnected && preset.user_id && profile?.id === preset.user_id
  );

  const { confirmAndDelete, isPending: isDeletePending } = useDeleteWorkoutPreset({
    presetId: preset.id,
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Workout preset deleted' });
      navigation.goBack();
    },
  });

  const handleStartWorkout = () => {
    navigation.navigate('WorkoutAdd', { preset, popCount: 2 });
  };

  const handleEdit = () => {
    navigation.navigate('WorkoutPresetForm', {
      mode: 'edit-preset',
      preset,
      returnKey: route.key,
    });
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon name="chevron-back" size={22} color={accentColor} />
        </TouchableOpacity>
        {canManagePreset && (
          <View className="ml-auto">
            <Button
              variant="ghost"
              onPress={handleEdit}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              textClassName="font-medium"
            >
              Edit
            </Button>
          </View>
        )}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
        }}
      >
        <Text className="text-2xl font-bold text-text-primary">{preset.name}</Text>
        {preset.description ? (
          <Text className="text-base text-text-secondary mt-2">{preset.description}</Text>
        ) : null}
        <Text className="text-sm text-text-muted mt-2 mb-4">
          {exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'}
        </Text>

        {preset.exercises?.map((exercise) => (
          <PresetExerciseRow
            key={exercise.id}
            exercise={exercise}
            weightUnit={weightUnit}
          />
        ))}

        <Button variant="primary" onPress={handleStartWorkout} className="mt-4">
          <Text className="text-white text-base font-semibold">Start workout</Text>
        </Button>

        {canManagePreset && (
          <Button
            variant="ghost"
            onPress={confirmAndDelete}
            disabled={isDeletePending}
            className="mt-3"
            textClassName="text-bg-danger font-medium"
          >
            {isDeletePending ? 'Deleting...' : 'Delete preset'}
          </Button>
        )}
      </ScrollView>
    </View>
  );
};

export default WorkoutPresetDetailScreen;
