import { useMutation, useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchRow } from '../components/ReorderSwitchRow';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import {
  computeReorderTargetIndex,
  resetReorderDragPreview,
  useReorderRowGeometry,
} from '../components/WorkoutReorderList';
import {
  DASHBOARD_CARD_SUBTITLES,
  DASHBOARD_CARD_TITLES,
  type DashboardCardKey,
} from '../constants/dashboardCards';
import {
  useCustomNutrients,
  useNutrientDisplayPreferences,
  useServerConnection,
} from '../hooks';
import { nutrientDisplayPreferencesQueryKey } from '../hooks/queryKeys';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  updateNutrientDisplayPreference,
  type NutrientDisplayPreference,
} from '../services/api/preferencesApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveDashboardCardOrder } from '../utils/dashboardCardPreferences';
import { toggleNutrientVisibility } from '../utils/nutrientUtils';
import { moveItem } from '../utils/reorderUtils';

type DashboardSettingsScreenProps = RootStackScreenProps<'DashboardSettings'>;

const SUMMARY_VIEW_GROUP = 'summary';
const MOBILE_PLATFORM = 'mobile';
const DASHBOARD_CARD_ROW_HEIGHT = 72;

// Matches what the server synthesizes for the summary/mobile row when the user
// has never customized it. Only used defensively if the row is somehow absent
// after the preferences query has resolved — the real row is the merge base.
const SERVER_DEFAULT_SUMMARY_NUTRIENTS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'dietary_fiber',
];

