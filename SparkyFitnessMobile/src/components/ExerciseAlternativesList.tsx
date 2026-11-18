import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useCSSVariable } from 'uniwind';
import type {
  ExerciseAlternative,
  ExerciseAlternativeMode,
  ExerciseAlternativeReason,
} from '@workspace/shared';
import Icon from './Icon';
import SafeImage from './SafeImage';
import SegmentedControl from './SegmentedControl';
import StatusView from './StatusView';
import Button from './ui/Button';
import { useExerciseAlternatives } from '../hooks/useExerciseAlternatives';
import { useExerciseImageSource } from '../hooks/useExerciseImageSource';
import { CATEGORY_ICON_MAP } from '../utils/workoutSession';
import type { ExerciseReplaceContext } from '../utils/exerciseReplace';
import { localizeExerciseTaxonomyValue } from '../localization/exerciseTaxonomy';

interface ExerciseAlternativesListProps {
  replaceFor: ExerciseReplaceContext;
  /** An import or navigation is in flight; rows are disabled. */
  disabled: boolean;
  /** Catalog id currently being imported, for its row spinner. */
  importingId: string | null;
  onSelect: (alternative: ExerciseAlternative) => void;
  onPreview: (alternative: ExerciseAlternative) => void;
  onSearchAll: () => void;
  /** The focus view's Replace page look (Phone-Replace board): card rows, a Replace button each. */
  cards?: boolean;
}

// A row shows at most this many reasons; the first ones are the strongest.
const MAX_REASON_CHIPS = 3;

export function alternativeReasonLabel(
  t: TFunction,
  reason: ExerciseAlternativeReason
): string {
  switch (reason) {
    case 'same_primary_muscles':
      return t('exerciseSearch.alternatives.reasons.sameMuscles', {
        defaultValue: 'Same muscles',
      });
    case 'shares_primary_muscle':
      return t('exerciseSearch.alternatives.reasons.sharesMuscle', {
        defaultValue: 'Similar muscles',
      });
    case 'same_equipment':
      return t('exerciseSearch.alternatives.reasons.sameEquipment', {
        defaultValue: 'Same equipment',
      });
    case 'different_equipment':
      return t('exerciseSearch.alternatives.reasons.differentEquipment', {
        defaultValue: 'Different equipment',
      });
    case 'same_movement':
      return t('exerciseSearch.alternatives.reasons.sameMovement', {
        defaultValue: 'Same movement',
      });
    case 'recently_performed':
      return t('exerciseSearch.alternatives.reasons.recent', {
        defaultValue: 'Done recently',
      });
    case 'in_library':
      return t('exerciseSearch.alternatives.reasons.inLibrary', {
        defaultValue: 'In your library',
      });
  }
}

