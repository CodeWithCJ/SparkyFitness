import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_DROP_SET_COUNT,
  DEFAULT_DROP_SET_PERCENT,
} from '@workspace/shared';

import FocusPage from './FocusPage';
import Icon from './Icon';
import WorkoutNotesField from './WorkoutNotesField';
import type { ActiveSetPatch } from '../stores/activeWorkoutStore';
import type { ActiveWorkoutMetricColumn } from '../stores/appPreferencesStore';
import { SET_TYPE_OPTIONS } from '../utils/workoutSession';

type SetType = (typeof SET_TYPE_OPTIONS)[number];

/** Board order: Normal and Warm-up on the first line, Drop set and Failure on the second. */
const TYPE_ORDER: SetType[] = ['normal', 'warmup', 'drop', 'failure'];
const METRICS_TOP: ActiveWorkoutMetricColumn[] = ['rpe', 'rir'];
const METRICS_DERIVED: ActiveWorkoutMetricColumn[] = [
  'volume',
  'e1rm',
  'tenrm',
];

interface Props {
  visible: boolean;
  setId: string;
  setNumber: number;
  exerciseName: string;
  currentType: string | null | undefined;
  note: string | null | undefined;
  metricColumn: ActiveWorkoutMetricColumn;
  /** Duration-like tables clamp the column to RPE; weight metrics are hidden. */
  clampedToRpe: boolean;
  onSelectType: (type: SetType) => void;
  onSelectMetric: (metric: ActiveWorkoutMetricColumn) => void;
  onCommitField: (setId: string, patch: ActiveSetPatch) => void;
  onGenerateDropSets?: () => void;
  onOpenPlateCalculator?: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2 rounded-3xl bg-surface p-3.5">
      <Text className="px-1 pt-1 text-[13px] font-extrabold uppercase tracking-wider text-text-secondary">
        {title}
      </Text>
      {children}
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
  half,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  half?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`h-11 items-center justify-center rounded-full ${half ? 'basis-[48%]' : 'flex-1'} ${selected ? 'bg-accent-primary' : ''} active:opacity-70`}
    >
      <Text
        className={`text-[17px] font-bold ${selected ? 'text-white' : 'text-text-secondary'}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function RowButton({
  label,
  icon,
  danger,
  onPress,
  testID,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      className="h-12 flex-row items-center justify-between rounded-2xl bg-raised px-4 active:opacity-70"
    >
      <Text
        className={`text-[17px] font-bold ${danger ? 'text-text-danger-subtle' : 'text-text-primary'}`}
      >
        {label}
      </Text>
      {icon}
    </Pressable>
  );
}

/**
 * The focus view's Set options page (Phone-SetOptions board), opened from a
 * set number: set type, add drop sets, plate calculator and delete, the
 * metric column, and the set's note. Same actions and handlers as the anchored
 * Set type menu the list view keeps.
 */
function FocusSetOptionsPage({
  visible,
  setId,
  setNumber,
  exerciseName,
  currentType,
  note,
  metricColumn,
  clampedToRpe,
  onSelectType,
  onSelectMetric,
  onCommitField,
  onGenerateDropSets,
  onOpenPlateCalculator,
  onDelete,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [textPrimary, danger] = useCSSVariable([
    '--color-text-primary',
    '--color-text-danger-subtle',
  ]) as [string, string];
  const typeLabels: Record<SetType, string> = {
    normal: t('workout.setTypeNormal', { defaultValue: 'Normal' }),
    warmup: t('workout.setTypeWarmup', { defaultValue: 'Warm-up' }),
    drop: t('workout.setTypeDropSet', { defaultValue: 'Drop set' }),
    failure: t('workout.setTypeFailure', { defaultValue: 'Failure' }),
  };
  const metricLabels: Record<ActiveWorkoutMetricColumn, string> = {
    rpe: t('workout.metricRpe', { defaultValue: 'RPE' }),
    rir: t('workout.metricRir', { defaultValue: 'RIR' }),
    volume: t('activeWorkout.focus.setOptions.volume', {
      defaultValue: 'Vol',
    }),
    e1rm: t('activeWorkout.focus.setOptions.e1rm', { defaultValue: '1RM' }),
    tenrm: t('activeWorkout.focus.setOptions.tenrm', {
      defaultValue: '10RM',
    }),
  };
  // An unknown stored type reads as a normal set, as the set number's letter does.
  const current: SetType = TYPE_ORDER.includes(currentType as SetType)
    ? (currentType as SetType)
    : 'normal';
  const effectiveMetric = clampedToRpe ? 'rpe' : metricColumn;

  return (
    <FocusPage
      visible={visible}
      onClose={onClose}
      title={t('activeWorkout.focus.setOptions.title', {
        defaultValue: 'Set {{number}} · {{name}}',
        number: setNumber,
        name: exerciseName,
      })}
    >
      <Card
        title={t('activeWorkout.focus.setOptions.setType', {
          defaultValue: 'Set type',
        })}
      >
        <View className="flex-row flex-wrap justify-between gap-y-1.5">
          {TYPE_ORDER.map((type) => (
            <Segment
              key={type}
              half
              label={typeLabels[type]}
              selected={type === current}
              onPress={() => onSelectType(type)}
            />
          ))}
        </View>
        {onGenerateDropSets != null && (
          <RowButton
            testID="focus-set-options-drop-sets"
            onPress={onGenerateDropSets}
            label={t('workout.addDropSets', {
              sets: DEFAULT_DROP_SET_COUNT,
              percent: DEFAULT_DROP_SET_PERCENT,
              defaultValue: 'Add {{sets}} drop sets (-{{percent}}%)',
            })}
            icon={<Icon name="chevron-forward" size={18} color={textPrimary} />}
          />
        )}
        {onOpenPlateCalculator != null && (
          <RowButton
            testID="focus-set-options-plates"
            onPress={onOpenPlateCalculator}
            label={t('plates.calculatorTitle', {
              defaultValue: 'Plate calculator',
            })}
            icon={
              <Icon name="exercise-weights" size={20} color={textPrimary} />
            }
          />
        )}
        <RowButton
          testID="focus-set-options-delete"
          danger
          onPress={onDelete}
          label={t('workout.deleteSet', { defaultValue: 'Delete set' })}
          icon={<Icon name="close" size={18} color={danger} />}
        />
      </Card>

      <Card
        title={t('activeWorkout.focus.setOptions.metricColumn', {
          defaultValue: 'Metric column',
        })}
      >
        <View className="flex-row gap-1.5">
          {METRICS_TOP.map((metric) => (
            <Segment
              key={metric}
              label={metricLabels[metric]}
              selected={metric === effectiveMetric}
              onPress={() => onSelectMetric(metric)}
            />
          ))}
        </View>
        {!clampedToRpe && (
          <>
            <View className="flex-row gap-1.5">
              {METRICS_DERIVED.map((metric) => (
                <Segment
                  key={metric}
                  label={metricLabels[metric]}
                  selected={metric === effectiveMetric}
                  onPress={() => onSelectMetric(metric)}
                />
              ))}
            </View>
            <Text className="px-1 text-[15px] text-text-secondary">
              {t('activeWorkout.focus.setOptions.metricHint', {
                defaultValue:
                  'Vol, 1RM and 10RM are calculated from weight and reps.',
              })}
            </Text>
          </>
        )}
      </Card>

      <Card
        title={t('activeWorkout.focus.setOptions.setDetail', {
          defaultValue: 'Set detail',
        })}
      >
        <WorkoutNotesField
          value={note}
          onCommit={(text) => {
            const trimmed = text.trim();
            const next = trimmed.length > 0 ? trimmed : null;
            if ((note ?? null) === next) return;
            onCommitField(setId, { notes: next });
          }}
          label={t('activeWorkout.setDetail.notes', {
            defaultValue: 'Set notes',
          })}
          placeholder={t('activeWorkout.setDetail.addNote', {
            defaultValue: 'Add a note for this set…',
          })}
          accessibilityLabel={t('activeWorkout.setDetail.notesForSet', {
            defaultValue: 'Notes for set {{setNumber}}',
            setNumber,
          })}
        />
      </Card>
    </FocusPage>
  );
}

export default React.memo(FocusSetOptionsPage);