const DashboardSettingsScreen: React.FC<DashboardSettingsScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const calorieRingCardVisible = useAppPreferencesStore(
    (s) => s.calorieRingCardVisible
  );
  const setCalorieRingCardVisible = useAppPreferencesStore(
    (s) => s.setCalorieRingCardVisible
  );
  const macrosCardVisible = useAppPreferencesStore((s) => s.macrosCardVisible);
  const setMacrosCardVisible = useAppPreferencesStore(
    (s) => s.setMacrosCardVisible
  );
  const exerciseCardVisible = useAppPreferencesStore(
    (s) => s.exerciseCardVisible
  );
  const setExerciseCardVisible = useAppPreferencesStore(
    (s) => s.setExerciseCardVisible
  );
  const fastingCardVisible = useAppPreferencesStore(
    (s) => s.fastingCardVisible
  );
  const setFastingCardVisible = useAppPreferencesStore(
    (s) => s.setFastingCardVisible
  );
  const cycleCardVisible = useAppPreferencesStore((s) => s.cycleCardVisible);
  const setCycleCardVisible = useAppPreferencesStore(
    (s) => s.setCycleCardVisible
  );
  const hydrationCardVisible = useAppPreferencesStore(
    (s) => s.hydrationCardVisible
  );
  const setHydrationCardVisible = useAppPreferencesStore(
    (s) => s.setHydrationCardVisible
  );
  const caffeineCardVisible = useAppPreferencesStore(
    (s) => s.caffeineCardVisible
  );
  const setCaffeineCardVisible = useAppPreferencesStore(
    (s) => s.setCaffeineCardVisible
  );
  const askSparkyVisible = useAppPreferencesStore((s) => s.askSparkyVisible);
  const setAskSparkyVisible = useAppPreferencesStore(
    (s) => s.setAskSparkyVisible
  );
  const medicationsCardVisible = useAppPreferencesStore(
    (s) => s.medicationsCardVisible
  );
  const setMedicationsCardVisible = useAppPreferencesStore(
    (s) => s.setMedicationsCardVisible
  );
  const symptomsCardVisible = useAppPreferencesStore(
    (s) => s.symptomsCardVisible
  );
  const setSymptomsCardVisible = useAppPreferencesStore(
    (s) => s.setSymptomsCardVisible
  );
  const moodCardVisible = useAppPreferencesStore((s) => s.moodCardVisible);
  const setMoodCardVisible = useAppPreferencesStore(
    (s) => s.setMoodCardVisible
  );
  const progressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.progressPhotosCardVisible
  );
  const setProgressPhotosCardVisible = useAppPreferencesStore(
    (s) => s.setProgressPhotosCardVisible
  );
  const healthTrendsCardVisible = useAppPreferencesStore(
    (s) => s.healthTrendsCardVisible
  );
  const setHealthTrendsCardVisible = useAppPreferencesStore(
    (s) => s.setHealthTrendsCardVisible
  );
  const mindfulnessCardVisible = useAppPreferencesStore(
    (s) => s.mindfulnessCardVisible
  );
  const setMindfulnessCardVisible = useAppPreferencesStore(
    (s) => s.setMindfulnessCardVisible
  );

  const dashboardCardOrder = useAppPreferencesStore(
    (s) => s.dashboardCardOrder
  );
  const setDashboardCardOrder = useAppPreferencesStore(
    (s) => s.setDashboardCardOrder
  );

  const orderedCards = useMemo(
    () => resolveDashboardCardOrder(dashboardCardOrder),
    [dashboardCardOrder]
  );

  const cardVisibilityMap: Record<DashboardCardKey, boolean> = {
    calorieRing: calorieRingCardVisible,
    askSparky: askSparkyVisible,
    macros: macrosCardVisible,
    exercise: exerciseCardVisible,
    hydration: hydrationCardVisible,
    caffeine: caffeineCardVisible,
    fasting: fastingCardVisible,
    cycle: cycleCardVisible,
    medications: medicationsCardVisible,
    symptoms: symptomsCardVisible,
    mood: moodCardVisible,
    progressPhotos: progressPhotosCardVisible,
    healthTrends: healthTrendsCardVisible,
    mindfulness: mindfulnessCardVisible,
  };

  const setCardVisibility = useCallback(
    (key: DashboardCardKey, isVisible: boolean) => {
      switch (key) {
        case 'calorieRing':
          setCalorieRingCardVisible(isVisible);
          break;
        case 'askSparky':
          setAskSparkyVisible(isVisible);
          break;
        case 'macros':
          setMacrosCardVisible(isVisible);
          break;
        case 'exercise':
          setExerciseCardVisible(isVisible);
          break;
        case 'hydration':
          setHydrationCardVisible(isVisible);
          break;
        case 'caffeine':
          setCaffeineCardVisible(isVisible);
          break;
        case 'fasting':
          setFastingCardVisible(isVisible);
          break;
        case 'cycle':
          setCycleCardVisible(isVisible);
          break;
        case 'medications':
          setMedicationsCardVisible(isVisible);
          break;
        case 'symptoms':
          setSymptomsCardVisible(isVisible);
          break;
        case 'mood':
          setMoodCardVisible(isVisible);
          break;
        case 'progressPhotos':
          setProgressPhotosCardVisible(isVisible);
          break;
        case 'healthTrends':
          setHealthTrendsCardVisible(isVisible);
          break;
        case 'mindfulness':
          setMindfulnessCardVisible(isVisible);
          break;
      }
    },
    [
      setCalorieRingCardVisible,
      setAskSparkyVisible,
      setMacrosCardVisible,
      setExerciseCardVisible,
      setHydrationCardVisible,
      setCaffeineCardVisible,
      setFastingCardVisible,
      setCycleCardVisible,
      setMedicationsCardVisible,
      setSymptomsCardVisible,
      setMoodCardVisible,
      setProgressPhotosCardVisible,
      setHealthTrendsCardVisible,
      setMindfulnessCardVisible,
    ]
  );

  const { strides, offsets } = useReorderRowGeometry(
    orderedCards.length,
    DASHBOARD_CARD_ROW_HEIGHT
  );

  const activeDragIndex = useSharedValue(-1);
  const panY = useSharedValue(0);
  const committingTranslate = useSharedValue(0);
  const pendingDragResetRef = useRef(false);

  const targetIndex = useDerivedValue(() =>
    activeDragIndex.value < 0
      ? -1
      : computeReorderTargetIndex(
          strides,
          offsets,
          activeDragIndex.value,
          panY.value
        )
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const newOrder = moveItem(orderedCards, fromIndex, toIndex);
      pendingDragResetRef.current = true;
      setDashboardCardOrder(newOrder);
    },
    [orderedCards, setDashboardCardOrder]
  );

  // Release the floating transform only once the reordered rows have rendered, so
  // clearing it is a visual no-op instead of a one-frame snap-back.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetReorderDragPreview(activeDragIndex, panY, committingTranslate);
  }, [orderedCards, committingTranslate, activeDragIndex, panY]);

  const queryClient = useQueryClient();
  const { isConnected } = useServerConnection();
  const { customNutrients, isLoading: isCustomLoading } = useCustomNutrients({
    enabled: isConnected,
  });
  const { preferences, isLoading: isPrefsLoading } =
    useNutrientDisplayPreferences({ enabled: isConnected });

  const isLoading = isConnected && (isCustomLoading || isPrefsLoading);

  // Base array is the raw summary/mobile row (NOT the summaryNutrients getter,
  // which strips 'calories' — using it as the merge base would silently drop
  // calories from the stored row on every PUT). The server guarantees this row
  // exists once preferences resolve; the default is defensive only.
  const summaryRow = preferences.find(
    (p) => p.view_group === SUMMARY_VIEW_GROUP && p.platform === MOBILE_PLATFORM
  );
  const base =
    summaryRow?.visible_nutrients ?? SERVER_DEFAULT_SUMMARY_NUTRIENTS;

  const mutation = useMutation({
    mutationFn: (visibleNutrients: string[]) =>
      updateNutrientDisplayPreference(
        SUMMARY_VIEW_GROUP,
        MOBILE_PLATFORM,
        visibleNutrients
      ),
    onMutate: async (visibleNutrients) => {
      await queryClient.cancelQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
      const previous = queryClient.getQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey
      );
      queryClient.setQueryData<NutrientDisplayPreference[]>(
        nutrientDisplayPreferencesQueryKey,
        (old = []) => {
          const idx = old.findIndex(
            (p) =>
              p.view_group === SUMMARY_VIEW_GROUP &&
              p.platform === MOBILE_PLATFORM
          );
          if (idx >= 0) {
            return old.map((p, i) =>
              i === idx ? { ...p, visible_nutrients: visibleNutrients } : p
            );
          }
          return [
            ...old,
            {
              view_group: SUMMARY_VIEW_GROUP,
              platform: MOBILE_PLATFORM,
              visible_nutrients: visibleNutrients,
            },
          ];
        }
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          nutrientDisplayPreferencesQueryKey,
          context.previous
        );
      }
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('dashboardSettings.updateFailed', {
          defaultValue: 'Failed to update setting.',
        }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: nutrientDisplayPreferencesQueryKey,
      });
    },
  });

  const handleToggle = useCallback(
    (name: string, value: boolean) => {
      mutation.mutate(toggleNutrientVisibility(base, name, value));
    },
    [base, mutation]
  );

  const renderContent = () => {
    if (isLoading) {
      return <StatusView inline loading />;
    }

    if (customNutrients.length === 0) {
      return (
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-base font-semibold text-text-primary mb-2">
            {t('dashboardSettings.noCustomNutrients', {
              defaultValue: 'No custom nutrients',
            })}
          </Text>
          <Text className="text-text-secondary text-sm">
            {t('dashboardSettings.customNutrientsDescription', {
              defaultValue:
                'Custom nutrients are created in the SparkyFitness web app. Once you add some, they will appear here so you can choose which show on your Dashboard.',
            })}
          </Text>
        </View>
      );
    }

    return (
      <SettingsRowGroup>
        {customNutrients.map((cn) => (
          <SettingsRow
            key={cn.id}
            title={cn.name}
            subtitle={cn.unit}
            rightAccessory={
              <Switch
                accessibilityLabel={cn.name}
                value={base.includes(cn.name)}
                onValueChange={(value) => handleToggle(cn.name, value)}
              />
            }
          />
        ))}
      </SettingsRowGroup>
    );
  };

  const header = useScreenHeader({
    title: t('dashboardSettings.title', { defaultValue: 'Dashboard Settings' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('dashboardSettings.description', {
            defaultValue:
              'Drag a card by its handle to reorder your Dashboard. Toggle off to hide cards you do not use.',
          })}
        </Text>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm mb-6">
          {orderedCards.map((cardKey, index) => {
            const title = DASHBOARD_CARD_TITLES[cardKey](t);
            const subtitle = DASHBOARD_CARD_SUBTITLES[cardKey](t);
            return (
              <ReorderSwitchRow
                key={cardKey}
                testID={`dashboard-card-row-${cardKey}`}
                dragHandleTestID={`dashboard-card-drag-handle-${cardKey}`}
                switchTestID={`dashboard-card-switch-${cardKey}`}
                index={index}
                lastIndex={orderedCards.length - 1}
                title={title}
                subtitle={subtitle}
                isEnabled={cardVisibilityMap[cardKey]}
                onToggle={(enabled) => setCardVisibility(cardKey, enabled)}
                onMove={handleMove}
                onConfigure={
                  cardKey === 'healthTrends'
                    ? () => navigation.navigate('HealthTrendsSettings')
                    : undefined
                }
                configureTestID={`dashboard-card-configure-${cardKey}`}
                configureA11yLabel={t('dashboardSettings.configureCard', {
                  defaultValue: 'Configure {{name}}',
                  name: title,
                })}
                rowHeight={DASHBOARD_CARD_ROW_HEIGHT}
                reorderA11yLabel={t('dashboardSettings.reorder', {
                  defaultValue: 'Reorder {{name}}',
                  name: title,
                })}
                reorderA11yHint={t('dashboardSettings.reorderHint', {
                  defaultValue: 'Reorder this card on your Dashboard',
                })}
                activeDragIndex={activeDragIndex}
                panY={panY}
                committingTranslate={committingTranslate}
                targetIndex={targetIndex}
                strides={strides}
              />
            );
          })}
        </View>

        <Text className="text-base font-semibold text-text-primary mb-4">
          {t('dashboardSettings.customNutrientDisplay', {
            defaultValue: 'Custom Nutrient Display',
          })}
        </Text>

        {renderContent()}
      </ScrollView>
    </View>
  );
};

export default DashboardSettingsScreen;
