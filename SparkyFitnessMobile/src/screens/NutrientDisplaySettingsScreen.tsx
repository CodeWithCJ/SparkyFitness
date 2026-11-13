import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useNutrientDisplayPreferences } from '../hooks/useNutrientDisplayPreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConnection } from '../hooks/useServerConnection';
import { nutrientDisplayPreferencesQueryKey } from '../hooks/queryKeys';
import {
  resetNutrientDisplayPreference,
  updateNutrientDisplayPreference,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { getNutrientLabel } from '../constants/nutrients';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type NutrientDisplaySettingsScreenProps =
  RootStackScreenProps<'NutrientDisplaySettings'>;

const MOBILE_PLATFORM = 'mobile';

/**
 * View groups shared with web that this app reads: `food_database` drives the
 * nutrient list on food, meal and entry detail screens (`FoodNutrientBreakdown`)
 * and `report_tabular` drives Nutrition Details. `summary` (Dashboard) and
 * `diary` have their own screens. `quick_info`, `goal` and `report_chart` have
 * no mobile surface yet, so they are not offered; add one here only together
 * with the screen that reads it.
 */
const VIEW_GROUP_IDS = ['food_database', 'report_tabular'] as const;

/** Built-in nutrients offerable in a view group, in default order. Mirrors web. */
const BASE_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
  'sugars',
  'sodium',
  'cholesterol',
  'saturated_fat',
  'monounsaturated_fat',
  'polyunsaturated_fat',
  'trans_fat',
  'potassium',
  'vitamin_a',
  'vitamin_c',
  'iron',
  'calcium',
  'glycemic_index',
  'caffeine_mg',
  'water_ml',
  'alcohol_g',
];

/** Visible nutrients first, in saved order, then the hidden ones. */
function buildOrderedList(visible: string[], all: string[]): string[] {
  const allSet = new Set(all);
  const shown = visible.filter((n) => allSet.has(n));
  const shownSet = new Set(shown);
  return [...shown, ...all.filter((n) => !shownSet.has(n))];
}

