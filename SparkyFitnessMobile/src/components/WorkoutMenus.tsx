import AnchoredMenu, { type AnchorRect, type AnchoredMenuItem } from './AnchoredMenu';
import { SET_TYPE_OPTIONS } from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

/** Options and labels for the metric-column picker menu the header opens. */
const METRIC_OPTIONS: ActiveWorkoutMetricColumn[] = ['rpe', 'volume', 'e1rm', 'tenrm'];

const METRIC_MENU_LABELS: Record<ActiveWorkoutMetricColumn, string> = {
  rpe: 'RPE',
  volume: 'Volume',
  e1rm: 'Est. 1RM',
  tenrm: 'Est. 10RM',
};

/**
 * The anchored menus shared by every workout card surface (live screen,
 * detail views, form lists). Separate from ActiveWorkoutExerciseCard so tests
 * that mock the card module keep the real menus.
 */

/**
 * The metric-column picker anchored off the card's metric header. Owns the
 * shared preference read/write; callers only manage the anchor.
 * `includeRpe: false` (preset form — preset sets store no RPE) drops the RPE
 * option and shows an 'rpe' selection as Volume.
 */
export function MetricColumnMenu({
  anchor,
  onClose,
  includeRpe = true,
}: {
  anchor: AnchorRect | null;
  onClose: () => void;
  includeRpe?: boolean;
}) {
  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const setMetricColumn = useAppPreferencesStore((s) => s.setActiveWorkoutMetricColumn);
  const options = includeRpe ? METRIC_OPTIONS : METRIC_OPTIONS.filter((o) => o !== 'rpe');
  const effectiveColumn = !includeRpe && metricColumn === 'rpe' ? 'volume' : metricColumn;
  return (
    <AnchoredMenu
      visible={anchor != null}
      anchor={anchor}
      onClose={onClose}
      minWidth={160}
      items={options.map((option) => ({
        key: option,
        label:
          option === effectiveColumn
            ? `✓ ${METRIC_MENU_LABELS[option]}`
            : METRIC_MENU_LABELS[option],
        onPress: () => setMetricColumn(option),
      }))}
    />
  );
}

/**
 * The set-type picker anchored off a set number (or a long-pressed row):
 * every type with the current one check-marked, plus an optional Delete-set
 * item (the form surfaces — active edit rows have no swipe-to-delete).
 */
export function SetTypeMenu({
  anchor,
  currentType,
  onClose,
  onSelect,
  onDelete,
}: {
  anchor: AnchorRect | null;
  /** The target set's current type; null/undefined reads as 'normal'. */
  currentType: string | null | undefined;
  onClose: () => void;
  onSelect: (type: (typeof SET_TYPE_OPTIONS)[number]) => void;
  onDelete?: () => void;
}) {
  const current = currentType ?? 'normal';
  const items: AnchoredMenuItem[] = SET_TYPE_OPTIONS.map((type) => ({
    key: type,
    label: `${type === current ? '✓ ' : ''}${type.charAt(0).toUpperCase()}${type.slice(1)}`,
    onPress: () => onSelect(type),
  }));
  if (onDelete) {
    items.push({ key: 'delete', label: 'Delete set', icon: 'trash', onPress: onDelete });
  }
  return (
    <AnchoredMenu
      visible={anchor != null}
      anchor={anchor}
      onClose={onClose}
      minWidth={180}
      items={items}
    />
  );
}
