import React, { useRef, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
  useUpdateExerciseEntry,
} from '../hooks/useExerciseMutations';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { syncExerciseSessionInCache } from '../hooks/syncExerciseSessionInCache';
import CalendarSheet, { type CalendarSheetRef } from '../components/CalendarSheet';
import { normalizeDate, formatDate, formatDateLabel } from '../utils/dateUtils';
import { distanceFromKm, distanceToKm } from '../utils/unitConversions';
import Toast from 'react-native-toast-message';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ActivityDetail'>;

type EditableField = 'name' | 'duration_minutes' | 'calories_burned' | 'distance' | 'avg_heart_rate' | 'notes';

const ActivityDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const [session, setSession] = useState(route.params.session);
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

  const calendarSheetRef = useRef<CalendarSheetRef>(null);

  const [accentPrimary, textMuted, borderSubtle] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    '--color-border-subtle',
  ]) as [string, string, string];

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
      deleteActivity.invalidateCache();
      navigation.goBack();
    },
  });

  const isDeleting = deleteActivity.isPending;

  const { updateEntry, isPending: isSaving, invalidateCache: invalidateEntryCache } = useUpdateExerciseEntry();

  // --- Edit mode state ---
  const [isEditing, setIsEditing] = useState(false);
  const [activeField, setActiveField] = useState<EditableField | null>(null);

  // Local edit values — populated on entering edit mode, read/written by inline inputs
  const [editValues, setEditValues] = useState({
    name: '',
    duration_minutes: '',
    calories_burned: '',
    distance: '',
    avg_heart_rate: '',
    notes: '',
  });
  const [editDate, setEditDate] = useState('');

  const updateEditValue = useCallback((field: EditableField, value: string) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  }, []);

  const startEditing = () => {
    setEditValues({
      name: session.name ?? session.exercise_snapshot?.name ?? '',
      duration_minutes: session.duration_minutes > 0 ? String(session.duration_minutes) : '',
      calories_burned: session.calories_burned > 0 ? String(Math.round(session.calories_burned)) : '',
      distance: session.distance != null && session.distance > 0
        ? String(parseFloat(distanceFromKm(session.distance, distanceUnit).toFixed(2)))
        : '',
      avg_heart_rate: session.avg_heart_rate != null ? String(session.avg_heart_rate) : '',
      notes: session.notes ?? '',
    });
    setEditDate(normalizedDate);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setActiveField(null);
  };

  const handleSave = async () => {
    const dateChanged = editDate !== normalizedDate;
    const durationMinutes = parseFloat(editValues.duration_minutes) || 0;
    const caloriesBurned = parseFloat(editValues.calories_burned) || 0;
    const distanceVal = editValues.distance ? parseFloat(editValues.distance) : null;
    const distanceKm = distanceVal != null && !isNaN(distanceVal) && distanceVal > 0
      ? distanceToKm(distanceVal, distanceUnit)
      : null;
    const avgHeartRate = editValues.avg_heart_rate ? parseInt(editValues.avg_heart_rate, 10) : null;

    const payload = {
      exercise_id: session.exercise_id,
      exercise_name: editValues.name.trim() || null,
      duration_minutes: durationMinutes,
      calories_burned: caloriesBurned,
      entry_date: editDate,
      distance: distanceKm,
      avg_heart_rate: avgHeartRate && !isNaN(avgHeartRate) ? avgHeartRate : null,
      notes: editValues.notes || null,
    };

    try {
      const updatedEntry = await updateEntry({ id: session.id, payload });
      invalidateEntryCache(editDate);
      if (dateChanged) invalidateEntryCache(normalizedDate);
      const updatedSession = {
        ...session,
        ...updatedEntry,
        name: payload.exercise_name,
        notes: payload.notes,
        calories_burned: payload.calories_burned,
        duration_minutes: payload.duration_minutes,
        distance: payload.distance,
        avg_heart_rate: payload.avg_heart_rate,
        entry_date: editDate,
      };
      syncExerciseSessionInCache(queryClient, updatedSession);
      setSession(updatedSession);
      setIsEditing(false);
      setActiveField(null);
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

    if (isEditing || duration > 0) {
      stats.push({
        value: isEditing
          ? (editValues.duration_minutes || '—')
          : (duration > 0 ? String(Math.round(duration)) : '—'),
        label: 'Duration',
        editKey: 'duration_minutes',
        editSuffix: 'min',
        keyboardType: 'numeric',
      });
    }
    if (isEditing || calories > 0) {
      stats.push({
        value: isEditing
          ? (editValues.calories_burned || '—')
          : (calories > 0 ? String(Math.round(calories)) : '—'),
        label: 'Calories',
        editKey: 'calories_burned',
        editSuffix: 'cal',
        keyboardType: 'numeric',
      });
    }
    if (isEditing || (session.distance != null && session.distance > 0)) {
      stats.push({
        value: isEditing
          ? (editValues.distance || '—')
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
          ? (editValues.avg_heart_rate || '—')
          : (session.avg_heart_rate != null ? String(session.avg_heart_rate) : '—'),
        label: 'Avg Heart Rate',
        editKey: 'avg_heart_rate',
        editSuffix: 'bpm',
        keyboardType: 'numeric',
      });
    }
    if (session.steps != null && session.steps > 0) {
      stats.push({ value: session.steps.toLocaleString(), label: 'Steps' });
    }
    if (session.distance != null && session.distance > 0 && duration > 0) {
      const pace = formatPace(duration, session.distance);
      if (pace) stats.push({ value: pace, label: 'Pace' });
    }
    return stats;
  };

  const renderStatCard = (stat: StatItem) => {
    const isActive = activeField === stat.editKey;
    const canEdit = isEditing && stat.editKey;

    const content = (
      <View className={`bg-surface rounded-xl p-3 ${canEdit ? 'border' : ''}`} style={canEdit ? { borderColor: isActive ? accentPrimary : borderSubtle } : undefined}>
        <View style={{ minHeight: 24 }}>
          {isActive && stat.editKey ? (
            <FormInput
              value={editValues[stat.editKey]}
              onChangeText={(v) => updateEditValue(stat.editKey!, v)}
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
          ) : (
            <Text className="text-lg font-semibold text-text-primary">{stat.value}</Text>
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

  // --- Divider ---

  const Divider = () => (
    <View className="h-px" style={{ backgroundColor: borderSubtle }} />
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
              <TouchableOpacity onPress={() => setActiveField('name')} activeOpacity={0.6}>
                {activeField === 'name' ? (
                  <FormInput
                    value={editValues.name}
                    onChangeText={(v) => updateEditValue('name', v)}
                    onBlur={() => setActiveField(null)}
                    placeholder="Activity Name"
                    autoFocus
                    style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 8, paddingBottom: 8, fontSize: 20, fontWeight: '700' }}
                  />
                ) : (
                  <Text className="text-xl font-bold text-text-primary mb-0.5">
                    {editValues.name || name}
                  </Text>
                )}
              </TouchableOpacity>
            ) : (
              <Text className="text-xl font-bold text-text-primary mb-0.5">{name}</Text>
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
                    {formatDateLabel(editDate)}
                  </Text>
                  <Icon name="chevron-down" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              ) : entryDate ? (
                <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
              ) : null}
            </View>
          </View>
        </View>

        <Divider />

        {/* Stats grid */}
        {renderStatsGrid()}

        {/* Notes section */}
        {(isEditing || session.notes) && (
          <>
            <Divider />
            <View className="py-4">
              <Text className="text-sm font-medium text-text-secondary mb-2">Notes</Text>
              {isEditing ? (
                activeField === 'notes' ? (
                  <FormInput
                    value={editValues.notes}
                    onChangeText={(v) => updateEditValue('notes', v)}
                    onBlur={() => setActiveField(null)}
                    placeholder="Add notes..."
                    multiline
                    autoFocus
                    style={{ minHeight: 60 }}
                  />
                ) : (
                  <TouchableOpacity onPress={() => setActiveField('notes')} activeOpacity={0.6}>
                    <Text className="text-sm text-text-primary">
                      {editValues.notes || 'Add notes...'}
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
          <>
            <Divider />
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
          </>
        )}
      </KeyboardAwareScrollView>

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={isEditing ? editDate : normalizedDate}
        onSelectDate={setEditDate}
      />
    </View>
  );
};

export default ActivityDetailScreen;
