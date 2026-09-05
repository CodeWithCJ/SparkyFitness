import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import {
  computeReorderPreviewShift,
  computeReorderTargetIndex,
} from '../components/WorkoutReorderList';
import {
  HEALTH_TREND_LABELS,
  type HealthTrendKey,
} from '../constants/healthTrends';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  applyHealthTrendRowMove,
  buildHealthTrendRows,
  HEALTH_TREND_DIVIDER,
  resolveHealthTrendOrder,
  type HealthTrendRow,
} from '../utils/healthTrendPreferences';

type HealthTrendsSettingsScreenProps =
  RootStackScreenProps<'HealthTrendsSettings'>;

// Every row shares one height, including the divider, so the drag geometry has a single
// stride and the shared reorder worklets stay exact.
const ROW_HEIGHT = 64;
const ROW_GAP = 0;
const LONG_PRESS_MS = 150;

function useTrendRowDragPreviewStyle(
  rowIndex: number,
  activeDragIndex: SharedValue<number>,
  panY: SharedValue<number>,
  committingTranslate: SharedValue<number>,
  targetIndex: SharedValue<number>,
  strides: number[]
) {
  return useAnimatedStyle(() => {
    const active = activeDragIndex.value;
    if (active === rowIndex) {
      const translateY =
        committingTranslate.value !== 0
          ? committingTranslate.value
          : panY.value;
      return {
        transform: [{ translateY }, { scale: 1.02 }],
        zIndex: 10,
        elevation: 8,
        shadowOpacity: 0.16,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
      };
    }
    // Reanimated applies animated styles as diffs, so the lift shadow must be zeroed in
    // every non-dragged branch.
    if (active < 0) {
      return {
        transform: [{ translateY: 0 }, { scale: 1 }],
        zIndex: 0,
        elevation: 0,
        shadowOpacity: 0,
      };
    }
    const shift = computeReorderPreviewShift(
      rowIndex,
      active,
      targetIndex.value,
      strides[active]
    );
    return {
      transform: [
        { translateY: withSpring(shift, { damping: 44, stiffness: 960 }) },
        { scale: 1 },
      ],
      zIndex: 0,
      elevation: 0,
      shadowOpacity: 0,
    };
  });
}

