import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Icon from '../components/Icon';
import Button from '../components/ui/Button';
import CollapsibleSection from '../components/CollapsibleSection';
import { getSourceLabel, getWorkoutIcon, formatDuration, getWorkoutSummary } from '../components/WorkoutCard';
import { useDeleteExerciseEntry } from '../hooks/useDeleteExerciseEntry';
import { useDeleteWorkout } from '../hooks/useDeleteWorkout';
import { usePreferences } from '../hooks/usePreferences';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { formatDate } from '../utils/dateUtils';
import { extractActivitySummary } from '../utils/activityDetails';
import { weightFromKg, distanceFromKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';
import type { ExerciseEntryResponse, ExerciseSnapshotResponse } from '@workspace/shared';

import type { GetImageSource } from '../hooks/useExerciseImageSource';

type Props = RootStackScreenProps<'WorkoutDetail'>;

function getImageSourceSignature(
  source: { uri: string; headers: Record<string, string> } | null,
): string {
  if (!source) return '';

  const headerSignature = Object.entries(source.headers)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');

  return `${source.uri}|${headerSignature}`;
}

const ExerciseImage: React.FC<{
  source: { uri: string; headers: Record<string, string> };
  size: number;
}> = ({ source, size }) => {
  const [error, setError] = useState(false);
  const sourceSignature = getImageSourceSignature(source);

  useEffect(() => {
    setError(false);
  }, [sourceSignature]);

  if (error) return null;

  return (
    <Image
      source={{ uri: source.uri, headers: source.headers }}
      style={{ width: size, height: size, borderRadius: 12 }}
      onError={() => setError(true)}
    />
  );
};

const ExerciseThumbnail: React.FC<{
  images: string[] | null | undefined;
  getImageSource: GetImageSource;
}> = ({ images, getImageSource }) => {
  const [error, setError] = useState(false);
  const firstImage = images?.[0];
  const source = firstImage ? getImageSource(firstImage) : null;
  const sourceSignature = getImageSourceSignature(source);

  useEffect(() => {
    setError(false);
  }, [sourceSignature]);

  if (!source || error) return null;

  return (
    <Image
      source={{ uri: source.uri, headers: source.headers }}
      style={{ width: 48, height: 48, borderRadius: 8, marginRight: 12 }}
      onError={() => setError(true)}
    />
  );
};

const WorkoutDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { session } = route.params;
  const insets = useSafeAreaInsets();
  const { preferences } = usePreferences();
  const weightUnit = preferences?.default_weight_unit ?? 'kg';
  const distanceUnit = (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';

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
  const normalizedDate = entryDate.split('T')[0];

  // Session data
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

  const handleEdit = () => {
    if (isPreset) {
      navigation.navigate('WorkoutForm', { session });
    } else {
      navigation.navigate('ActivityForm', { entry: session, popCount: 2 });
    }
  };

  const handleDelete = () => {
    if (isPreset) {
      deleteWorkout.confirmAndDelete();
    } else {
      deleteActivity.confirmAndDelete();
    }
  };

  const isDeleting = deleteActivity.isPending || deleteWorkout.isPending;

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
          <ExerciseImage source={sources[0]!} size={size} />
        </View>
      );
    }

    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 mb-1">
        <View className="flex-row gap-3">
          {sources.map((src, i) => (
            <ExerciseImage key={i} source={src!} size={size} />
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
              <ExerciseThumbnail
                images={exercise.exercise_snapshot?.images}
                getImageSource={getImageSource}
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

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="py-0 px-0"
        >
          <Icon name="chevron-back" size={22} color={accentPrimary} />
        </Button>
        {isSparky && (
          <Button
            variant="ghost"
            onPress={handleEdit}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="py-0 px-0 ml-auto"
          >
            <Text className="text-accent-primary text-base font-medium">Edit</Text>
          </Button>
        )}
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-4 py-4">
        {/* Title area */}
        <View className="mb-4">
          <View className="flex-row items-center mb-2">
            <Icon name={iconName} size={28} color={accentPrimary} />
            <Text className="text-2xl font-bold text-text-primary ml-3 flex-1" numberOfLines={2}>
              {name}
            </Text>
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
            {entryDate ? (
              <Text className="text-sm text-text-muted">{formatDate(entryDate)}</Text>
            ) : null}
          </View>
        </View>

        {/* Summary card */}
        <View className="bg-surface rounded-xl p-4">
          <View className="flex-row items-center justify-around">
            {duration > 0 && (
              <View className="items-center">
                <Text className="text-lg font-semibold text-text-primary">
                  {formatDuration(duration)}
                </Text>
                <Text className="text-xs text-text-muted mt-0.5">Duration</Text>
              </View>
            )}
            {duration > 0 && calories > 0 && (
              <View style={{ width: 1, height: 32, backgroundColor: borderSubtle }} />
            )}
            {calories > 0 && (
              <View className="items-center">
                <Text className="text-lg font-semibold text-text-primary">
                  {Math.round(calories)}
                </Text>
                <Text className="text-xs text-text-muted mt-0.5">Calories</Text>
              </View>
            )}
            {isPreset && (
              <>
                {(duration > 0 || calories > 0) && (
                  <View style={{ width: 1, height: 32, backgroundColor: borderSubtle }} />
                )}
                <View className="items-center">
                  <Text className="text-lg font-semibold text-text-primary">
                    {session.exercises.length}
                  </Text>
                  <Text className="text-xs text-text-muted mt-0.5">
                    {session.exercises.length === 1 ? 'Exercise' : 'Exercises'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Exercise images (individual sessions only) */}
        {session.type === 'individual' && renderExerciseImages(session.exercise_snapshot?.images)}

        {/* Metadata badges (individual sessions only) */}
        {session.type === 'individual' && renderMetadataBadges(session.exercise_snapshot)}

        {/* Variant-specific content */}
        {renderPresetContent()}
        {renderIndividualContent()}

        {/* Exercise details (individual sessions only) */}
        {session.type === 'individual' && renderExerciseDetails(session.exercise_snapshot, 'individual')}

        {renderActivityDetails()}

        {/* Delete button — only for Sparky sessions */}
        {isSparky && (
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
      </ScrollView>
    </View>
  );
};

export default WorkoutDetailScreen;
