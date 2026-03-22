import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import SafeImage from '../components/SafeImage';
import CollapsibleSection from '../components/CollapsibleSection';
import { getSourceLabel, getWorkoutIcon, formatDuration, getWorkoutSummary } from '../utils/workoutSession';
import {
  useDeleteExerciseEntry,
  useDeleteWorkout,
  useUpdateExerciseEntry,
  useUpdateWorkout,
} from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { syncExerciseSessionInCache } from '../hooks/syncExerciseSessionInCache';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { extractActivitySummary } from '../utils/activityDetails';
import { weightFromKg, distanceFromKm, distanceToKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type { ExerciseEntryResponse, ExerciseSnapshotResponse } from '@workspace/shared';

type Props = RootStackScreenProps<'WorkoutDetail'>;

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

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
  const iconName = getWorkoutIcon(session);
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
    }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditValues({});
  };

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
        const payload = {
          name: editValues.name.trim() || session.name,
          entry_date: editedDate,
          notes: editValues.notes || null,
        };
        const updatedSession = await updateSession({ id: session.id, payload });
        invalidateSessionCache(editedDate);
        if (dateChanged) invalidateSessionCache(normalizedDate);
        setSession(updatedSession);
      }
      setIsEditing(false);
      setEditValues({});
    } catch {}
  };

  const formatDistance = (distanceKm: number): string => {
    const value = distanceFromKm(distanceKm, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    return `${value.toFixed(2)} ${label}`;
  };

  const renderSetTable = (exercise: ExerciseEntryResponse) => {
    if (exercise.sets.length === 0) return null;

    return (
      <View className="mt-2">
        {/* Header */}
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

  const renderExerciseDetails = (snapshot: ExerciseSnapshotResponse | null | undefined, keyPrefix: string) => {
    if (!snapshot) return null;

    const hasMuscles = (snapshot.primary_muscles?.length ?? 0) > 0 || (snapshot.secondary_muscles?.length ?? 0) > 0;
    const hasEquipment = (snapshot.equipment?.length ?? 0) > 0;
    const hasInstructions = (snapshot.instructions?.length ?? 0) > 0;

    if (!hasMuscles && !hasEquipment && !hasInstructions) return null;

    return (
      <View className="mt-1">
        {hasMuscles && (
          <CollapsibleSection
            title="Muscles"
            expanded={!!expandedSections[`muscles-${keyPrefix}`]}
            onToggle={() => toggleSection(`muscles-${keyPrefix}`)}
            itemCount={(snapshot.primary_muscles?.length ?? 0) + (snapshot.secondary_muscles?.length ?? 0)}
          >
            {(snapshot.primary_muscles?.length ?? 0) > 0 && (
              <View className="mb-2">
                <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Primary</Text>
                <View className="flex-row flex-wrap gap-1">
                  {snapshot.primary_muscles!.map(muscle => (
                    <View key={muscle} className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${accentPrimary}15` }}>
                      <Text className="text-xs capitalize" style={{ color: accentPrimary }}>{muscle}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {(snapshot.secondary_muscles?.length ?? 0) > 0 && (
              <View className="mb-1">
                <Text className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Secondary</Text>
                <View className="flex-row flex-wrap gap-1">
                  {snapshot.secondary_muscles!.map(muscle => (
                    <View key={muscle} className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${textMuted}15` }}>
                      <Text className="text-xs text-text-secondary capitalize">{muscle}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </CollapsibleSection>
        )}

        {hasEquipment && (
          <CollapsibleSection
            title="Equipment"
            expanded={!!expandedSections[`equipment-${keyPrefix}`]}
            onToggle={() => toggleSection(`equipment-${keyPrefix}`)}
            itemCount={snapshot.equipment!.length}
          >
            <View className="flex-row flex-wrap gap-1">
              {snapshot.equipment!.map(item => (
                <View key={item} className="rounded-full px-2.5 py-1" style={{ backgroundColor: `${textMuted}15` }}>
                  <Text className="text-xs text-text-secondary capitalize">{item}</Text>
                </View>
              ))}
            </View>
          </CollapsibleSection>
        )}

        {hasInstructions && (
          <CollapsibleSection
            title="Instructions"
            expanded={!!expandedSections[`instructions-${keyPrefix}`]}
            onToggle={() => toggleSection(`instructions-${keyPrefix}`)}
            itemCount={snapshot.instructions!.length}
          >
            {snapshot.instructions!.map((step, i) => (
              <View key={i} className="flex-row mb-2">
                <Text className="text-sm text-text-muted w-6">{i + 1}.</Text>
                <Text className="text-sm text-text-primary flex-1">{step}</Text>
              </View>
            ))}
          </CollapsibleSection>
        )}
      </View>
    );
  };

  const renderPresetContent = () => {
    if (session.type !== 'preset') return null;

    return (
      <View className="mt-4">
        {session.exercises.map(exercise => (
          <View key={exercise.id} className="bg-surface rounded-xl p-4 mb-3">
            <View className="flex-row items-center">
              <SafeImage
                source={exercise.exercise_snapshot?.images?.[0] ? getImageSource(exercise.exercise_snapshot.images[0]) : null}
                style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
              />
              <View className="flex-1">
                <Text className="text-base font-semibold text-text-primary">
                  {exercise.exercise_snapshot?.name ?? 'Unknown exercise'}
                </Text>
                {exercise.exercise_snapshot?.category && (
                  <Text className="text-xs text-text-muted mt-0.5">
                    {exercise.exercise_snapshot.category}
                  </Text>
                )}
                {renderMetadataBadges(exercise.exercise_snapshot)}
              </View>
              {exercise.calories_burned > 0 && (
                <Text className="text-sm text-text-secondary">
                  {Math.round(exercise.calories_burned)} Cal
                </Text>
              )}
            </View>
            {renderSetTable(exercise)}
            {renderExerciseDetails(exercise.exercise_snapshot, exercise.id)}
          </View>
        ))}
      </View>
    );
  };

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

  const renderPresetEditNotes = () => (
    <View className="bg-surface rounded-xl p-4 mt-4">
      <Text className="text-sm font-medium text-text-secondary mb-1">Notes</Text>
      <FormInput
        value={editValues.notes ?? ''}
        onChangeText={(v) => updateEditValue('notes', v)}
        placeholder="Add notes..."
        multiline
        style={{ minHeight: 60 }}
      />
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
            <Button
              variant="ghost"
              onPress={handleSave}
              disabled={isSaving}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0 ml-auto"
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
            <Button
              variant="ghost"
              onPress={startEditing}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="py-0 px-0 ml-auto"
            >
              <Text className="text-accent-primary text-base font-medium">Edit</Text>
            </Button>
          </>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4">
        {/* Title area */}
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Icon name={iconName} size={28} color={accentPrimary} />
            {isEditing ? (
              <FormInput
                value={editValues.name ?? ''}
                onChangeText={(v) => updateEditValue('name', v)}
                placeholder="Workout Name"
                className="text-xl font-bold text-text-primary ml-3 flex-1"
                style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 0, paddingBottom: 0 }}
              />
            ) : (
              <Text className="text-2xl font-bold text-text-primary ml-3 flex-1" numberOfLines={2}>
                {name}
              </Text>
            )}
          </View>
          <View className="flex-row items-center">
            <View
              className="rounded-full px-2 py-0.5 mr-2"
              style={{ backgroundColor: isSparky ? `${accentPrimary}20` : `${textMuted}20` }}
            >
              <Text
                className="text-xs font-medium"
                style={{ color: isSparky ? accentPrimary : textMuted }}
              >
                {sourceLabel}
              </Text>
            </View>
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
        {isEditing && !isPreset ? (
          renderIndividualEditForm()
        ) : (() => {
          const summaryItems: { value: string; label: string }[] = [];
          if (duration > 0) summaryItems.push({ value: formatDuration(duration), label: 'Duration' });
          if (calories > 0) summaryItems.push({ value: String(Math.round(calories)), label: 'Calories' });
          if (summaryItems.length === 0) return null;
          if (isPreset) summaryItems.push({
            value: String(session.exercises.length),
            label: session.exercises.length === 1 ? 'Exercise' : 'Exercises',
          });
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

        {/* Preset notes editing */}
        {isEditing && isPreset && renderPresetEditNotes()}

        {/* Exercise details (individual sessions only) */}
        {session.type === 'individual' && renderExerciseDetails(session.exercise_snapshot, 'individual')}

        {renderActivityDetails()}

        {/* Delete button */}
        <Button
          variant="ghost"
          onPress={handleDelete}
          disabled={isDeleting || isEditing}
          className="mt-6"
        >
          <Text className="text-bg-danger text-base font-medium">
            {isDeleting ? 'Deleting...' : 'Delete Workout'}
          </Text>
        </Button>
      </ScrollView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={editValues.entry_date || normalizedDate}
        onSelectDate={(date) => updateEditValue('entry_date', date)}
      />
    </View>
  );
};

export default WorkoutDetailScreen;
