import React, { useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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

  const { updateEntry, invalidateCache: invalidateEntryCache } = useUpdateExerciseEntry();

  // --- Inline editing state ---
  const [activeField, setActiveField] = useState<EditableField | null>(null);
  const [editValue, setEditValueState] = useState('');
  const pendingEditRef = useRef<{ field: EditableField; value: string } | null>(null);

  const setEditValue = (value: string) => {
    setEditValueState(value);
    if (pendingEditRef.current) {
      pendingEditRef.current.value = value;
    }
  };

  const getFieldValue = useCallback((field: EditableField): string => {
    switch (field) {
      case 'name':
        return session.name ?? session.exercise_snapshot?.name ?? '';
      case 'duration_minutes':
        return session.duration_minutes > 0 ? String(session.duration_minutes) : '';
      case 'calories_burned':
        return session.calories_burned > 0 ? String(Math.round(session.calories_burned)) : '';
      case 'distance':
        return session.distance != null && session.distance > 0
          ? distanceFromKm(session.distance, distanceUnit).toFixed(2)
          : '';
      case 'avg_heart_rate':
        return session.avg_heart_rate != null ? String(session.avg_heart_rate) : '';
      case 'notes':
        return session.notes ?? '';
    }
  }, [session, distanceUnit]);

  const startFieldEdit = (field: EditableField) => {
    if (!isSparky) return;
    // Save any pending edit from the previous field
    if (pendingEditRef.current) {
      const { field: prevField, value: prevValue } = pendingEditRef.current;
      saveField(prevField, prevValue);
    }
    setActiveField(field);
    const value = getFieldValue(field);
    setEditValue(value);
    pendingEditRef.current = { field, value };
  };

  const saveField = async (field: EditableField, value: string) => {
    setActiveField(null);
    pendingEditRef.current = null;

    // Check if value actually changed
    const oldValue = getFieldValue(field);
    if (value === oldValue) return;

    const distanceValue = field === 'distance' && value ? parseFloat(value) : undefined;

    const payload = {
      exercise_id: session.exercise_id,
      exercise_name: field === 'name' ? (value || null) : (session.name ?? null),
      duration_minutes: field === 'duration_minutes' ? (parseFloat(value) || 0) : session.duration_minutes,
      calories_burned: field === 'calories_burned' ? (parseFloat(value) || 0) : session.calories_burned,
      entry_date: normalizedDate,
      distance: field === 'distance'
        ? (distanceValue != null ? distanceToKm(distanceValue, distanceUnit) : null)
        : (session.distance ?? null),
      avg_heart_rate: field === 'avg_heart_rate'
        ? (value ? parseInt(value, 10) : null)
        : (session.avg_heart_rate ?? null),
      notes: field === 'notes' ? (value || null) : (session.notes ?? null),
    };

    try {
      const updatedEntry = await updateEntry({ id: session.id, payload });
      invalidateEntryCache(normalizedDate);
      const updatedSession = {
        ...session,
        ...updatedEntry,
        name: payload.exercise_name,
        notes: payload.notes,
        calories_burned: payload.calories_burned,
        duration_minutes: payload.duration_minutes,
        distance: payload.distance,
        avg_heart_rate: payload.avg_heart_rate,
      };
      syncExerciseSessionInCache(queryClient, updatedSession);
      setSession(updatedSession);
    } catch {}
  };

  const saveDate = async (date: string) => {
    if (date === normalizedDate) return;

    const payload = {
      exercise_id: session.exercise_id,
      exercise_name: session.name ?? null,
      duration_minutes: session.duration_minutes,
      calories_burned: session.calories_burned,
      entry_date: date,
      distance: session.distance ?? null,
      avg_heart_rate: session.avg_heart_rate ?? null,
      notes: session.notes ?? null,
    };

    try {
      const updatedEntry = await updateEntry({ id: session.id, payload });
      invalidateEntryCache(date);
      invalidateEntryCache(normalizedDate);
      const updatedSession = { ...session, ...updatedEntry, entry_date: date };
      syncExerciseSessionInCache(queryClient, updatedSession);
      setSession(updatedSession);
    } catch {}
  };

  // --- Formatting helpers ---

  const formatDistance = (distanceKm: number): string => {
    const value = distanceFromKm(distanceKm, distanceUnit);
    const label = distanceUnit === 'miles' ? 'mi' : 'km';
    return `${value.toFixed(1)} ${label}`;
  };

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

    if (isSparky || duration > 0) {
      stats.push({
        value: duration > 0 ? String(Math.round(duration)) : '—',
        label: 'Duration',
        editKey: 'duration_minutes',
        editSuffix: 'min',
        keyboardType: 'numeric',
      });
    }
    if (isSparky || calories > 0) {
      stats.push({
        value: calories > 0 ? String(Math.round(calories)) : '—',
        label: 'Calories',
        editKey: 'calories_burned',
        editSuffix: 'cal',
        keyboardType: 'numeric',
      });
    }
    if (isSparky || (session.distance != null && session.distance > 0)) {
      const distValue = session.distance != null && session.distance > 0
        ? String(distanceFromKm(session.distance, distanceUnit).toFixed(1))
        : '—';
      stats.push({
        value: distValue,
        label: 'Distance',
        editKey: 'distance',
        editSuffix: distLabel,
        keyboardType: 'decimal-pad',
      });
    }
    if (isSparky || session.avg_heart_rate != null) {
      stats.push({
        value: session.avg_heart_rate != null ? String(session.avg_heart_rate) : '—',
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
    const canEdit = isSparky && stat.editKey;

    const content = (
      <View className={`bg-surface rounded-xl p-3 ${canEdit ? 'border' : ''}`} style={canEdit ? { borderColor: isActive ? accentPrimary : borderSubtle } : undefined}>
        <View style={{ minHeight: 24 }}>
          {isActive && stat.editKey ? (
            <FormInput
              value={editValue}
              onChangeText={setEditValue}
              onBlur={() => saveField(stat.editKey!, editValue)}
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
          onPress={() => startFieldEdit(stat.editKey!)}
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
      <View className="flex-row items-center px-4 py-3">
        <Button
          variant="ghost"
          onPress={() => {
            if (pendingEditRef.current) {
              const { field, value } = pendingEditRef.current;
              saveField(field, value);
            }
            navigation.goBack();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="py-0 px-0"
        >
          <Icon name="chevron-back" size={22} color={accentPrimary} />
        </Button>
        <View className="flex-1" />
      </View>

      <KeyboardAwareScrollView contentContainerClassName="px-4 pb-8" bottomOffset={20} keyboardShouldPersistTaps="handled">
        {/* Title area */}
        <View className="flex-row items-start mb-4">
          {firstImageSource && (
            <SafeImage
              source={firstImageSource}
              style={{ width: 48, height: 48, borderRadius: 10, marginRight: 12 }}
            />
          )}
          <View className="flex-1">
            {activeField === 'name' ? (
              <FormInput
                value={editValue}
                onChangeText={setEditValue}
                onBlur={() => saveField('name', editValue)}
                placeholder="Activity Name"
                autoFocus
                style={{ borderWidth: 0, backgroundColor: 'transparent', paddingLeft: 0, paddingTop: 8, paddingBottom: 8, fontSize: 20, fontWeight: '700' }}
              />
            ) : isSparky ? (
              <TouchableOpacity onPress={() => startFieldEdit('name')} activeOpacity={0.6}>
                <Text className="text-xl font-bold text-text-primary mb-0.5">{name}</Text>
              </TouchableOpacity>
            ) : (
              <Text className="text-xl font-bold text-text-primary mb-0.5">{name}</Text>
            )}
            {isSparky ? (
              <TouchableOpacity
                className="flex-row items-center mb-0.5"
                onPress={() => calendarSheetRef.current?.present()}
                activeOpacity={0.7}
              >
                <Text className="text-sm" style={{ color: accentPrimary }}>
                  {formatDateLabel(normalizedDate)}
                </Text>
                <Icon name="chevron-down" size={14} color={accentPrimary} style={{ marginLeft: 2 }} />
              </TouchableOpacity>
            ) : entryDate ? (
              <Text className="text-sm text-text-muted mb-0.5">{formatDate(entryDate)}</Text>
            ) : null}
            <Text className="text-sm text-text-muted">{sourceLabel}</Text>
          </View>
        </View>

        <Divider />

        {/* Stats grid */}
        {renderStatsGrid()}

        {/* Notes section */}
        {(activeField === 'notes' || session.notes || isSparky) && (
          <>
            <Divider />
            <View className="py-4">
              <Text className="text-sm font-medium text-text-secondary mb-2">Notes</Text>
              {activeField === 'notes' ? (
                <FormInput
                  value={editValue}
                  onChangeText={setEditValue}
                  onBlur={() => saveField('notes', editValue)}
                  placeholder="Add notes..."
                  multiline
                  autoFocus
                  style={{ minHeight: 60 }}
                />
              ) : isSparky ? (
                <TouchableOpacity onPress={() => startFieldEdit('notes')} activeOpacity={0.6}>
                  <Text className="text-sm text-text-primary">
                    {session.notes || 'Add notes...'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text className="text-sm text-text-primary">{session.notes}</Text>
              )}
            </View>
          </>
        )}

        {/* Delete */}
        {isSparky && (
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
        selectedDate={normalizedDate}
        onSelectDate={saveDate}
      />
    </View>
  );
};

export default ActivityDetailScreen;