const HealthTrendListRow: React.FC<{
  trendKey: HealthTrendKey;
  index: number;
  lastIndex: number;
  label: string;
  isHidden: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  textMuted: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
}> = ({
  trendKey,
  index,
  lastIndex,
  label,
  isHidden,
  onMove,
  textMuted,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const { t } = useTranslation();

  const dragGesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart(() => {
      activeDragIndex.value = index;
      panY.value = 0;
    })
    .onUpdate((event) => {
      panY.value = event.translationY;
    })
    .onEnd(() => {
      const from = activeDragIndex.value;
      const to = targetIndex.value;
      if (from >= 0 && from !== to) {
        // Keep the final translate while the move commits so the row does not snap back
        // to its origin before React re-renders it.
        committingTranslate.value = panY.value;
        runOnJS(onMove)(from, to);
        return;
      }
      activeDragIndex.value = -1;
      panY.value = 0;
    });

  const previewStyle = useTrendRowDragPreviewStyle(
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    strides
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      onMove(index, Math.min(index + 1, lastIndex));
      return;
    }
    if (event.nativeEvent.actionName === 'decrement') {
      onMove(index, Math.max(index - 1, 0));
    }
  };

  return (
    <Animated.View
      testID={`health-trend-row-${trendKey}`}
      className="flex-row items-center bg-surface border-b border-border/40"
      style={[previewStyle, { height: ROW_HEIGHT }]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          testID={`health-trend-drag-handle-${trendKey}`}
          className="px-4 py-3"
          accessibilityRole="adjustable"
          accessibilityLabel={t('healthTrendsSettings.reorder', {
            defaultValue: 'Reorder {{name}}',
            name: label,
          })}
          accessibilityValue={{
            text: isHidden
              ? t('healthTrendsSettings.stateHidden', {
                  defaultValue: 'Hidden',
                })
              : t('healthTrendsSettings.stateShown', { defaultValue: 'Shown' }),
          }}
          accessibilityHint={t('healthTrendsSettings.reorderHint', {
            defaultValue:
              'Move below the Hidden line to hide this graph, or above it to show it',
          })}
          accessibilityActions={[
            {
              name: 'decrement',
              label: t('healthTrendsSettings.moveUp', {
                defaultValue: 'Move up',
              }),
            },
            {
              name: 'increment',
              label: t('healthTrendsSettings.moveDown', {
                defaultValue: 'Move down',
              }),
            },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <Icon name="reorder-handle" size={22} color={textMuted} />
        </View>
      </GestureDetector>

      <Text
        className={`flex-1 pr-4 text-base font-medium ${
          isHidden ? 'text-text-muted' : 'text-text-primary'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Animated.View>
  );
};

const HiddenDividerRow: React.FC<{
  index: number;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
}> = ({
  index,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const { t } = useTranslation();

  // Animated so it shifts with its neighbours during a drag, but it carries no gesture:
  // the divider is a fixed landmark, never the dragged row.
  const previewStyle = useTrendRowDragPreviewStyle(
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    strides
  );

  return (
    <Animated.View
      testID="health-trend-divider"
      className="flex-row items-center bg-background px-4"
      style={[previewStyle, { height: ROW_HEIGHT }]}
    >
      <View className="h-px flex-1 bg-border" />
      <Text className="mx-3 text-xs font-bold uppercase tracking-wider text-text-secondary">
        {t('healthTrendsSettings.hiddenLabel', { defaultValue: 'Hidden' })}
      </Text>
      <View className="h-px flex-1 bg-border" />
    </Animated.View>
  );
};

const HealthTrendsSettingsScreen: React.FC<
  HealthTrendsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const textMuted = String(useCSSVariable('--color-text-muted'));

  const healthTrendOrder = useAppPreferencesStore((s) => s.healthTrendOrder);
  const hiddenHealthTrends = useAppPreferencesStore(
    (s) => s.hiddenHealthTrends
  );
  const setHealthTrendLayout = useAppPreferencesStore(
    (s) => s.setHealthTrendLayout
  );

  const rows = useMemo(
    () =>
      buildHealthTrendRows(
        resolveHealthTrendOrder(healthTrendOrder),
        hiddenHealthTrends
      ),
    [healthTrendOrder, hiddenHealthTrends]
  );

  const strides = rows.map(() => ROW_HEIGHT + ROW_GAP);
  const offsets = useMemo(() => {
    const rowOffsets: number[] = [];
    let runningOffset = 0;
    for (const stride of strides) {
      rowOffsets.push(runningOffset);
      runningOffset += stride;
    }
    return rowOffsets;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

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
      const { order, hiddenKeys } = applyHealthTrendRowMove(
        rows,
        fromIndex,
        toIndex
      );
      pendingDragResetRef.current = true;
      setHealthTrendLayout(order, hiddenKeys);
    },
    [rows, setHealthTrendLayout]
  );

  // Release the floating transform only once the reordered rows have rendered, so
  // clearing it is a visual no-op instead of a one-frame snap-back.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    committingTranslate.value = 0;
    activeDragIndex.value = -1;
    panY.value = 0;
  }, [rows, committingTranslate, activeDragIndex, panY]);

  const dividerIndex = rows.indexOf(HEALTH_TREND_DIVIDER);
  const hasShownTrends = dividerIndex > 0;
  const hasHiddenTrends = dividerIndex < rows.length - 1;

  const header = useScreenHeader({
    title: t('screens.healthTrendsSettings', { defaultValue: 'Health Trends' }),
    left: { kind: 'back' },
  });

  const renderRow = (row: HealthTrendRow, index: number) => {
    if (row === HEALTH_TREND_DIVIDER) {
      return (
        <HiddenDividerRow
          key={HEALTH_TREND_DIVIDER}
          index={index}
          activeDragIndex={activeDragIndex}
          panY={panY}
          committingTranslate={committingTranslate}
          targetIndex={targetIndex}
          strides={strides}
        />
      );
    }

    return (
      <HealthTrendListRow
        key={row}
        trendKey={row}
        index={index}
        lastIndex={rows.length - 1}
        label={HEALTH_TREND_LABELS[row](t)}
        isHidden={index > dividerIndex}
        onMove={handleMove}
        textMuted={textMuted}
        activeDragIndex={activeDragIndex}
        panY={panY}
        committingTranslate={committingTranslate}
        targetIndex={targetIndex}
        strides={strides}
      />
    );
  };

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
          {t('healthTrendsSettings.description', {
            defaultValue:
              'Drag a graph by its handle to reorder it. Drop it below the Hidden line to take it off the Dashboard.',
          })}
        </Text>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {!hasShownTrends && (
            <Text
              testID="health-trend-empty-shown"
              className="text-text-muted text-sm text-center px-4 py-4"
            >
              {t('healthTrendsSettings.emptyShown', {
                defaultValue:
                  'No graphs are shown. Drag one above the line to bring it back.',
              })}
            </Text>
          )}

          {rows.map(renderRow)}

          {!hasHiddenTrends && (
            <Text
              testID="health-trend-empty-hidden"
              className="text-text-muted text-sm text-center px-4 py-4"
            >
              {t('healthTrendsSettings.emptyHidden', {
                defaultValue: 'Drop a graph here to hide it.',
              })}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default HealthTrendsSettingsScreen;
