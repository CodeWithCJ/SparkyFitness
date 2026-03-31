import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, TextInput, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import SafeImage from '../components/SafeImage';
import { getSourceLabel, formatDuration, getWorkoutSummary } from '../utils/workoutSession';
import {
  useDeleteExerciseEntry,
  useDeleteWorkout,
  useUpdateExerciseEntry,
  useUpdateWorkout,
} from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { useSelectedExercise } from '../hooks/useSelectedExercise';
import { syncExerciseSessionInCache } from '../hooks/syncExerciseSessionInCache';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { extractActivitySummary } from '../utils/activityDetails';
import { weightFromKg, weightToKg, distanceFromKm, distanceToKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type { ExerciseEntryResponse, ExerciseSnapshotResponse, UpdatePresetSessionRequest } from '@workspace/shared';
import type { Exercise } from '../types/exercise';

type Props = RootStackScreenProps<'WorkoutDetail'>;

interface EditableSet {
  clientId: string;
  weight: string;
  reps: string;
}

interface EditableExercise {
  clientId: string;
  exerciseId: string;
  exerciseName: string;
  exerciseCategory: string | null;
  snapshot: ExerciseSnapshotResponse | null;
  sets: EditableSet[];
}

function generateClientId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, borderSubtle, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
    '--color-bg-danger',
  ]) as [string, string, string, string];

  const { getImageSource } = useExerciseImageSource();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const { label: sourceLabel } = getSourceLabel(session.source);
  const entryDate = session.entry_date ?? '';
  const normalizedDate = normalizeDate(entryDate);

  const isPreset = session.type === 'preset';
  const { name, duration, calories } = getWorkoutSummary(session);

  // Delete hooks (only one will be used based on session type)
  const deleteActivity = useDeleteExerciseEntry({
    entryId: session.id,
    entryDate: normalizedDate,
    onSuccess: () => {
      deleteActivity.invalidateCache();
      navigation.goBack();
    },
  });

  const deleteWorkout = useDeleteWorkout({
    sessionId: session.id,
    entryDate: normalizedDate,
    onSuccess: () => {
      deleteWorkout.invalidateCache();
      navigation.goBack();
    },
  });

  const handleDelete = () => {
    if (isPreset) {
      deleteWorkout.confirmAndDelete();
    } else {
      deleteActivity.confirmAndDelete();
    }
  };

  const isDeleting = deleteActivity.isPending || deleteWorkout.isPending;

  const { updateEntry, isPending: isUpdatingEntry, invalidateCache: invalidateEntryCache } = useUpdateExerciseEntry();
  const { updateSession, isPending: isUpdatingSession, invalidateCache: invalidateSessionCache } = useUpdateWorkout();
  const isSaving = isUpdatingEntry || isUpdatingSession;
  const [isEditing, setIsEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});

  // Preset exercise editing state
  const [editExercises, setEditExercises] = useState<EditableExercise[]>([]);
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [activeSetField, setActiveSetField] = useState<'weight' | 'reps'>('weight');
  const exercisesModifiedRef = useRef(false);
  const repsInputRef = useRef<TextInput>(null);

  const updateEditValue = (key: string, value: string) => {
    setEditValues(prev => ({ ...prev, [key]: value }));
  };

  const startEditing = () => {
    if (session.type === 'individual') {
      const displayDistance = session.distance != null && session.distance > 0
        ? distanceFromKm(session.distance, distanceUnit).toFixed(2)
        : '';
      setEditValues({
        entry_date: normalizedDate,
        name: session.name ?? session.exercise_snapshot?.name ?? '',
        notes: session.notes ?? '',
        calories_burned: session.calories_burned > 0 ? String(Math.round(session.calories_burned)) : '',
        duration_minutes: session.duration_minutes > 0 ? String(session.duration_minutes) : '',
        distance: displayDistance,
        avg_heart_rate: session.avg_heart_rate != null ? String(session.avg_heart_rate) : '',
      });
    } else {
      setEditValues({
        entry_date: normalizedDate,
        name: session.name ?? '',
        notes: session.notes ?? '',
      });
      setEditExercises(session.exercises.map(exercise => ({
        clientId: generateClientId(),
        exerciseId: exercise.exercise_id,
        exerciseName: exercise.exercise_snapshot?.name ?? 'Unknown',
        exerciseCategory: exercise.exercise_snapshot?.category ?? null,
        snapshot: exercise.exercise_snapshot ?? null,
        sets: exercise.sets.map(set => ({
          clientId: generateClientId(),
          weight: set.weight != null
            ? String(parseFloat(weightFromKg(set.weight, weightUnit as 'kg' | 'lbs').toFixed(1)))
            : '',
          reps: set.reps != null ? String(set.reps) : '',
        })),
      })));
      exercisesModifiedRef.current = false;
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValues({});
    setEditExercises([]);
    setActiveSetKey(null);
    exercisesModifiedRef.current = false;
  };

  // --- Preset exercise/set editing ---

  const handleAddExercise = useCallback((exercise: Exercise) => {
    exercisesModifiedRef.current = true;
    const exerciseClientId = generateClientId();
    const setClientId = generateClientId();
    setEditExercises(prev => [...prev, {
      clientId: exerciseClientId,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      exerciseCategory: exercise.category,
      snapshot: null,
      sets: [{ clientId: setClientId, weight: '', reps: '' }],
    }]);
    setActiveSetKey(`${exerciseClientId}:${setClientId}`);
  }, []);

  useSelectedExercise(route.params, handleAddExercise);

  const handleRemoveExercise = useCallback((exercise: EditableExercise) => {
    const hasData = exercise.sets.some(s => s.weight || s.reps);
    const doRemove = () => {
      exercisesModifiedRef.current = true;
      setEditExercises(prev => prev.filter(e => e.clientId !== exercise.clientId));
    };
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
  }, []);

  const handleAddSet = useCallback((exerciseClientId: string) => {
    exercisesModifiedRef.current = true;
    const newClientId = generateClientId();
    setEditExercises(prev => prev.map(ex => {
      if (ex.clientId !== exerciseClientId) return ex;
      const lastSet = ex.sets[ex.sets.length - 1];
      return {
        ...ex,
        sets: [...ex.sets, {
          clientId: newClientId,
          weight: lastSet?.weight ?? '',
          reps: lastSet?.reps ?? '',
        }],
      };
    }));
    setActiveSetKey(`${exerciseClientId}:${newClientId}`);
  }, []);

  const handleRemoveSet = useCallback((exerciseClientId: string, setClientId: string) => {
    exercisesModifiedRef.current = true;
    setEditExercises(prev => prev.map(ex => {
      if (ex.clientId !== exerciseClientId) return ex;
      return { ...ex, sets: ex.sets.filter(s => s.clientId !== setClientId) };
    }));
  }, []);

  const handleUpdateSetField = useCallback((exerciseClientId: string, setClientId: string, field: 'weight' | 'reps', value: string) => {
    exercisesModifiedRef.current = true;
    setEditExercises(prev => prev.map(ex => {
      if (ex.clientId !== exerciseClientId) return ex;
      return {
        ...ex,
        sets: ex.sets.map(s => {
          if (s.clientId !== setClientId) return s;
          return { ...s, [field]: value };
        }),
      };
    }));
  }, []);

  // --- Save ---

  const handleSave = async () => {
    const editedDate = editValues.entry_date || normalizedDate;
    const dateChanged = editedDate !== normalizedDate;

    try {
      if (session.type === 'individual') {
        const distanceValue = editValues.distance ? parseFloat(editValues.distance) : null;
        const payload = {
          exercise_id: session.exercise_id,
          exercise_name: editValues.name || null,
          duration_minutes: parseFloat(editValues.duration_minutes) || 0,
          calories_burned: parseFloat(editValues.calories_burned) || 0,
          entry_date: editedDate,
          distance: distanceValue != null ? distanceToKm(distanceValue, distanceUnit) : null,
          avg_heart_rate: editValues.avg_heart_rate ? parseInt(editValues.avg_heart_rate, 10) : null,
          notes: editValues.notes || null,
        };
        const updatedEntry = await updateEntry({ id: session.id, payload });
        invalidateEntryCache(editedDate);
        if (dateChanged) invalidateEntryCache(normalizedDate);
        const updatedSession = {
          ...session,
          ...updatedEntry,
          entry_date: editedDate,
          name: payload.exercise_name ?? null,
          notes: payload.notes,
          calories_burned: payload.calories_burned,
          duration_minutes: payload.duration_minutes,
          distance: distanceValue != null ? distanceToKm(distanceValue, distanceUnit) : null,
          avg_heart_rate: payload.avg_heart_rate,
        };
        syncExerciseSessionInCache(queryClient, updatedSession);
        setSession(updatedSession);
      } else {
        const exercisesWithSets = editExercises.filter(e => e.sets.length > 0);
        const payload: UpdatePresetSessionRequest = {
          name: editValues.name.trim() || session.name,
          entry_date: editedDate,
          notes: editValues.notes || null,
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
      }
      setIsEditing(false);
      setEditValues({});
      setEditExercises([]);
      setActiveSetKey(null);
      exercisesModifiedRef.current = false;
    } catch {}
  };

  // --- Formatting helpers ---

  const formatDistance = (distanceKm: number): string => {
    const value = distanceFromKm(distanceKm, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    return `${value.toFixed(2)} ${label}`;
  };

  const getExerciseSetSummary = (exercise: ExerciseEntryResponse): string => {
    if (exercise.sets.length === 0) return '';
    const firstSet = exercise.sets[0];
    const allSame = exercise.sets.every(
      s => s.weight === firstSet.weight && s.reps === firstSet.reps
    );
    if (allSame && firstSet.weight != null && firstSet.reps != null) {
      const displayWeight = parseFloat(weightFromKg(firstSet.weight, weightUnit as 'kg' | 'lbs').toFixed(1));
      return `${exercise.sets.length} × ${firstSet.reps} @ ${displayWeight} ${weightUnit}`;
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
            : '—';
          const displayReps = set.reps != null ? String(set.reps) : '—';

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

  const renderMetadataBadges = (snapshot: ExerciseSnapshotResponse | null | undefined) => {
    if (!snapshot) return null;
    const badges = [snapshot.level, snapshot.force, snapshot.mechanic].filter(Boolean);
    if (badges.length === 0) return null;

    return (
      <View className="flex-row flex-wrap gap-1 mt-1">
        {badges.map(badge => (
          <View
            key={badge}
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${textMuted}15` }}
          >
            <Text className="text-xs text-text-muted capitalize">{badge}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderExerciseImages = (images: string[] | null | undefined, size: number = 200) => {
    if (!images?.length) return null;
    const sources = images.map(img => getImageSource(img)).filter(Boolean);
    if (sources.length === 0) return null;

    if (sources.length === 1) {
      return (
        <View className="items-center mt-3 mb-1">
          <SafeImage source={sources[0]!} style={{ width: size, height: size, borderRadius: 12 }} />
        </View>
      );
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 mb-1">
        <View className="flex-row gap-3">
          {sources.map((src, i) => (
            <SafeImage key={i} source={src!} style={{ width: size, height: size, borderRadius: 12 }} />
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderPresetContent = () => {
    if (session.type !== 'preset') return null;

    // In edit mode, render from editExercises with editable sets
    if (isEditing) {
      return (
        <View>
          {editExercises.map(exercise => {
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
                        {metadataItems.join(' • ')}
                      </Text>
                    )}

                    {exercise.sets.length > 0 && (
                      <>
                        <View className="border-t border-border-subtle mt-3 mb-1" />
                        {renderEditableSetTable(exercise)}
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
    }

    // View mode
    return (
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
                          {metadataItems.join(' • ')}
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
  };

  // --- Editable set table (matches read-only table layout) ---

  const renderEditableSetTable = (exercise: EditableExercise) => {
    if (exercise.sets.length === 0) return null;

    return (
      <View className="mt-2">
        <View className="flex-row py-1 mb-1">
          <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
          <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
          <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
        </View>
        {exercise.sets.map((set, index) => {
          const setKey = `${exercise.clientId}:${set.clientId}`;
          const isActive = activeSetKey === setKey;

          if (isActive) {
            return (
              <View key={set.clientId} className="flex-row items-center py-1.5">
                <Text className="text-sm text-text-muted w-10 text-center">{index + 1}</Text>
                <View className="flex-1 items-center">
                  <FormInput
                    style={{ width: 80, textAlign: 'center', paddingTop: 4, paddingBottom: 4, paddingLeft: 6, paddingRight: 6 }}
                    value={set.weight}
                    onChangeText={(v: string) => handleUpdateSetField(exercise.clientId, set.clientId, 'weight', v)}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    autoFocus={activeSetField === 'weight'}
                    onSubmitEditing={() => repsInputRef.current?.focus()}
                  />
                </View>
                <View className="flex-1 items-center">
                  <FormInput
                    ref={repsInputRef}
                    style={{ width: 60, textAlign: 'center', paddingTop: 4, paddingBottom: 4, paddingLeft: 6, paddingRight: 6 }}
                    value={set.reps}
                    onChangeText={(v: string) => handleUpdateSetField(exercise.clientId, set.clientId, 'reps', v)}
                    placeholder="0"
                    keyboardType="number-pad"
                    returnKeyType="done"
                    autoFocus={activeSetField === 'reps'}
                    onSubmitEditing={() => setActiveSetKey(null)}
                  />
                </View>
                <Button
                  variant="ghost"
                  onPress={() => handleRemoveSet(exercise.clientId, set.clientId)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="py-0 px-0"
                >
                  <Icon name="remove-circle" size={18} color={dangerColor} />
                </Button>
              </View>
            );
          }

          const displayWeight = set.weight ? `${set.weight} ${weightUnit}` : '—';
          const displayReps = set.reps || '—';

          return (
            <ReanimatedSwipeable
              key={set.clientId}
              renderRightActions={() => (
                <TouchableOpacity
                  className="bg-bg-danger justify-center items-center"
                  style={{ width: 72 }}
                  onPress={() => handleRemoveSet(exercise.clientId, set.clientId)}
                  activeOpacity={0.7}
                >
                  <Text className="text-text-danger font-semibold text-sm">Delete</Text>
                </TouchableOpacity>
              )}
              overshootRight={false}
              rightThreshold={40}
            >
              <View className="flex-row py-1.5 bg-background">
                <Text className="text-sm text-text-muted w-10 text-center">{index + 1}</Text>
                <TouchableOpacity
                  className="flex-1"
                  onPress={() => { setActiveSetField('weight'); setActiveSetKey(setKey); }}
                  activeOpacity={0.6}
                >
                  <Text className="text-sm text-text-primary text-center">{displayWeight}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  className="flex-1"
                  onPress={() => { setActiveSetField('reps'); setActiveSetKey(setKey); }}
                  activeOpacity={0.6}
                >
                  <Text className="text-sm text-text-primary text-center">{displayReps}</Text>
                </TouchableOpacity>
              </View>
            </ReanimatedSwipeable>
          );
        })}
      </View>
    );
  };

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

  const renderIndividualContent = () => {
    if (session.type !== 'individual') return null;

    const metrics: { label: string; value: string }[] = [];

    if (session.distance != null && session.distance > 0) {
      metrics.push({ label: 'Distance', value: formatDistance(session.distance) });
    }
    if (session.avg_heart_rate != null) {
      metrics.push({ label: 'Avg Heart Rate', value: `${session.avg_heart_rate} bpm` });
    }
    if (session.notes) {
      metrics.push({ label: 'Notes', value: session.notes });
    }

    if (metrics.length === 0) return null;

    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        {metrics.map((metric, i) => (
          <View
            key={metric.label}
            className={`flex-row justify-between py-2 ${i < metrics.length - 1 ? 'border-b border-border-subtle' : ''}`}
          >
            <Text className="text-sm text-text-secondary">{metric.label}</Text>
            <Text className="text-sm text-text-primary flex-1 text-right ml-4" numberOfLines={2}>
              {metric.value}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  const renderIndividualEditForm = () => (
    <View className="bg-surface rounded-xl p-4">
      <View className="mb-3">
        <Text className="text-sm font-medium text-text-secondary mb-1">Duration (min)</Text>
        <FormInput
          value={editValues.duration_minutes ?? ''}
          onChangeText={(v) => updateEditValue('duration_minutes', v)}
          keyboardType="numeric"
          placeholder="0"
        />
      </View>
      <View className="mb-3">
        <Text className="text-sm font-medium text-text-secondary mb-1">Calories</Text>
        <FormInput
          value={editValues.calories_burned ?? ''}
          onChangeText={(v) => updateEditValue('calories_burned', v)}
          keyboardType="numeric"
          placeholder="0"
        />
      </View>
      <View className="mb-3">
        <Text className="text-sm font-medium text-text-secondary mb-1">
          Distance ({distanceUnit === 'miles' ? 'mi' : 'km'})
        </Text>
        <FormInput
          value={editValues.distance ?? ''}
          onChangeText={(v) => updateEditValue('distance', v)}
          keyboardType="decimal-pad"
          placeholder="0.00"
        />
      </View>
      <View className="mb-3">
        <Text className="text-sm font-medium text-text-secondary mb-1">Avg Heart Rate (bpm)</Text>
        <FormInput
          value={editValues.avg_heart_rate ?? ''}
          onChangeText={(v) => updateEditValue('avg_heart_rate', v)}
          keyboardType="numeric"
          placeholder=""
        />
      </View>
      <View>
        <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
        <FormInput
          value={editValues.notes ?? ''}
          onChangeText={(v) => updateEditValue('notes', v)}
          placeholder="Add notes..."
          multiline
          style={{ minHeight: 60 }}
        />
      </View>
    </View>
  );

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
            {session.source === 'sparky' && (
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
              value={editValues.name ?? ''}
              onChangeText={(v) => updateEditValue('name', v)}
              placeholder="Workout Name"
              className="text-xl font-bold text-text-primary mb-1"
              style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 0, paddingBottom: 0 }}
            />
          ) : (
            <Text className="text-xl font-bold text-text-primary mb-1">{name}</Text>
          )}
          <View className="flex-row items-center">
            <Text className="text-sm text-text-muted">{sourceLabel}</Text>
            <Text className="text-sm text-text-muted mx-2">•</Text>
            {isEditing ? (
              <TouchableOpacity
                className="flex-row items-center"
                onPress={() => calendarSheetRef.current?.present()}
                activeOpacity={0.7}
              >
                <Text className="text-sm" style={{ color: accentPrimary }}>
                  {formatDateLabel(editValues.entry_date || normalizedDate)}
                </Text>
                <Icon name="chevron-forward" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : entryDate ? (
              <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* Summary card / Edit form */}
        {isEditing && !isPreset ? renderIndividualEditForm() : (() => {
          const summaryItems: { value: string; label: string }[] = [];
          if (isPreset && session.type === 'preset') {
            summaryItems.push({
              value: String(session.exercises.length),
              label: session.exercises.length === 1 ? 'Exercise' : 'Exercises',
            });
            const totalSets = session.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
            if (totalSets > 0) summaryItems.push({ value: String(totalSets), label: 'Sets' });
            const totalVolume = session.exercises.reduce((sum, ex) => sum + getExerciseVolume(ex), 0);
            if (totalVolume > 0) summaryItems.push({ value: formatVolume(totalVolume), label: 'Volume' });
          } else {
            if (duration > 0) summaryItems.push({ value: formatDuration(duration), label: 'Duration' });
            if (calories > 0) summaryItems.push({ value: String(Math.round(calories)), label: 'Calories' });
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
        })()}

        {/* Exercise images (individual sessions only) */}
        {session.type === 'individual' && renderExerciseImages(session.exercise_snapshot?.images)}

        {/* Metadata badges (individual sessions only) */}
        {session.type === 'individual' && renderMetadataBadges(session.exercise_snapshot)}

        {/* Variant-specific content */}
        {renderPresetContent()}
        {!isEditing && renderIndividualContent()}

        {/* Preset edit controls */}
        {isEditing && isPreset && (
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
                value={editValues.notes ?? ''}
                onChangeText={(v: string) => updateEditValue('notes', v)}
                placeholder="Add notes..."
                multiline
                style={{ minHeight: 60 }}
              />
            </View>
          </>
        )}

        {/* Preset notes (view mode) */}
        {!isEditing && isPreset && session.notes && (
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
            onPress={handleDelete}
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
        selectedDate={editValues.entry_date || normalizedDate}
        onSelectDate={(date) => updateEditValue('entry_date', date)}
      />
    </View>
  );
};

export default WorkoutDetailScreen;
