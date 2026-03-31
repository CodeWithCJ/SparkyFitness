import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import SafeImage from '../components/SafeImage';
import EditableSetRow from '../components/EditableSetRow';
import { getSourceLabel, getWorkoutSummary } from '../utils/workoutSession';
import {
  useDeleteWorkout,
  useUpdateWorkout,
} from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { useWorkoutForm } from '../hooks/useWorkoutForm';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { weightToKg, weightFromKg } from '../utils/unitConversions';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import { extractActivitySummary } from '../utils/activityDetails';
import type { RootStackScreenProps } from '../types/navigation';
import type { ExerciseEntryResponse, UpdatePresetSessionRequest } from '@workspace/shared';
import type { Exercise } from '../types/exercise';

type Props = RootStackScreenProps<'WorkoutDetail'>;

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';

  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
  ]) as [string, string, string];

  const { getImageSource } = useExerciseImageSource();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
  const entryDate = session.entry_date ?? '';
  const normalizedDate = normalizeDate(entryDate);

  const { name } = getWorkoutSummary(session);

  const deleteWorkout = useDeleteWorkout({
    sessionId: session.id,
    entryDate: normalizedDate,
    onSuccess: () => navigation.goBack(),
  });

  const isDeleting = deleteWorkout.isPending;

  const { updateSession, isPending: isSaving, invalidateCache: invalidateSessionCache } = useUpdateWorkout();
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState('');

  // Reuse the workout form hook for exercise/set editing
  const {
    state: formState,
    addExercise,
    removeExercise,
    addSet,
    removeSet,
    updateSetField,
    setName: setFormName,
    setDate: setFormDate,
    populate,
    exercisesModifiedRef,
  } = useWorkoutForm({ isEditMode: true, skipDraftLoad: true });

  // Track which set is being edited: "exerciseClientId:setClientId"
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [activeSetField, setActiveSetField] = useState<'weight' | 'reps'>('weight');

  const startEditing = () => {
    populate(session, weightUnit as 'kg' | 'lbs');
    setEditNotes(session.notes ?? '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditNotes('');
    setActiveSetKey(null);
  };

  // --- Exercise editing callbacks ---

  const handleAddExercise = useCallback((exercise: Exercise) => {
    const { exerciseClientId, setClientId } = addExercise(exercise);
    setActiveSetKey(`${exerciseClientId}:${setClientId}`);
  }, [addExercise]);

  useSelectedExercise(route.params, handleAddExercise);

  const handleRemoveExercise = useCallback((exercise: { clientId: string; exerciseName: string; sets: { weight: string; reps: string }[] }) => {
    const hasData = exercise.sets.some(s => s.weight || s.reps);
    const doRemove = () => removeExercise(exercise.clientId);
    if (hasData) {
      Alert.alert(
        'Remove Exercise?',
        `Remove "${exercise.exerciseName}" and all its sets?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', style: 'destructive', onPress: doRemove },
        ],
      );
    } else {
      doRemove();
    }
  }, [removeExercise]);

  const handleAddSet = useCallback((exerciseClientId: string) => {
    const newSetId = addSet(exerciseClientId);
    if (newSetId) {
      setActiveSetKey(`${exerciseClientId}:${newSetId}`);
    }
  }, [addSet]);

  // --- Save ---

  const handleSave = async () => {
    const editedDate = formState.entryDate;
    const dateChanged = editedDate !== normalizedDate;

    try {
      const exercisesWithSets = formState.exercises.filter(e => e.sets.length > 0);
      const payload: UpdatePresetSessionRequest = {
        name: formState.name.trim() || session.name,
        entry_date: editedDate,
        notes: editNotes || null,
        ...(exercisesModifiedRef.current && exercisesWithSets.length > 0 ? {
          exercises: exercisesWithSets.map((exercise, index) => ({
            exercise_id: exercise.exerciseId,
            sort_order: index,
            duration_minutes: 0,
            sets: exercise.sets.map((set, setIndex) => {
              const weight = parseFloat(set.weight);
              const reps = parseInt(set.reps, 10);
              return {
                set_number: setIndex + 1,
                weight: isNaN(weight) ? null : weightToKg(weight, weightUnit),
                reps: isNaN(reps) ? null : reps,
              };
            }),
          })),
        } : {}),
      };
      const updatedSession = await updateSession({ id: session.id, payload });
      invalidateSessionCache(editedDate);
      if (dateChanged) invalidateSessionCache(normalizedDate);
      setSession(updatedSession);
      setIsEditing(false);
      setEditNotes('');
      setActiveSetKey(null);
    } catch (error) {
      addLog(`Failed to save workout: ${error}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to save workout', text2: 'Please try again.' });
    }
  };

  // --- Formatting helpers ---

  const getExerciseSetSummary = (exercise: ExerciseEntryResponse): string => {
    if (exercise.sets.length === 0) return '';
    const firstSet = exercise.sets[0];
    const allSame = exercise.sets.every(
      s => s.weight === firstSet.weight && s.reps === firstSet.reps
    );
    if (allSame && firstSet.weight != null && firstSet.reps != null) {
      const displayWeight = parseFloat(weightFromKg(firstSet.weight, weightUnit as 'kg' | 'lbs').toFixed(1));
      return `${exercise.sets.length} \u00d7 ${firstSet.reps} @ ${displayWeight} ${weightUnit}`;
    }
    return `${exercise.sets.length} sets`;
  };

  const getExerciseVolume = (exercise: ExerciseEntryResponse): number => {
    return exercise.sets.reduce((total, set) => {
      return total + (set.weight ?? 0) * (set.reps ?? 0);
    }, 0);
  };

  const formatVolume = (volumeKg: number): string => {
    const value = weightFromKg(volumeKg, weightUnit as 'kg' | 'lbs');
    return `${Math.round(value).toLocaleString()} ${weightUnit}`;
  };

  // --- Read-only render helpers ---

  const renderSetTable = (exercise: ExerciseEntryResponse) => {
    if (exercise.sets.length === 0) return null;

    return (
      <View className="mt-2">
        <View className="flex-row py-1 mb-1">
          <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
          <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
          <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
        </View>
        {exercise.sets.map(set => {
          const displayWeight = set.weight != null
            ? `${parseFloat(weightFromKg(set.weight, weightUnit as 'kg' | 'lbs').toFixed(1))} ${weightUnit}`
            : '\u2014';
          const displayReps = set.reps != null ? String(set.reps) : '\u2014';

          return (
            <View key={set.id} className="flex-row py-1.5">
              <Text className="text-sm text-text-muted w-10 text-center">{set.set_number}</Text>
              <Text className="text-sm text-text-primary flex-1 text-center">{displayWeight}</Text>
              <Text className="text-sm text-text-primary flex-1 text-center">{displayReps}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderEditableExercises = () => (
    <View>
      {formState.exercises.map(exercise => {
        const snapshot = exercise.snapshot;
        const metadataItems = [snapshot?.category, snapshot?.level, snapshot?.force, snapshot?.mechanic].filter(Boolean);

        return (
          <View key={exercise.clientId}>
            <View className="border-t border-border-subtle" />
            <View className="flex-row items-start py-4">
              <SafeImage
                source={snapshot?.images?.[0] ? getImageSource(snapshot.images[0]) : null}
                style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, marginTop: 2, opacity: 0.8 }}
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
                    {exercise.exerciseName}
                  </Text>
                  <Button
                    variant="ghost"
                    onPress={() => handleRemoveExercise(exercise)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="py-0 px-0"
                  >
                    <Icon name="close" size={18} color={textMuted} />
                  </Button>
                </View>

                {metadataItems.length > 0 && (
                  <Text className="text-xs text-text-muted mt-1">
                    {metadataItems.join(' \u2022 ')}
                  </Text>
                )}

                {exercise.sets.length > 0 && (
                  <>
                    <View className="border-t border-border-subtle mt-3 mb-1" />
                    <View className="mt-2">
                      <View className="flex-row items-center py-1 mb-1">
                        <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
                        <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
                        <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
                        <View style={{ width: 18 }} />
                      </View>
                      {exercise.sets.map((set, index) => {
                        const setKey = `${exercise.clientId}:${set.clientId}`;
                        const isLastSet = index === exercise.sets.length - 1;
                        return (
                          <EditableSetRow
                            key={set.clientId}
                            set={set}
                            setNumber={index + 1}
                            isActive={activeSetKey === setKey}
                            initialFocusField={activeSetField}
                            weightUnit={weightUnit}
                            onActivate={(field) => {
                              setActiveSetField(field ?? 'weight');
                              setActiveSetKey(setKey);
                            }}
                            onDeactivate={() => setActiveSetKey(null)}
                            onUpdateField={(field, value) => updateSetField(exercise.clientId, set.clientId, field, value)}
                            onRemove={() => removeSet(exercise.clientId, set.clientId)}
                            onAdvance={isLastSet ? () => handleAddSet(exercise.clientId) : undefined}
                          />
                        );
                      })}
                    </View>
                  </>
                )}

                <TouchableOpacity
                  className="flex-row items-center self-start py-2 mt-1 rounded-lg"
                  onPress={() => handleAddSet(exercise.clientId)}
                  activeOpacity={0.6}
                >
                  <Icon name="add-circle" size={16} color={accentPrimary} />
                  <Text className="text-xs font-medium ml-1" style={{ color: accentPrimary }}>
                    Add Set
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );

  const renderViewExercises = () => (
    <View>
      {session.exercises.map(exercise => {
        const isExpanded = !!expandedSections[exercise.id];
        const snapshot = exercise.exercise_snapshot;
        const metadataItems = [snapshot?.category, snapshot?.level, snapshot?.force, snapshot?.mechanic].filter(Boolean);
        const volume = getExerciseVolume(exercise);

        return (
          <View key={exercise.id}>
            <View className="border-t border-border-subtle" />
            <TouchableOpacity
              className="flex-row items-start py-4"
              onPress={() => toggleSection(exercise.id)}
              activeOpacity={0.7}
            >
              <SafeImage
                source={snapshot?.images?.[0] ? getImageSource(snapshot.images[0]) : null}
                style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12, marginTop: 2, opacity: 0.8 }}
              />
              <View className="flex-1">
                <View className="flex-row items-center justify-between">
                  <Text className="text-lg font-semibold text-text-primary flex-1 mr-2" numberOfLines={1}>
                    {snapshot?.name ?? 'Unknown exercise'}
                  </Text>
                  <Icon
                    name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                    size={18}
                    color={textMuted}
                  />
                </View>

                {isExpanded ? (
                  <>
                    {metadataItems.length > 0 && (
                      <Text className="text-xs text-text-muted mt-1">
                        {metadataItems.join(' \u2022 ')}
                      </Text>
                    )}
                    {exercise.sets.length > 0 && (
                      <>
                        <View className="border-t border-border-subtle mt-3 mb-1" />
                        {renderSetTable(exercise)}
                      </>
                    )}
                  </>
                ) : (
                  exercise.sets.length > 0 && (
                    <View className="mt-1">
                      <Text className="text-sm text-text-secondary">
                        {getExerciseSetSummary(exercise)}
                      </Text>
                      {volume > 0 && (
                        <Text className="text-xs text-text-muted mt-0.5">
                          Volume: {formatVolume(volume)}
                        </Text>
                      )}
                    </View>
                  )
                )}
              </View>
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  // --- Other content render helpers ---

  const renderActivityDetails = () => {
    const details = session.activity_details;
    if (!details || details.length === 0) return null;

    const items = extractActivitySummary(details);
    if (items.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        <Text className="text-base font-semibold text-text-primary mb-2">Details</Text>
        {items.map((item, i) => (
          <View
            key={`${item.label}-${i}`}
            className={`flex-row justify-between py-2 ${i < items.length - 1 ? 'border-b border-border-subtle' : ''}`}
          >
            <Text className="text-sm text-text-secondary">{item.label}</Text>
            <Text className="text-sm text-text-primary">{item.value}</Text>
          </View>
        ))}
      </View>
    );
  };

  // --- Summary card ---

  const renderSummaryCard = () => {
    const exercises = isEditing ? formState.exercises : session.exercises;
    const exerciseCount = exercises.length;
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const totalVolume = isEditing
      ? formState.exercises.reduce((sum, ex) => ex.sets.reduce((s, set) => {
          const w = parseFloat(set.weight);
          const r = parseInt(set.reps, 10);
          return s + (isNaN(w) || isNaN(r) ? 0 : w * r);
        }, sum), 0)
      : session.exercises.reduce((sum, ex) => sum + getExerciseVolume(ex), 0);

    const summaryItems: { value: string; label: string }[] = [];
    summaryItems.push({
      value: String(exerciseCount),
      label: exerciseCount === 1 ? 'Exercise' : 'Exercises',
    });
    if (totalSets > 0) summaryItems.push({ value: String(totalSets), label: 'Sets' });
    if (totalVolume > 0) {
      const volumeLabel = isEditing
        ? `${Math.round(totalVolume).toLocaleString()} ${weightUnit}`
        : formatVolume(totalVolume);
      summaryItems.push({ value: volumeLabel, label: 'Volume' });
    }
    if (summaryItems.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4">
        <View className="flex-row items-center justify-around">
          {summaryItems.map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && (
                <View style={{ width: 1, height: 32, backgroundColor: borderSubtle }} />
              )}
              <View className="items-center">
                <Text className="text-lg font-semibold text-text-primary">{item.value}</Text>
                <Text className="text-xs text-text-muted mt-0.5">{item.label}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        {isEditing ? (
          <>
            <Button
              variant="ghost"
              onPress={cancelEditing}
              disabled={isSaving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0"
            >
              <Text className="text-accent-primary text-base font-medium">Cancel</Text>
            </Button>
            <View className="flex-1" />
            <Button
              variant="ghost"
              onPress={handleSave}
              disabled={isSaving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={accentPrimary} />
              ) : (
                <Text className="text-accent-primary text-base font-semibold">Save</Text>
              )}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              onPress={() => navigation.goBack()}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0"
            >
              <Icon name="chevron-back" size={22} color={accentPrimary} />
            </Button>
            <View className="flex-1" />
            {isSparky && (
              <Button
                variant="ghost"
                onPress={startEditing}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                className="py-0 px-0"
              >
                <Text className="text-accent-primary text-base font-medium">Edit</Text>
              </Button>
            )}
          </>
        )}
      </View>

      <KeyboardAwareScrollView contentContainerClassName="px-4 py-4" bottomOffset={20} keyboardShouldPersistTaps="handled">
        {/* Title area */}
        <View className="mb-4">
          {isEditing ? (
            <FormInput
              value={formState.name}
              onChangeText={setFormName}
              placeholder="Workout Name"
              className="text-xl font-bold text-text-primary mb-1"
              style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 0, paddingBottom: 0 }}
            />
          ) : (
            <Text className="text-xl font-bold text-text-primary mb-1">{name}</Text>
          )}
          <View className="flex-row items-center">
            <Text className="text-sm text-text-muted">{sourceLabel}</Text>
            <Text className="text-sm text-text-muted mx-2">{'\u2022'}</Text>
            {isEditing ? (
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => calendarSheetRef.current?.present()}
                activeOpacity={0.7}
              >
                <Text className="text-sm" style={{ color: accentPrimary }}>
                  {formatDateLabel(formState.entryDate)}
                </Text>
                <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : entryDate ? (
              <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* Summary card */}
        {renderSummaryCard()}

        {/* Exercises */}
        {isEditing ? renderEditableExercises() : renderViewExercises()}

        {/* Edit controls */}
        {isEditing && (
          <>
            <View className="py-4">
              <TouchableOpacity
                className="flex-row items-center self-center py-2 px-3 rounded-lg"
                onPress={() => navigation.navigate('ExerciseSearch', { returnKey: route.key })}
                activeOpacity={0.6}
              >
                <Icon name="add-circle" size={20} color={accentPrimary} />
                <Text className="text-base font-medium ml-2" style={{ color: accentPrimary }}>
                  Add Exercise
                </Text>
              </TouchableOpacity>
            </View>

            <View className="mt-4">
              <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
              <FormInput
                value={editNotes}
                onChangeText={setEditNotes}
                placeholder="Add notes..."
                multiline
                style={{ minHeight: 60 }}
              />
            </View>
          </>
        )}

        {/* Notes (view mode) */}
        {!isEditing && session.notes && (
          <View className="mt-4 px-4">
            <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
            <Text className="text-sm text-text-primary">{session.notes}</Text>
          </View>
        )}

        {renderActivityDetails()}

        {/* Delete button */}
        {isEditing && (
          <Button
            variant="ghost"
            onPress={() => deleteWorkout.confirmAndDelete()}
            disabled={isDeleting}
            className="mt-6"
          >
            <Text className="text-bg-danger text-base font-medium">
              {isDeleting ? 'Deleting...' : 'Delete Workout'}
            </Text>
          </Button>
        )}
      </KeyboardAwareScrollView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={isEditing ? formState.entryDate : normalizedDate}
        onSelectDate={setFormDate}
      />
    </View>
  );
};

export default WorkoutDetailScreen;
