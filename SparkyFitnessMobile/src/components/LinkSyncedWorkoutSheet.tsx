import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  CALORIE_LINK_RESOLUTIONS,
  type CalorieLinkCandidate,
  type CalorieLinkResolution,
} from '@workspace/shared';
import Button from './ui/Button';
import Icon from './Icon';
import { sheetContainer, useSheetBackdrop } from './ui/sheetChrome';
import { formatLocalizedNumber } from '../localization';
import { parseDecimalInput } from '../utils/numericInput';
import {
  useCalorieLinkSuggestions,
  useClearCalorieLink,
  useSetCalorieLink,
} from '../hooks/useCalorieLink';

export interface LinkSyncedWorkoutSheetRef {
  present: () => void;
  dismiss: () => void;
}

interface LinkSyncedWorkoutSheetProps {
  /** The logged workout's entry, or any entry of its strength session. */
  entryId: string;
  entryDate: string;
  /**
   * Called after a link is saved (its resolution, and what each entry of the
   * workout now counts by entry id) or removed (null and no entries, so every
   * entry counts its own estimate again).
   */
  onLinkChange?: (
    resolution: CalorieLinkResolution | null,
    applied: Record<string, number | null>
  ) => void;
}

const formatCalories = (value: number) =>
  formatLocalizedNumber(Math.round(value));

/**
 * Links a workout logged in the app to the same session synced from a watch or
 * health platform, so its calories count once (#2353). Both estimates are kept;
 * the person chooses which one the day counts. A synced workout whose time
 * window holds the session's set times is suggested, never linked on its own.
 */
const LinkSyncedWorkoutSheet = forwardRef<
  LinkSyncedWorkoutSheetRef,
  LinkSyncedWorkoutSheetProps