const ExerciseAlternativesList: React.FC<ExerciseAlternativesListProps> = ({
  replaceFor,
  disabled,
  importingId,
  onSelect,
  onPreview,
  onSearchAll,
  cards = false,
}) => {
  const { t } = useTranslation();
  const [accentColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];
  const { getImageSource } = useExerciseImageSource();
  const [mode, setMode] = useState<ExerciseAlternativeMode>('similar');

  const { data, isLoading, isError, refetch } = useExerciseAlternatives(
    replaceFor.exerciseId,
    mode,
    replaceFor.excludeIds
  );

  const modes = useMemo(
    () => [
      {
        key: 'similar' as const,
        label: t('exerciseSearch.alternatives.modes.similar', {
          defaultValue: 'Similar',
        }),
      },
      {
        key: 'different_equipment' as const,
        label: t('exerciseSearch.alternatives.modes.differentEquipment', {
          defaultValue: 'Other equipment',
        }),
      },
    ],
    [t]
  );

  const renderRow = useCallback(
    ({ item }: { item: ExerciseAlternative }) => {
      const image = item.images[0] ?? null;
      const fallbackIcon =
        (item.category && CATEGORY_ICON_MAP[item.category]) ||
        'exercise-weights';
      const details = [
        item.equipment
          .map((eq) => localizeExerciseTaxonomyValue(t, 'equipment', eq))
          .join(', '),
        item.primary_muscles
          .map((m) => localizeExerciseTaxonomyValue(t, 'muscle', m))
          .join(', '),
      ]
        .filter(Boolean)
        .join(' · ');
      if (cards) {
        return (
          <View className="mx-4 mb-2 flex-row items-center gap-3 rounded-2xl bg-surface p-2.5">
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={disabled}
              onPress={() => onPreview(item)}
              accessibilityRole="button"
              accessibilityLabel={t('exerciseSearch.actions.viewDetails', {
                defaultValue: 'View exercise details',
              })}
            >
              <SafeImage
                source={image ? getImageSource(image) : null}
                style={{ width: 64, height: 64, borderRadius: 14 }}
                fallback={
                  <View
                    className="items-center justify-center bg-raised"
                    style={{ width: 64, height: 64, borderRadius: 14 }}
                  >
                    <Icon name={fallbackIcon} size={26} color={textMuted} />
                  </View>
                }
              />
            </TouchableOpacity>
            <View className="min-w-0 flex-1">
              <Text
                className="text-[17px] font-bold text-text-primary"
                numberOfLines={2}
              >
                {item.name}
              </Text>
              {details.length > 0 && (
                <Text
                  className="text-[14px] text-text-secondary"
                  numberOfLines={1}
                >
                  {details}
                </Text>
              )}
            </View>
            <TouchableOpacity
              testID={`alternative-${item.id}`}
              activeOpacity={0.7}
              disabled={disabled}
              onPress={() => onSelect(item)}
              accessibilityRole="button"
              accessibilityLabel={t('exerciseSearch.alternatives.replaceWith', {
                defaultValue: 'Replace with {{name}}',
                name: item.name,
              })}
              className="h-10 min-w-[84px] items-center justify-center rounded-full bg-accent-primary px-4"
            >
              {importingId === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="text-[15px] font-bold text-white">
                  {t('exerciseSearch.alternatives.replace', {
                    defaultValue: 'Replace',
                  })}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      }
      return (
        <View className="flex-row items-center border-b border-border-subtle">
          <TouchableOpacity
            className="pl-4 py-3"
            activeOpacity={0.7}
            accessible={false}
            disabled={disabled}
            onPress={() => onPreview(item)}
          >
            <SafeImage
              source={image ? getImageSource(image) : null}
              style={{ width: 44, height: 44, borderRadius: 8 }}
              fallback={
                <View
                  className="bg-raised items-center justify-center"
                  style={{ width: 44, height: 44, borderRadius: 8 }}
                >
                  <Icon name={fallbackIcon} size={22} color={textMuted} />
                </View>
              }
            />
          </TouchableOpacity>
          <TouchableOpacity
            className="flex-1 pl-3 py-3"
            activeOpacity={0.7}
            disabled={disabled}
            onPress={() => onSelect(item)}
            testID={`alternative-${item.id}`}
          >
            <Text
              className="text-text-primary text-base font-medium"
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {details.length > 0 && (
              <Text
                className="text-text-secondary text-sm mt-0.5"
                numberOfLines={1}
              >
                {details}
              </Text>
            )}
            <View className="flex-row flex-wrap gap-1 mt-1">
              {item.origin === 'catalog' && (
                <View className="rounded-full px-2 py-0.5 bg-accent-primary">
                  <Text className="text-xs text-white">
                    {t('exerciseSearch.alternatives.newBadge', {
                      defaultValue: 'New',
                    })}
                  </Text>
                </View>
              )}
              {item.reasons.slice(0, MAX_REASON_CHIPS).map((reason) => (
                <View
                  key={reason}
                  className="rounded-full px-2 py-0.5 bg-raised"
                >
                  <Text className="text-xs text-text-secondary">
                    {alternativeReasonLabel(t, reason)}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            className="px-4 py-3"
            activeOpacity={0.7}
            hitSlop={8}
            disabled={disabled}
            accessibilityLabel={t('exerciseSearch.actions.viewDetails', {
              defaultValue: 'View exercise details',
            })}
            onPress={() => onPreview(item)}
          >
            {importingId === item.id ? (
              <ActivityIndicator size="small" color={accentColor} />
            ) : (
              <Icon name="info-circle" size={22} color={accentColor} />
            )}
          </TouchableOpacity>
        </View>
      );
    },
    [
      cards,
      accentColor,
      disabled,
      getImageSource,
      importingId,
      onPreview,
      onSelect,
      t,
      textMuted,
    ]
  );

  const searchAllAction = {
    label: t('exerciseSearch.alternatives.searchAll', {
      defaultValue: 'Search all exercises',
    }),
    onPress: onSearchAll,
  };

  let body: React.ReactNode;
  if (isLoading) {
    body = <StatusView loading />;
  } else if (isError || !data) {
    body = (
      <StatusView
        icon="alert-circle"
        title={t('exerciseSearch.alternatives.failed', {
          defaultValue: 'Could not load alternatives',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => refetch(),
        }}
      />
    );
  } else if (!data.rankable) {
    body = (
      <StatusView
        icon="search"
        title={t('exerciseSearch.alternatives.noMuscles', {
          defaultValue: 'No muscles recorded for {{name}}',
          name: replaceFor.exerciseName,
        })}
        subtitle={t('exerciseSearch.alternatives.noMusclesHint', {
          defaultValue:
            'Add its primary muscles in the exercise library to get suggestions.',
        })}
        action={searchAllAction}
      />
    );
  } else if (data.alternatives.length === 0) {
    body = (
      <StatusView
        icon="search"
        title={t('exerciseSearch.alternatives.empty', {
          defaultValue: 'No alternatives found',
        })}
        action={searchAllAction}
      />
    );
  } else {
    body = (
      <FlatList
        data={data.alternatives}
        keyExtractor={(item) => `${item.origin}-${item.id}`}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="pb-safe-or-4"
        ListFooterComponent={
          cards ? (
            !data.catalog_available ? (
              <Text className="px-4 py-2 text-center text-xs text-text-muted">
                {t('exerciseSearch.alternatives.catalogUnavailable', {
                  defaultValue:
                    'Free Exercise DB is unavailable, so only your library is shown.',
                })}
              </Text>
            ) : null
          ) : (
            <View className="py-4 items-center">
              {!data.catalog_available && (
                <Text className="text-text-muted text-xs px-4 mb-2 text-center">
                  {t('exerciseSearch.alternatives.catalogUnavailable', {
                    defaultValue:
                      'Free Exercise DB is unavailable, so only your library is shown.',
                  })}
                </Text>
              )}
              <Button
                variant="ghost"
                onPress={onSearchAll}
                textClassName="text-sm"
              >
                {searchAllAction.label}
              </Button>
            </View>
          )
        }
      />
    );
  }

  if (cards) {
    return (
      <View className="flex-1">
        <View className="gap-2 px-4 pb-3">
          <Text
            accessibilityRole="header"
            className="text-[26px] font-extrabold text-text-primary"
          >
            {replaceFor.exerciseName}
          </Text>
          <Text className="text-[15px] text-text-secondary">
            {t('exerciseSearch.alternatives.cardsHint', {
              defaultValue:
                'Swap for something similar. Logged sets stay with the new exercise.',
            })}
          </Text>
          <SegmentedControl
            segments={modes}
            activeKey={mode}
            onSelect={setMode}
          />
          <Text className="pt-1 text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
            {mode === 'similar'
              ? t('exerciseSearch.alternatives.similarHeading', {
                  defaultValue: 'Similar exercises',
                })
              : t('exerciseSearch.alternatives.otherEquipmentHeading', {
                  defaultValue: 'Other equipment',
                })}
          </Text>
        </View>
        <View className="flex-1">{body}</View>
        <View className="px-4 pb-safe-or-4 pt-2">
          <Pressable
            onPress={onSearchAll}
            accessibilityRole="button"
            className="h-14 items-center justify-center rounded-full bg-raised active:opacity-70"
          >
            <Text className="text-[18px] font-bold text-text-primary">
              {t('workout.replaceWithOther', {
                defaultValue: 'Replace with another exercise…',
              })}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <View className="px-4 pb-2">
        <Text className="text-text-secondary text-sm mb-2" numberOfLines={1}>
          {t('exerciseSearch.alternatives.heading', {
            defaultValue: 'Instead of {{name}}',
            name: replaceFor.exerciseName,
          })}
        </Text>
        <SegmentedControl
          segments={modes}
          activeKey={mode}
          onSelect={setMode}
        />
      </View>
      <View className="flex-1 bg-surface">{body}</View>
    </View>
  );
};

export default ExerciseAlternativesList;
