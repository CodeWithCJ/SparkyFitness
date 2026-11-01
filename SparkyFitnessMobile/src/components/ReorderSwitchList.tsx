import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { ReorderSwitchRow } from './ReorderSwitchRow';
import {
  computeReorderTargetIndex,
  REORDER_ROW_HEIGHT,
  resetReorderDragPreview,
  useReorderRowGeometry,
} from './WorkoutReorderList';
import { moveItem } from '../utils/reorderUtils';

export interface ReorderSwitchListItem<K extends string> {
  key: K;
  label: string;
  /** Shown before the label, e.g. an icon tile. */
  leading?: ReactNode;
  /** Shown under the label, e.g. a tappable choice. */
  detail?: ReactNode;
}

interface ReorderSwitchListProps<K extends string> {
  items: ReorderSwitchListItem<K>[];
  /** Prefix for the row, drag handle and switch test ids (`<prefix>-row-<key>`). */
  testIDPrefix: string;
  isEnabled: (key: K) => boolean;
  /** Locks a row's switch, e.g. the last item that must stay shown. */
  isSwitchDisabled?: (key: K) => boolean;
  onToggle: (key: K, enabled: boolean) => void;
  /** The whole list in its new order after a drag or accessibility move. */
  onReorder: (order: K[]) => void;
  reorderA11yLabel: (label: string) => string;
  reorderA11yHint: string;
}

/**
 * A card of rows that each carry a drag handle and a switch: drag to reorder,
 * toggle to show or hide. Every row shares `REORDER_ROW_HEIGHT` so the drag
 * geometry has a single stride. Owns its own drag state, so a screen can hold
 * more than one.
 */
export function ReorderSwitchList<K extends string>({
  items,
  testIDPrefix,
  isEnabled,
  isSwitchDisabled,
  onToggle,
  onReorder,
  reorderA11yLabel,
  reorderA11yHint,
}: ReorderSwitchListProps<K>) {
  const { strides, offsets } = useReorderRowGeometry(items.length);

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
      pendingDragResetRef.current = true;
      onReorder(
        moveItem(
          items.map((item) => item.key),
          fromIndex,
          toIndex
        )
      );
    },
    [items, onReorder]
  );

  // Release the floating transform only once the reordered rows have rendered,
  // so clearing it is a visual no-op instead of a one-frame snap-back.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetReorderDragPreview(activeDragIndex, panY, committingTranslate);
  }, [items, committingTranslate, activeDragIndex, panY]);

  return (
    <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
      {items.map(({ key, label, leading, detail }, index) => (
        <ReorderSwitchRow
          key={key}
          testID={`${testIDPrefix}-row-${key}`}
          dragHandleTestID={`${testIDPrefix}-drag-handle-${key}`}
          switchTestID={`${testIDPrefix}-switch-${key}`}
          index={index}
          lastIndex={items.length - 1}
          title={label}
          leading={leading}
          detail={detail}
          isEnabled={isEnabled(key)}
          switchDisabled={isSwitchDisabled?.(key) ?? false}
          onToggle={(enabled) => onToggle(key, enabled)}
          onMove={handleMove}
          rowHeight={REORDER_ROW_HEIGHT}
          reorderA11yLabel={reorderA11yLabel(label)}
          reorderA11yHint={reorderA11yHint}
          activeDragIndex={activeDragIndex}
          panY={panY}
          committingTranslate={committingTranslate}
          targetIndex={targetIndex}
          strides={strides}
        />
      ))}
    </View>
  );
}
