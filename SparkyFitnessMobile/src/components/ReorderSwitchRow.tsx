import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { type SharedValue } from 'react-native-reanimated';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import Switch from './ui/Switch';
import {
  createReorderRowPanGesture,
  useReorderRowPreviewStyle,
} from './WorkoutReorderList';

export interface ReorderSwitchRowProps {
  testID: string;
  dragHandleTestID: string;
  switchTestID: string;
  index: number;
  lastIndex: number;
  title: string;
  subtitle?: string;
  /** Shown between the drag handle and the title, e.g. an icon tile. */
  leading?: React.ReactNode;
  /** Shown under the title, where `subtitle` would be, e.g. a tappable choice. */
  detail?: React.ReactNode;
  isEnabled: boolean;
  /** Locks the switch, e.g. on the last item that must stay shown. */
  switchDisabled?: boolean;
  onToggle: (enabled: boolean) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onConfigure?: () => void;
  configureTestID?: string;
  configureA11yLabel?: string;
  rowHeight: number;
  reorderA11yLabel: string;
  reorderA11yHint: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
}

export const ReorderSwitchRow: React.FC<ReorderSwitchRowProps> = ({
  testID,
  dragHandleTestID,
  switchTestID,
  index,
  lastIndex,
  title,
  subtitle,
  leading,
  detail,
  isEnabled,
  switchDisabled = false,
  onToggle,
  onMove,
  onConfigure,
  configureTestID,
  configureA11yLabel,
  rowHeight,
  reorderA11yLabel,
  reorderA11yHint,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const { t } = useTranslation();
  const textMuted = String(useCSSVariable('--color-text-muted'));
  const accentColor = String(useCSSVariable('--color-accent-primary'));

  const dragGesture = createReorderRowPanGesture({
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    onMove,
  });

  const previewStyle = useReorderRowPreviewStyle(
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
      testID={testID}
      className="flex-row items-center bg-surface border-b border-border/40 pr-4"
      style={[previewStyle, { height: rowHeight }]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          testID={dragHandleTestID}
          className="px-4 py-3"
          accessibilityRole="adjustable"
          accessibilityLabel={reorderA11yLabel}
          accessibilityValue={{
            text: isEnabled
              ? t('dashboardSettings.stateShown', { defaultValue: 'Shown' })
              : t('dashboardSettings.stateHidden', {
                  defaultValue: 'Hidden',
                }),
          }}
          accessibilityHint={reorderA11yHint}
          accessibilityActions={[
            {
              name: 'decrement',
              label: t('dashboardSettings.moveUp', {
                defaultValue: 'Move up',
              }),
            },
            {
              name: 'increment',
              label: t('dashboardSettings.moveDown', {
                defaultValue: 'Move down',
              }),
            },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <Icon name="reorder-handle" size={22} color={textMuted} />
        </View>
      </GestureDetector>

      {leading ? <View className="mr-3">{leading}</View> : null}

      <View className="flex-1 pr-3 justify-center">
        <View className="flex-row items-center">
          <Text
            className={`text-base font-medium ${
              isEnabled ? 'text-text-primary' : 'text-text-muted'
            }`}
            numberOfLines={1}
          >
            {title}
          </Text>
          {onConfigure && (
            <Pressable
              onPress={onConfigure}
              testID={configureTestID}
              hitSlop={8}
              className="ml-2 px-1 py-0.5"
              accessibilityRole="button"
              accessibilityLabel={configureA11yLabel}
            >
              <Icon name="chevron-forward" size={16} color={accentColor} />
            </Pressable>
          )}
        </View>
        {detail ?? null}
        {subtitle ? (
          <Text
            className="text-xs text-text-secondary mt-0.5"
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {/* Its own full-height column so the switch keeps its natural size
          and sits in the middle. Left as a direct row child it was sized to
          the whole row, and iOS draws the switch at the top of its frame. */}
      <View style={{ height: rowHeight }} className="justify-center">
        <Switch
          accessibilityLabel={title}
          value={isEnabled}
          disabled={switchDisabled}
          onValueChange={onToggle}
          testID={switchTestID}
        />
      </View>
    </Animated.View>
  );
};