>(({ entryId, entryDate, onLinkChange }, ref) => {
  const { t } = useTranslation();
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const [accentPrimary, surfaceBg, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-surface',
    '--color-text-muted',
  ]) as [string, string, string];

  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useCalorieLinkSuggestions(entryId, open);
  const setLink = useSetCalorieLink(entryId, entryDate);
  const clearLink = useClearCalorieLink(entryId, entryDate);

  const [selectedId, setSelectedId] = useState('');
  const [resolution, setResolution] =
    useState<CalorieLinkResolution>('sparkyfitness');
  const [customText, setCustomText] = useState('');

  useImperativeHandle(ref, () => ({
    present: () => {
      setOpen(true);
      bottomSheetRef.current?.present();
    },
    dismiss: () => bottomSheetRef.current?.dismiss(),
  }));

  // Start on the workout already linked, else the first that looks like the
  // same session; the person can always choose another.
  const [seededFrom, setSeededFrom] = useState<typeof data>(undefined);
  if (data && data !== seededFrom) {
    setSeededFrom(data);
    const best = data.candidates.find((c) => c.match !== null);
    setSelectedId(data.link?.synced_entry_id ?? best?.id ?? '');
    setResolution(data.link?.resolution ?? 'sparkyfitness');
  }

  const selected = data?.candidates.find((c) => c.id === selectedId);
  const manual = data?.manual_total_calories ?? 0;
  const synced = selected?.calories_burned ?? 0;
  const preview = useMemo<Record<CalorieLinkResolution, string>>(
    () => ({
      sparkyfitness: formatCalories(manual),
      synced: formatCalories(synced),
      higher: formatCalories(Math.max(manual, synced)),
      lower: formatCalories(Math.min(manual, synced)),
      average: formatCalories((manual + synced) / 2),
      custom: '',
    }),
    [manual, synced]
  );
  const customValue = parseDecimalInput(customText);
  const canLink =
    !!selected &&
    (resolution !== 'custom' || (!isNaN(customValue) && customValue >= 0));
  const busy = setLink.isPending || clearLink.isPending;

  const handleLink = useCallback(async () => {
    if (!selected) return;
    let result;
    try {
      result = await setLink.mutateAsync({
        synced_entry_id: selected.id,
        resolution,
        ...(resolution === 'custom' ? { custom_calories: customValue } : {}),
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('calorieLink.linkError', {
          defaultValue: 'Failed to link the workouts.',
        }),
      });
      return;
    }
    onLinkChange?.(
      resolution,
      Object.fromEntries(
        result.applied.map((row) => [row.entry_id, row.calories_applied])
      )
    );
    bottomSheetRef.current?.dismiss();
  }, [selected, setLink, resolution, customValue, onLinkChange, t]);

  const handleUnlink = useCallback(async () => {
    try {
      await clearLink.mutateAsync();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('calorieLink.unlinkError', {
          defaultValue: 'Failed to unlink the workouts.',
        }),
      });
      return;
    }
    onLinkChange?.(null, {});
    bottomSheetRef.current?.dismiss();
  }, [clearLink, onLinkChange, t]);

  const resolutionLabel = (option: CalorieLinkResolution) => {
    switch (option) {
      case 'sparkyfitness':
        return t('calorieLink.sparkyfitness', {
          defaultValue: 'This workout ({{value}})',
          value: preview.sparkyfitness,
        });
      case 'synced':
        return t('calorieLink.synced', {
          defaultValue: 'The synced workout ({{value}})',
          value: preview.synced,
        });
      case 'higher':
        return t('calorieLink.higher', {
          defaultValue: 'The higher of the two ({{value}})',
          value: preview.higher,
        });
      case 'lower':
        return t('calorieLink.lower', {
          defaultValue: 'The lower of the two ({{value}})',
          value: preview.lower,
        });
      case 'average':
        return t('calorieLink.average', {
          defaultValue: 'The average ({{value}})',
          value: preview.average,
        });
      case 'custom':
        return t('calorieLink.custom', { defaultValue: 'A custom total' });
    }
  };

  const renderCandidate = (candidate: CalorieLinkCandidate) => {
    const isSelected = candidate.id === selectedId;
    const details = [
      candidate.source,
      candidate.start_time,
      t('calorieLink.minutes', {
        defaultValue: '{{value}} min',
        value: Math.round(candidate.duration_minutes),
      }),
      t('calorieLink.calories', {
        defaultValue: '{{value}} cal',
        value: formatCalories(candidate.calories_burned),
      }),
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      <TouchableOpacity
        key={candidate.id}
        className="flex-row items-center py-3 border-b border-border-subtle"
        onPress={() => setSelectedId(candidate.id)}
        activeOpacity={0.7}
        accessibilityRole="radio"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={[
          candidate.name ||
            t('calorieLink.workoutFallback', { defaultValue: 'Workout' }),
          candidate.start_time,
          candidate.source,
        ]
          .filter(Boolean)
          .join(', ')}
        testID={`link-candidate-${candidate.id}`}
      >
        <View className="flex-1 pr-3">
          <Text className="text-base font-medium text-text-primary">
            {candidate.name ||
              t('calorieLink.workoutFallback', { defaultValue: 'Workout' })}
          </Text>
          <Text className="text-sm text-text-muted">{details}</Text>
          {candidate.match && (
            <Text className="text-xs font-semibold text-accent-primary mt-0.5">
              {candidate.match === 'sets_within'
                ? t('calorieLink.sameSession', {
                    defaultValue: 'Same session',
                  })
                : t('calorieLink.sameTime', {
                    defaultValue: 'Overlaps in time',
                  })}
            </Text>
          )}
        </View>
        {isSelected && (
          <Icon name="checkmark" size={20} color={accentPrimary} />
        )}
      </TouchableOpacity>
    );
  };

  const renderBackdrop = useSheetBackdrop();

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      snapPoints={['85%']}
      enableDynamicSizing={false}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustPan"
      containerComponent={sheetContainer}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: surfaceBg }}
      handleIndicatorStyle={{ backgroundColor: textMuted }}
      onDismiss={() => setOpen(false)}
    >
      <BottomSheetScrollView contentContainerClassName="px-6 pb-safe-or-8">
        <Text className="text-lg font-semibold text-text-primary text-center mb-2">
          {t('calorieLink.title', { defaultValue: 'Link a synced workout' })}
        </Text>
        <Text className="text-sm text-text-muted text-center mb-4">
          {t('calorieLink.description', {
            defaultValue:
              'If a watch or health app recorded this session too, link the two so its calories count once. Both estimates are kept.',
          })}
        </Text>

        {isLoading && (
          <Text className="text-sm text-text-muted text-center">
            {t('calorieLink.loading', {
              defaultValue: 'Looking for synced workouts...',
            })}
          </Text>
        )}
        {isError && (
          <Text className="text-sm text-text-danger text-center">
            {t('calorieLink.loadError', {
              defaultValue: 'Could not load synced workouts.',
            })}
          </Text>
        )}
        {data && data.candidates.length === 0 && (
          <Text className="text-sm text-text-muted text-center">
            {t('calorieLink.none', {
              defaultValue: 'No synced workouts found for this day.',
            })}
          </Text>
        )}

        {data && data.candidates.length > 0 && (
          <>
            <View className="mb-4">{data.candidates.map(renderCandidate)}</View>

            <Text className="text-sm font-semibold text-text-secondary mb-1">
              {t('calorieLink.countHeading', {
                defaultValue: 'Count in the daily total',
              })}
            </Text>
            {CALORIE_LINK_RESOLUTIONS.map((option) => {
              const isSelected = option === resolution;
              return (
                <TouchableOpacity
                  key={option}
                  className="flex-row items-center justify-between py-3 border-b border-border-subtle"
                  onPress={() => setResolution(option)}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={resolutionLabel(option)}
                  testID={`link-resolution-${option}`}
                >
                  <Text className="text-base text-text-primary">
                    {resolutionLabel(option)}
                  </Text>
                  {isSelected && (
                    <Icon name="checkmark" size={20} color={accentPrimary} />
                  )}
                </TouchableOpacity>
              );
            })}
            {resolution === 'custom' && (
              <View className="py-3">
                <Text className="text-xs text-text-muted mb-1">
                  {t('calorieLink.customLabel', {
                    defaultValue: 'Total for the session (cal)',
                  })}
                </Text>
                <BottomSheetTextInput
                  value={customText}
                  onChangeText={setCustomText}
                  keyboardType="decimal-pad"
                  className="border border-border-subtle rounded-lg px-3 py-2.5 text-base text-text-primary"
                  accessibilityLabel={t('calorieLink.customLabel', {
                    defaultValue: 'Total for the session (cal)',
                  })}
                  testID="link-custom-calories"
                />
              </View>
            )}

            <View className="mt-4" style={{ gap: 8 }}>
              <Button
                variant="primary"
                onPress={handleLink}
                disabled={!canLink || busy}
                loading={setLink.isPending}
              >
                {t('calorieLink.link', { defaultValue: 'Link workouts' })}
              </Button>
            </View>
          </>
        )}
        {data?.link && (
          <View className="mt-4" style={{ gap: 8 }}>
            <Button
              variant="outline"
              onPress={handleUnlink}
              disabled={busy}
              loading={clearLink.isPending}
            >
              {t('calorieLink.unlink', { defaultValue: 'Unlink' })}
            </Button>
          </View>
        )}
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
});

LinkSyncedWorkoutSheet.displayName = 'LinkSyncedWorkoutSheet';

export default LinkSyncedWorkoutSheet;
