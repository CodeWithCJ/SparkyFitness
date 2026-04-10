import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import FadeView from '../components/FadeView';
import EditableSetList from '../components/EditableSetList';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import SafeImage from '../components/SafeImage';
import { getSourceLabel, getWorkoutSummary } from '../utils/workoutSession';
import {
  useDeleteExerciseEntry,
  useUpdateExerciseEntry,
} from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { syncExerciseSessionInCache } from '../hooks/syncExerciseSessionInCache';
import { useActivityForm, getActivityDraftSubmission } from '../hooks/useActivityForm';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { distanceFromKm, weightFromKg, weightToKg } from '../utils/unitConversions';
import { parseDecimalInput } from '../utils/numericInput';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import type { WorkoutDraftSet } from '../types/drafts';
import type { ExerciseEntrySetResponse } from '@workspace/shared';

type Props = RootStackScreenProps<'ActivityDetail'>;

type EditableField = 'name' | 'duration' | 'calories' | 'distance' | 'avgHeartRate' | 'notes';

const ActivityDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const weightUnit = (preferences?.default_weight_unit as 'kg' | 'lbs') ?? 'kg';

  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
  ]) as [string, string];

  const { getImageSource } = useExerciseImageSource();

  const { label: sourceLabel, isSparky } = getSourceLabel(session.source);
  const entryDate = session.entry_date ?? '';
  const normalizedDate = normalizeDate(entryDate);
  const { name, duration, calories } = getWorkoutSummary(session);

  const firstImage = session.exercise_snapshot?.images?.[0];
  const firstImageSource = firstImage ? getImageSource(firstImage) : null;

  const deleteActivity = useDeleteExerciseEntry({
    entryId: session.id,
    entryDate: normalizedDate,
    onSuccess: () => {
      navigation.goBack();
    },
  });

  const isDeleting = deleteActivity.isPending;

  const { updateEntry, isPending: isSaving, invalidateCache: invalidateEntryCache } = useUpdateExerciseEntry();

  // --- Edit mode state ---
  const [isEditing, setIsEditing] = useState(false);
  const [activeField, setActiveField] = useState<EditableField | null>(null);

  // --- Set editing state ---
  // The UI only edits weight/reps, but the server stores sets as a JSONB column
  // that gets fully replaced on PUT. We keep the original server sets so we can
  // merge edited weight/reps back in without losing fields like rest_time, rpe, etc.
  const SET_CLIENT_ID_PREFIX = 'activity';
  const nextSetIdRef = useRef(0);
  const originalSetsRef = useRef<Map<string, ExerciseEntrySetResponse>>(new Map());
  const [draftSets, setDraftSets] = useState<WorkoutDraftSet[]>([]);
  const [activeSetKey, setActiveSetKey] = useState<string | null>(null);
  const [activeSetField, setActiveSetField] = useState<'weight' | 'reps'>('weight');
  const hasSets = session.sets.length > 1
    || session.sets.some(s => s.weight != null || s.reps != null);

  const {
    state: formState,
    setName,
    setDuration,
    setDistance,
    setCalories,
    setAvgHeartRate,
    setDate,
    setNotes,
    populate,
  } = useActivityForm({ isEditMode: true, skipDraftLoad: true });
  const submission = getActivityDraftSubmission(formState, distanceUnit);

  const startEditing = () => {
    populate(session, distanceUnit);
    setActiveField(null);
    const originals = new Map<string, ExerciseEntrySetResponse>();
    const converted = session.sets.map((set, i) => {
      const clientId = `set-${i}`;
      originals.set(clientId, set);
      return {
        clientId,
        weight: set.weight != null
          ? String(parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1)))
          : '',
        reps: set.reps != null ? String(set.reps) : '',
      };
    });
    originalSetsRef.current = originals;
    setDraftSets(converted);
    nextSetIdRef.current = session.sets.length;
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setActiveField(null);
    setDraftSets([]);
    setActiveSetKey(null);
    originalSetsRef.current.clear();
  };

  // --- Set editing callbacks ---
  const addDraftSet = useCallback((_exerciseId?: string) => {
    const id = `set-${nextSetIdRef.current++}`;
    setDraftSets(prev => {
      const lastSet = prev[prev.length - 1];
      return [...prev, { clientId: id, weight: lastSet?.weight ?? '', reps: lastSet?.reps ?? '' }];
    });
    setActiveSetKey(`${SET_CLIENT_ID_PREFIX}:${id}`);
    setActiveSetField('weight');
  }, []);

  const removeDraftSet = useCallback((_exerciseId: string, setClientId: string) => {
    setDraftSets(prev => prev.filter(s => s.clientId !== setClientId));
    setActiveSetKey(null);
  }, []);

  const updateDraftSetField = useCallback((_exerciseId: string, setClientId: string, field: 'weight' | 'reps', value: string) => {
    setDraftSets(prev => prev.map(s => s.clientId === setClientId ? { ...s, [field]: value } : s));
  }, []);

  const activateSet = useCallback((key: string, field: 'weight' | 'reps') => {
    setActiveSetKey(key);
    setActiveSetField(field);
  }, []);

  const deactivateSet = useCallback(() => {
    setActiveSetKey(null);
  }, []);

  const handleSave = async () => {
    if (!submission.exerciseId) return;

    const dateChanged = submission.entryDate !== normalizedDate;

    const setsPayload = draftSets.map((set, index) => {
      const w = parseDecimalInput(set.weight);
      const r = parseInt(set.reps, 10);
      const original = originalSetsRef.current.get(set.clientId);
      return {
        ...(original && {
          id: original.id,
          set_type: original.set_type,
          duration: original.duration,
          rest_time: original.rest_time,
          notes: original.notes,
          rpe: original.rpe,
        }),
        set_type: original?.set_type ?? 'Working Set',
        set_number: index + 1,
        weight: isNaN(w) ? null : weightToKg(w, weightUnit),
        reps: isNaN(r) ? null : r,
      };
    });

    const payload = {
      exercise_id: submission.exerciseId,
      exercise_name: submission.exerciseName,
      duration_minutes: submission.durationMinutes,
      calories_burned: submission.caloriesBurned,
      entry_date: submission.entryDate,
      distance: submission.distanceKm,
      avg_heart_rate: submission.avgHeartRate,
      notes: submission.notes,
      sets: setsPayload,
    };

    try {
      const updatedEntry = await updateEntry({ id: session.id, payload });
      invalidateEntryCache(submission.entryDate);
      if (dateChanged) invalidateEntryCache(normalizedDate);
      const updatedSession = {
        ...session,
        ...updatedEntry,
        name: submission.exerciseName,
        notes: submission.notes,
        calories_burned: submission.caloriesBurned,
        duration_minutes: submission.durationMinutes,
        distance: submission.distanceKm,
        avg_heart_rate: submission.avgHeartRate,
        entry_date: submission.entryDate,
      };
      syncExerciseSessionInCache(queryClient, updatedSession);
      setSession(updatedSession);
      setIsEditing(false);
      setActiveField(null);
      setDraftSets([]);
      setActiveSetKey(null);
      originalSetsRef.current.clear();
    } catch (error) {
      addLog(`Failed to save activity: ${error}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Failed to save activity', text2: 'Please try again.' });
    }
  };

  // --- Formatting helpers ---

  const formatPace = (durationMin: number, distanceKm: number): string | null => {
    if (durationMin <= 0 || distanceKm <= 0) return null;
    const distanceInUnit = distanceFromKm(distanceKm, distanceUnit);
    const paceMinPerUnit = durationMin / distanceInUnit;
    const minutes = Math.floor(paceMinPerUnit);
    const seconds = Math.round((paceMinPerUnit - minutes) * 60);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    return `${minutes}:${String(seconds).padStart(2, '0')} / ${label}`;
  };

  // --- Stats grid ---

  type StatItem = {
    value: string;
    label: string;
    editKey?: EditableField;
    editSuffix?: string;
    keyboardType?: 'numeric' | 'decimal-pad';
  };

  const buildStats = (): StatItem[] => {
    const stats: StatItem[] = [];
    const distLabel = distanceUnit === 'miles' ? 'mi' : 'km';
    const paceDuration = isEditing ? submission.durationMinutes : duration;
    const paceDistanceKm = isEditing ? submission.distanceKm : session.distance;

    if (isEditing || duration > 0) {
      stats.push({
        value: isEditing
          ? (formState.duration || '—')
          : (duration > 0 ? String(Math.round(duration)) : '—'),
        label: 'Duration',
        editKey: 'duration',
        editSuffix: 'min',
        keyboardType: 'numeric',
      });
    }
    if (isEditing || calories > 0) {
      stats.push({
        value: isEditing
          ? (formState.calories || '—')
          : (calories > 0 ? String(Math.round(calories)) : '—'),
        label: 'Calories',
        editKey: 'calories',
        editSuffix: 'cal',
        keyboardType: 'numeric',
      });
    }
    if (isEditing || (session.distance != null && session.distance > 0)) {
      stats.push({
        value: isEditing
          ? (formState.distance || '—')
          : (session.distance != null && session.distance > 0
              ? String(distanceFromKm(session.distance, distanceUnit).toFixed(1))
              : '—'),
        label: 'Distance',
        editKey: 'distance',
        editSuffix: distLabel,
        keyboardType: 'decimal-pad',
      });
    }
    if (isEditing || session.avg_heart_rate != null) {
      stats.push({
        value: isEditing
          ? (formState.avgHeartRate || '—')
          : (session.avg_heart_rate != null ? String(session.avg_heart_rate) : '—'),
        label: 'Avg Heart Rate',
        editKey: 'avgHeartRate',
        editSuffix: 'bpm',
        keyboardType: 'numeric',
      });
    }
    if (session.steps != null && session.steps > 0) {
      stats.push({ value: session.steps.toLocaleString(), label: 'Steps' });
    }
    if (paceDistanceKm != null && paceDistanceKm > 0 && paceDuration > 0) {
      const pace = formatPace(paceDuration, paceDistanceKm);
      if (pace) stats.push({ value: pace, label: 'Pace' });
    }
    return stats;
  };

  const getFieldValue = (field: EditableField): string => {
    switch (field) {
      case 'name':
        return formState.name;
      case 'duration':
        return formState.duration;
      case 'calories':
        return formState.calories;
      case 'distance':
        return formState.distance;
      case 'avgHeartRate':
        return formState.avgHeartRate;
      case 'notes':
        return formState.notes;
    }
  };

  const updateFieldValue = (field: EditableField, value: string) => {
    switch (field) {
      case 'name':
        setName(value);
        break;
      case 'duration':
        setDuration(value);
        break;
      case 'calories':
        setCalories(value);
        break;
      case 'distance':
        setDistance(value);
        break;
      case 'avgHeartRate':
        setAvgHeartRate(value);
        break;
      case 'notes':
        setNotes(value);
        break;
    }
  };

  const renderStatCard = (stat: StatItem) => {
    const isActive = activeField === stat.editKey;
    const canEdit = isEditing && stat.editKey;

    const content = (
      <View className={`bg-surface rounded-xl p-3 ${canEdit ? 'border' : ''}`} style={canEdit ? { borderColor: isActive ? accentPrimary : borderSubtle } : undefined}>
        <View style={{ minHeight: 24 }}>
          {isActive && stat.editKey ? (
            <FadeView key="stat-edit">
              <FormInput
                value={getFieldValue(stat.editKey)}
                onChangeText={(v) => updateFieldValue(stat.editKey!, v)}
                onBlur={() => setActiveField(null)}
                keyboardType={stat.keyboardType ?? 'numeric'}
                placeholder="0"
                autoFocus
                style={{
                  borderWidth: 0,
                  backgroundColor: 'transparent',
                  paddingLeft: 0,
                  paddingTop: 0,
                  paddingBottom: 0,
                  fontSize: 18,
                  fontWeight: '600',
                }}
              />
            </FadeView>
          ) : (
            <FadeView key="stat-view">
              <Text className="text-lg font-semibold text-text-primary">{stat.value}</Text>
            </FadeView>
          )}
          {stat.editSuffix && (
            <Text
              className="text-sm text-text-muted"
              style={{ position: 'absolute', right: 0, bottom: 0 }}
            >
              {stat.editSuffix}
            </Text>
          )}
        </View>
        <Text className="text-xs text-text-muted mt-0.5">{stat.label}</Text>
      </View>
    );

    if (canEdit && !isActive) {
      return (
        <TouchableOpacity
          key={stat.label}
          className="flex-1"
          onPress={() => setActiveField(stat.editKey!)}
          activeOpacity={0.7}
        >
          {content}
        </TouchableOpacity>
      );
    }

    return <View key={stat.label} className="flex-1">{content}</View>;
  };

  const renderStatsGrid = () => {
    const stats = buildStats();
    if (stats.length === 0) return null;

    const rows: StatItem[][] = [];
    for (let i = 0; i < stats.length; i += 2) {
      rows.push(stats.slice(i, i + 2));
    }

    return (
      <View className="py-4 gap-3">
        {rows.map((row, ri) => (
          <View key={ri} className="flex-row gap-3">
            {row.map(renderStatCard)}
            {row.length === 1 && <View className="flex-1" />}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 ">
        {isEditing ? (
          <FadeView
            key="header-edit"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          >
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
          </FadeView>
        ) : (
          <FadeView
            key="header-view"
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
          >
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
          </FadeView>
        )}
      </View>

      <KeyboardAwareScrollView contentContainerClassName="px-4 pb-8" bottomOffset={20} keyboardShouldPersistTaps="handled">
        {/* Title area */}
        <View className="flex-row items-start mb-4 mt-4">
          {firstImageSource && (
            <SafeImage
              source={firstImageSource}
              style={{ width: 48, height: 48, borderRadius: 10, marginRight: 12 }}
            />
          )}
          <View className="flex-1">
            {isEditing ? (
              <FadeView key="edit-title">
                <TouchableOpacity onPress={() => setActiveField('name')} activeOpacity={0.6}>
                  {activeField === 'name' ? (
                    <FormInput
                      value={formState.name}
                      onChangeText={setName}
                      onBlur={() => setActiveField(null)}
                      placeholder="Activity Name"
                      autoFocus
                      style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 8, paddingBottom: 8, fontSize: 20, fontWeight: '700' }}
                    />
                  ) : (
                    <Text className="text-xl font-bold text-text-primary mb-0.5">
                      {formState.name || name}
                    </Text>
                  )}
                </TouchableOpacity>
              </FadeView>
            ) : (
              <FadeView key="view-title">
                <Text className="text-xl font-bold text-text-primary mb-0.5">{name}</Text>
              </FadeView>
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
                  <Icon name="chevron-down" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ) : entryDate ? (
                <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
              ) : null}
            </View>
          </View>
        </View>


        {/* Stats grid */}
        {renderStatsGrid()}

        {/* Sets section */}
        {isEditing ? (
          draftSets.length > 0 || hasSets ? (
            <View className="py-4">
              <Text className="text-sm font-medium text-text-secondary mb-2">Sets</Text>
              <EditableSetList
                exerciseClientId={SET_CLIENT_ID_PREFIX}
                sets={draftSets}
                activeSetKey={activeSetKey}
                activeSetField={activeSetField}
                weightUnit={weightUnit}
                onActivateSet={activateSet}
                onDeactivateSet={deactivateSet}
                onUpdateSetField={updateDraftSetField}
                onRemoveSet={removeDraftSet}
                onAddSet={addDraftSet}
              />
            </View>
          ) : null
        ) : hasSets ? (
          <>
            <View className="py-4">
              <Text className="text-sm font-medium text-text-secondary mb-2">Sets</Text>
              <View className="flex-row py-1 mb-1">
                <Text className="text-xs font-semibold text-text-muted w-10 text-center">Set</Text>
                <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Weight</Text>
                <Text className="text-xs font-semibold text-text-muted flex-1 text-center">Reps</Text>
              </View>
              {session.sets.map(set => {
                const displayWeight = set.weight != null
                  ? `${parseFloat(weightFromKg(set.weight, weightUnit).toFixed(1))} ${weightUnit}`
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
          </>
        ) : null}

        {/* Notes section */}
        {(isEditing || session.notes) && (
          <>
            <View className="py-4">
              <Text className="text-sm font-medium text-text-secondary mb-2">Notes</Text>
              {isEditing ? (
                activeField === 'notes' ? (
                  <FormInput
                    value={formState.notes}
                    onChangeText={setNotes}
                    onBlur={() => setActiveField(null)}
                    placeholder="Add notes..."
                    multiline
                    autoFocus
                    style={{ minHeight: 60 }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setActiveField('notes')} activeOpacity={0.6}>
                    <Text className="text-sm text-text-primary">
                      {formState.notes || 'Add notes...'}
                    </Text>
                  </TouchableOpacity>
                )
              ) : (
                <Text className="text-sm text-text-primary">{session.notes}</Text>
              )}
            </View>
          </>
        )}

        {/* Delete */}
        {isEditing && (
          <FadeView>
            <Button
              variant="ghost"
              onPress={() => deleteActivity.confirmAndDelete()}
              disabled={isDeleting}
              className="mt-4"
            >
              <Text className="text-bg-danger text-base font-medium">
                {isDeleting ? 'Deleting...' : 'Delete Activity'}
              </Text>
            </Button>
          </FadeView>
        )}
      </KeyboardAwareScrollView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={isEditing ? formState.entryDate : normalizedDate}
        onSelectDate={setDate}
      />
    </View>
  );
};

export default ActivityDetailScreen;