const NutrientDisplaySettingsScreen: React.FC<
  NutrientDisplaySettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });
  const { preferences, isLoading, isError, refetch } =
    useNutrientDisplayPreferences({ enabled: isConnected });
  const [viewGroup, setViewGroup] = useState<string>(VIEW_GROUP_IDS[0]);

  const groupLabels: Record<(typeof VIEW_GROUP_IDS)[number], string> = {
    food_database: t('nutrientDisplay.groups.foodDatabase', {
      defaultValue: 'Food Database',
    }),
    report_tabular: t('nutrientDisplay.groups.reportTabular', {
      defaultValue: 'Report (Tabular)',
    }),
  };
  const groupOptions = VIEW_GROUP_IDS.map((id) => ({
    value: id as string,
    label: groupLabels[id],
  }));

  const allNutrients = useMemo(() => {
    return [...BASE_NUTRIENTS, ...customNutrients.map((n) => n.name)];
  }, [customNutrients]);

  const savedRow = preferences.find(
    (p) => p.view_group === viewGroup && p.platform === MOBILE_PLATFORM
  );
  const visible = useMemo(() => savedRow?.visible_nutrients ?? [], [savedRow]);
  const ordered = useMemo(
    () => buildOrderedList(visible, allNutrients),
    [visible, allNutrients]
  );
  const visibleSet = new Set(visible);

  const setCache = useCallback(
    (group: string, nutrients: string[]) => {
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) =>
          old.some(
            (p) => p.view_group === group && p.platform === MOBILE_PLATFORM
          )
            ? old.map((p) =>
                p.view_group === group && p.platform === MOBILE_PLATFORM
                  ? { ...p, visible_nutrients: nutrients }
                  : p
              )
            : [
                ...old,
                {
                  view_group: group,
                  platform: MOBILE_PLATFORM,
                  visible_nutrients: nutrients,
                },
              ]
      );
    },
    [queryClient]
  );

  const showError = useCallback(() => {
    Toast.show({
      type: 'error',
      text1: t('nutrientDisplay.updateFailed', {
        defaultValue: 'Failed to update nutrient display.',
      }),
    });
  }, [t]);

  const saveMutation = useMutation({
    mutationFn: ({
      group,
      nutrients,
    }: {
      group: string;
      nutrients: string[];
    }) => updateNutrientDisplayPreference(group, MOBILE_PLATFORM, nutrients),
    onMutate: async ({ group, nutrients }) => {
      await queryClient.cancelQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey
      );
      setCache(group, nutrients);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          nutrientDisplayPreferencesQueryKey,
          context.previous
        );
      }
      showError();
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      }),
  });

  const resetMutation = useMutation({
    mutationFn: (group: string) =>
      resetNutrientDisplayPreference(group, MOBILE_PLATFORM),
    onError: showError,
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      }),
  });

  // Save and reset both replace the whole list server-side, so only one may be
  // in flight. `isPending` is render-derived and cannot stop a second handler
  // that runs before the next render; this ref is taken synchronously.
  const requestInFlight = useRef(false);
  const runExclusive = (start: () => Promise<unknown>) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    void start()
      .catch(() => undefined) // reported by the mutation's onError
      .finally(() => {
        requestInFlight.current = false;
      });
  };

  const toggle = (nutrient: string, on: boolean) => {
    // A newly shown nutrient joins the end of the visible list; a hidden one
    // drops out of it. Hidden nutrients keep their place below the visible ones.
    const next = on
      ? [...visible, nutrient]
      : visible.filter((n) => n !== nutrient);
    runExclusive(() =>
      saveMutation.mutateAsync({ group: viewGroup, nutrients: next })
    );
  };

  const move = (nutrient: string, delta: -1 | 1) => {
    const index = visible.indexOf(nutrient);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= visible.length) return;
    const next = [...visible];
    [next[index], next[target]] = [next[target]!, next[index]!];
    runExclusive(() =>
      saveMutation.mutateAsync({ group: viewGroup, nutrients: next })
    );
  };

  const labelFor = (key: string) =>
    customNutrients.some((n) => n.name === key)
      ? key
      : getNutrientLabel(t, key);

  const header = useScreenHeader({
    title: t('nutrientDisplay.title', { defaultValue: 'Nutrient Display' }),
    left: { kind: 'back' },
  });

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <StatusView
        loading
        title={t('nutrientDisplay.loading', {
          defaultValue: 'Loading nutrient display...',
        })}
      />
    );
  } else if (isError) {
    body = (
      <StatusView
        icon="alert-circle"
        iconTone="danger"
        title={t('nutrientDisplay.loadFailed', {
          defaultValue: 'Failed to load nutrient display',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => void refetch(),
        }}
      />
    );
  } else {
    body = (
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-3">
          {t('nutrientDisplay.description', {
            defaultValue:
              'Choose which nutrients this app shows in each place, and their order. Dashboard and Diary have their own settings.',
          })}
        </Text>
        <BottomSheetPicker
          value={viewGroup}
          options={groupOptions}
          onSelect={setViewGroup}
          title={t('nutrientDisplay.groupPicker', { defaultValue: 'Show in' })}
          containerStyle={{ marginBottom: 12 }}
        />
        <View className="bg-surface rounded-xl shadow-sm mb-4">
          {ordered.map((nutrient, i) => {
            const isVisible = visibleSet.has(nutrient);
            const visibleIndex = visible.indexOf(nutrient);
            return (
              <View
                key={nutrient}
                testID={`nutrient-row-${nutrient}`}
                className={`flex-row items-center px-3 py-2 ${
                  i < ordered.length - 1 ? 'border-b border-border-subtle' : ''
                }`}
              >
                <Text
                  className="flex-1 text-base text-text-primary"
                  numberOfLines={1}
                >
                  {labelFor(nutrient)}
                </Text>
                {isVisible ? (
                  <>
                    <Pressable
                      testID={`move-up-${nutrient}`}
                      hitSlop={8}
                      disabled={visibleIndex === 0}
                      onPress={() => move(nutrient, -1)}
                      accessibilityRole="button"
                      accessibilityLabel={t('nutrientDisplay.moveUp', {
                        defaultValue: 'Move {{name}} up',
                        name: labelFor(nutrient),
                      })}
                      className="px-2 py-2"
                      style={{ opacity: visibleIndex === 0 ? 0.3 : 1 }}
                    >
                      <Icon name="chevron-up" size={18} color={accent} />
                    </Pressable>
                    <Pressable
                      testID={`move-down-${nutrient}`}
                      hitSlop={8}
                      disabled={visibleIndex === visible.length - 1}
                      onPress={() => move(nutrient, 1)}
                      accessibilityRole="button"
                      accessibilityLabel={t('nutrientDisplay.moveDown', {
                        defaultValue: 'Move {{name}} down',
                        name: labelFor(nutrient),
                      })}
                      className="px-2 py-2 mr-1"
                      style={{
                        opacity: visibleIndex === visible.length - 1 ? 0.3 : 1,
                      }}
                    >
                      <Icon name="chevron-down" size={18} color={accent} />
                    </Pressable>
                  </>
                ) : null}
                <Switch
                  value={isVisible}
                  onValueChange={(on) => toggle(nutrient, on)}
                  accessibilityLabel={t('nutrientDisplay.show', {
                    defaultValue: 'Show {{name}}',
                    name: labelFor(nutrient),
                  })}
                />
              </View>
            );
          })}
        </View>
        <Pressable
          testID="reset-nutrient-display"
          accessibilityRole="button"
          onPress={() =>
            runExclusive(() => resetMutation.mutateAsync(viewGroup))
          }
          disabled={resetMutation.isPending || saveMutation.isPending}
          className="items-center py-3"
        >
          <Text className="text-accent-primary text-base font-semibold">
            {t('nutrientDisplay.reset', { defaultValue: 'Reset to default' })}
          </Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {body}
    </View>
  );
};

export default NutrientDisplaySettingsScreen;
