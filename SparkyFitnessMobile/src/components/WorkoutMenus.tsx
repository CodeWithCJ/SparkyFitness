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
 * `includeRpe: false` (preset surfaces — preset sets store no RPE) drops the
 * RPE option and shows an 'rpe' selection as Volume.
 * `includeWeightMetrics: false` (duration-like tables, whose cards clamp the
 * column to RPE) drops the weight-derived options instead — selecting one
 * would silently change the preference for every other card while this card
 * kept showing RPE.
 */
export function MetricColumnMenu({
  anchor,
  onClose,
  includeRpe = true,
  includeWeightMetrics = true,
}: {
  anchor: AnchorRect | null;
  onClose: () => void;
  includeRpe?: boolean;
  includeWeightMetrics?: boolean;
}) {
  const metricColumn = useAppPreferencesStore((s) => s.activeWorkoutMetricColumn);
  const setMetricColumn = useAppPreferencesStore((s) => s.setActiveWorkoutMetricColumn);
  const options = METRIC_OPTIONS.filter(
    (o) => (includeRpe || o !== 'rpe') && (includeWeightMetrics || o === 'rpe'),
  );
  const effectiveColumn = !includeWeightMetrics
    ? 'rpe'
    : !includeRpe && metricColumn === 'rpe'
      ? 'volume'
      : metricColumn;
  if (options.length === 0) return null;
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
 * The set-type picker anchored off a set number: every type with the current
 * one check-marked, plus an optional Delete-set item (the form surfaces —
 * active edit rows have no swipe-to-delete). Callers that omit `onDelete` don't
 * get its item, so form surfaces stay unchanged.
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
