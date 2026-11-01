import AnchoredMenu, {
  type AnchorRect,
  type AnchoredMenuItem,
} from './AnchoredMenu';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_DROP_SET_COUNT,
  DEFAULT_DROP_SET_PERCENT,
} from '@workspace/shared';
import { SET_TYPE_OPTIONS } from '../utils/workoutSession';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';

/** Options and labels for the metric-column picker menu the header opens. */
const METRIC_OPTIONS: ActiveWorkoutMetricColumn[] = [
  'rpe',
  'rir',
  'volume',
  'e1rm',
  'tenrm',
];

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
  const { t } = useTranslation();
  const metricColumn = useAppPreferencesStore(
    (s) => s.activeWorkoutMetricColumn
  );
  const setMetricColumn = useAppPreferencesStore(
    (s) => s.setActiveWorkoutMetricColumn
  );
  const options = METRIC_OPTIONS.filter(
    (o) =>
      (includeRpe || (o !== 'rpe' && o !== 'rir')) &&
      (includeWeightMetrics || o === 'rpe' || o === 'rir')
  );
  const effectiveColumn = !includeWeightMetrics
    ? 'rpe'
    : !includeRpe && (metricColumn === 'rpe' || metricColumn === 'rir')
      ? 'volume'
      : metricColumn;
  const metricLabel = (option: ActiveWorkoutMetricColumn): string => {
    switch (option) {
      case 'rpe':
        return t('workout.metricRpe', { defaultValue: 'RPE' });
      case 'rir':
        return t('workout.metricRir', { defaultValue: 'RIR' });
      case 'volume':
        return t('workout.metricVolume', { defaultValue: 'Volume' });
      case 'e1rm':
        return t('workout.metricE1rm', { defaultValue: 'Est. 1RM' });
      case 'tenrm':
        return t('workout.metricTenrm', { defaultValue: 'Est. 10RM' });
    }
  };
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
            ? `✓ ${metricLabel(option)}`
            : metricLabel(option),
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
  onGenerateDropSets,
  onOpenPlateCalculator,
}: {
  anchor: AnchorRect | null;
  /** The target set's current type; null/undefined reads as 'normal'. */
  currentType: string | null | undefined;
  onClose: () => void;
  onSelect: (type: (typeof SET_TYPE_OPTIONS)[number]) => void;
  onDelete?: () => void;
  onGenerateDropSets?: () => void;
  /** Offered for barbell-style exercises; opens the plate calculator. */
  onOpenPlateCalculator?: () => void;
}) {
  const { t } = useTranslation();
  const typeLabels: Record<string, string> = {
    normal: t('workout.setTypeNormal', { defaultValue: 'Normal' }),
    warmup: t('workout.setTypeWarmup', { defaultValue: 'Warm-up' }),
    drop: t('workout.setTypeDropSet', { defaultValue: 'Drop set' }),
    failure: t('workout.setTypeFailure', { defaultValue: 'Failure' }),
  };
  const current = currentType ?? 'normal';
  const items: AnchoredMenuItem[] = SET_TYPE_OPTIONS.map((type) => ({
    key: type,
    // i18n-audit-ignore-next-line hardcoded-ui-text -- checkmark is a UI glyph; translated semantic label follows.
    label: `${type === current ? '✓ ' : ''}${typeLabels[type] ?? type}`,
    onPress: () => onSelect(type),
  }));
  if (onGenerateDropSets) {
    items.push({
      key: 'generate-dropsets',
      label: t('workout.addDropSets', {
        sets: DEFAULT_DROP_SET_COUNT,
        percent: DEFAULT_DROP_SET_PERCENT,
        defaultValue: 'Add {{sets}} drop sets (-{{percent}}%)',
      }),
      icon: 'add-circle',
      onPress: onGenerateDropSets,
    });
  }
  if (onOpenPlateCalculator) {
    items.push({
      key: 'plate-calculator',
      label: t('plates.calculatorTitle', { defaultValue: 'Plate calculator' }),
      icon: 'exercise-weights',
      onPress: onOpenPlateCalculator,
    });
  }
  if (onDelete) {
    items.push({
      key: 'delete',
      label: t('workout.deleteSet', { defaultValue: 'Delete set' }),
      icon: 'trash',
      onPress: onDelete,
    });
  }
  return (
    <AnchoredMenu
      visible={anchor != null}
      anchor={anchor}
      onClose={onClose}
      minWidth={200}
      items={items}
    />
  );
}
